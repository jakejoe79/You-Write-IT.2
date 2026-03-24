const express = require('express');
const router = express.Router();
const { getGenre } = require('../config/genreProfiles');
const { getStyleGuidelines } = require('../config/styleMapper');
const { getVariation } = require('../services/agents/styleVariance');
const { buildConstraintBlock, checkHardViolations, validateEdit } = require('../utils/constraints');
const { updateEmotion, describeEmotion, emptyEmotionState, applyGenreBias } = require('../utils/emotionState');
const { ContextWindow } = require('../services/core/memoryCompressor');
const { getVoiceBlock } = require('../characters/voiceProfiles');
const { generateAndValidate } = require('../services/agents/sceneValidator');
const { checkContinuity } = require('../services/agents/continuity');
const { createSession, addScene, updateSessionState, getSession, getScenes, updateSceneContent, getChapter, getChapterState, getChapterId, addRevision, getRevisions, getChapters } = require('../db/sqlite');
const { LLMChain } = require('langchain/chains');
const { PromptTemplate } = require('@langchain/core/prompts');
const { llm } = require('../services/core/llm');
const { chunk } = require('../utils/chunker');
const { SSEManager, generateEventId, clearBuffer } = require('../services/core/sseManager');
const { nextGeneration, getCurrentGeneration, assertValidGeneration, generationMap, resetGeneration } = require('../services/core/concurrency');
const { logger } = require('../services/core/tracing');
const { checkRateLimit, getRemaining } = require('../services/core/rateLimiter');
const ChapterAccumulator = require('../utils/chapterAccumulator');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const writerPrompt = fs.readFileSync(path.resolve(__dirname, '../../prompts/writer.txt'), 'utf8');
const abridgedPrompt = fs.readFileSync(path.resolve(__dirname, '../../../prompts/abridged.txt'), 'utf8');
const adventurePrompt = fs.readFileSync(path.resolve(__dirname, '../../../prompts/adventure.txt'), 'utf8');

const sceneChain = new LLMChain({
  llm,
  prompt: PromptTemplate.fromTemplate(`
${writerPrompt}
{genreRules}
{styleGuidelines}
Scene number: {sceneNum} of {totalScenes}
{constraints}
{voice}
Scene direction: {variation}
Emotional state: {emotion}
Story context so far:
{context}
Write scene {sceneNum}:
{input}
  `.trim()),
});

const summarizeChain = new LLMChain({
  llm,
  prompt: PromptTemplate.fromTemplate(`
${abridgedPrompt}
Narrative threads to maintain throughout (do NOT lose these):
- Characters: {characters}
- Themes: {themes}
- Key events so far: {key_events}
- Tone: {tone}
Reader level guidance: {levelGuidance}
Previous summary (for context):
{prevSummary}
Passage to summarize:
{passage}
  `.trim()),
});

const hookChain = new LLMChain({
  llm,
  prompt: PromptTemplate.fromTemplate(`
You are writing the final line of a chapter in an abridged book.
It should make the reader want to turn the page immediately.
Do NOT summarize. Do NOT resolve. Create forward momentum.
Reader level: {levelGuidance}
Tone: {tone}
What just happened in this chapter:
{summary}
Write ONE compelling closing line only. No explanation.
  `.trim()),
});

const branchChain = new LLMChain({
  llm,
  prompt: PromptTemplate.fromTemplate(`
${adventurePrompt}
Story setup:
{input}
{constraints}
Current world state (you MUST respect this — do not contradict it):
{state}
What changed since the last branch (treat these as hard facts):
{diff}
Scene direction: {variation}
You are writing branch {branchNum} of {totalBranches}.
This branch should be meaningfully different from the others in: consequence, tone, or direction.
Previously generated branches (for contrast — do NOT repeat them):
{previousBranches}
Write branch {branchNum}:
  `.trim()),
});

const READING_LEVELS = {
  middle_school: 'Use simple vocabulary and short sentences. Avoid complex metaphors. Aim for clarity over style.',
  high_school:   'Use clear language with moderate complexity. Some literary devices are fine.',
  adult:         'No restrictions on vocabulary or complexity. Preserve the author\'s original style.',
  esl:           'Use simple, direct language. Avoid idioms, slang, and culturally specific references. Short sentences.',
};

function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function parseThreads(raw) {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  } catch { return null; }
}

// POST /api/stream/story — streams chapters as SSE with chapter accumulation
router.post('/story', async (req, res) => {
  const { input, chapters = 5, genre = null, authorStyle = null, protagonist = null, sessionId = null, resumeFrom = null } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const id = sessionId || await createSession({
    mode: 'story', title: input?.slice(0, 50), genre, authorStyle, protagonist,
    state: { characters: {}, inventory: [], choices_made: [], world_rules: [] },
  });

  // 🔥 Client disconnect handling - guaranteed cleanup
  req.on('close', () => {
    logger.info('Client disconnected', { sessionId: id });
    try {
      clearBuffer(id);
      resetGeneration(id);
    } catch (err) {
      logger.error('SSE cleanup on disconnect failed', { sessionId: id, error: err.message });
    }
  });

  try {
    // Check for resume
    let startChapter = 0;
    if (resumeFrom && sessionId) {
      const position = await SSEManager.getResumePosition(sessionId);
      if (position && position.fromIndex > 0) {
        startChapter = position.fromIndex;
      }
    }

    const id = sessionId || await createSession({
      mode: 'story', title: input?.slice(0, 50), genre, authorStyle, protagonist,
      state: { characters: {}, inventory: [], choices_made: [], world_rules: [] },
    });

    const genreProfile = getGenre(genre);
    const genreRules = genre ? require('../config/genreProfiles').getGenreConstraints(genre) : '';
    const styleGuidelines = authorStyle ? getStyleGuidelines(authorStyle) : '';
    const constraints = buildConstraintBlock(genre ? genreProfile.hardConstraints : []);
    const voice = getVoiceBlock(protagonist);
    const memory = new ContextWindow({ rawWindow: 3 });
    let emotionState = applyGenreBias(emptyEmotionState(), genreProfile.emotionBias || {});
    const rawChapters = [];

    // Chapter accumulator: buffer chunks until ~3000-5000 words
    const chapterAccumulator = new ChapterAccumulator({ minWords: 3000, maxWords: 5000 });

    await SSEManager.setStreaming(id, true);
    send(res, 'start', { sessionId: id, total: chapters, resumeFrom: startChapter > 0 ? startChapter : null });

    for (let chapterNum = startChapter; chapterNum < chapters; chapterNum++) {
      const variation = getVariation(chapterNum);
      emotionState = updateEmotion(emotionState, variation.label);
      const emotion = describeEmotion(emotionState);
      const context = memory.render();

      send(res, 'progress', { chapter: chapterNum + 1, total: chapters, status: 'generating' });

      // Generate scene content that feeds into chapter accumulator
      const { text, validation } = await generateAndValidate(sceneChain, {
        sceneNum: chapterNum + 1, totalScenes: chapters, context, input,
        constraints, voice, genreRules, styleGuidelines,
        variation: variation.instruction, emotion,
      }, variation.label);

      // Add to chapter accumulator
      const chapter = chapterAccumulator.addChunk(text);

      if (chapter) {
        // Chapter complete - emit and persist
        rawChapters.push(chapter.content);
        await memory.add(chapter.content);
        await addScene(id, chapter.index, chapter.content, emotionState, validation);
        
        // Send chapter with idempotency tracking
        await SSEManager.sendEvent(res, id, 'chapter', { 
          index: chapter.index, 
          content: chapter.content, 
          wordCount: chapter.wordCount,
          validation, 
          emotion: emotionState 
        }, chapter.index);
      }
    }

    // Flush any remaining content as final chapter
    const finalChapter = chapterAccumulator.forceFlush();
    if (finalChapter && finalChapter.wordCount > 0) {
      rawChapters.push(finalChapter.content);
      await memory.add(finalChapter.content);
      await addScene(id, finalChapter.index, finalChapter.content, emotionState, '');
      
      await SSEManager.sendEvent(res, id, 'chapter', { 
        index: finalChapter.index, 
        content: finalChapter.content, 
        wordCount: finalChapter.wordCount,
        emotion: emotionState 
      }, finalChapter.index);
    }

    send(res, 'progress', { status: 'checking continuity' });
    const { corrected, report } = await checkContinuity(rawChapters);
    await updateSessionState(id, { protagonist: emotionState.protagonist });

    await SSEManager.setStreaming(id, false);
    send(res, 'done', { sessionId: id, chapters: rawChapters, continuityReport: report });
  } catch (err) { 
    send(res, 'error', { message: err.message }); 
  } finally { 
    res.end();
    // 🔥 SSE cleanup - guaranteed, not optional
    try {
      clearBuffer(id);
      resetGeneration(id);
      logger.info('SSE cleanup complete', { sessionId: id });
    } catch (cleanupErr) {
      logger.error('SSE cleanup failed', { sessionId: id, error: cleanupErr.message });
    }
  }
});

// POST /api/stream/abridge — streams abridged chunks as SSE
router.post('/abridge', async (req, res) => {
  const { input, chunkSize = 2000, reading_level = 'adult', chapterHooks = true, sessionId = null, resumeFrom = null } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const id = sessionId || await createSession({
    mode: 'abridge', title: input?.slice(0, 50), reading_level,
    state: {},
  });

  // 🔥 Client disconnect handling - guaranteed cleanup
  req.on('close', () => {
    logger.info('Client disconnected', { sessionId: id });
    try {
      clearBuffer(id);
      resetGeneration(id);
    } catch (err) {
      logger.error('SSE cleanup on disconnect failed', { sessionId: id, error: err.message });
    }
  });

  try {
    // Check for resume
    let startIndex = 1;
    if (resumeFrom && sessionId) {
      const position = await SSEManager.getResumePosition(sessionId);
      if (position && position.fromIndex > 1) {
        startIndex = position.fromIndex;
      }
    }

    const id = sessionId || await createSession({
      mode: 'abridge', title: input?.slice(0, 50), reading_level,
      state: {},
    });

    const levelGuidance = READING_LEVELS[reading_level] || READING_LEVELS.adult;
    const chunks = chunk(input, chunkSize);

    await SSEManager.setStreaming(id, true);
    send(res, 'start', { sessionId: id, total: chunks.length, resumeFrom: startIndex > 1 ? startIndex : null });

    const { text: threadRaw } = await summarizeChain.call({ sample: input.slice(0, 2000) });
    const threads = parseThreads(threadRaw) || { characters: [], themes: [], key_events: [], tone: 'neutral' };
    const characters = threads.characters.join(', ') || 'unknown';
    const themes = threads.themes.join(', ') || 'unknown';
    const tone = threads.tone || 'neutral';
    let prevSummary = 'None.';
    const key_events = [...(threads.key_events || [])];

    for (let i = startIndex - 1; i < chunks.length; i++) {
      // Check for idempotency
      if (await SSEManager.sceneExists(id, i + 1)) {
        send(res, 'scene', { index: i + 1, text: '[skipped - already exists]', skipped: true });
        continue;
      }

      send(res, 'progress', { scene: i + 1, total: chunks.length, status: 'summarizing' });

      const { text } = await summarizeChain.call({
        passage: chunks[i], prevSummary, characters, themes, tone, levelGuidance,
        key_events: key_events.join('; ') || 'None yet.',
      });

      let chapterText = text;
      if (chapterHooks && i < chunks.length - 1) {
        const { text: hook } = await hookChain.call({ summary: text.slice(0, 500), tone, levelGuidance });
        chapterText = `${text.trim()}\n\n${hook.trim()}`;
      }

      await addScene(id, i + 1, chapterText, {}, '');
      
      // Send with idempotency tracking
      await SSEManager.sendEvent(res, id, 'scene', { index: i + 1, text: chapterText }, i + 1);

      prevSummary = text.slice(0, 400);
      key_events.push(`[chunk ${i + 1}] ${text.slice(0, 120)}...`);
    }

    await SSEManager.setStreaming(id, false);
    send(res, 'done', { sessionId: id, total: chunks.length });
  } catch (err) { 
    send(res, 'error', { message: err.message }); 
  } finally { 
    res.end();
    // 🔥 SSE cleanup - guaranteed, not optional
    try {
      clearBuffer(id);
      resetGeneration(id);
      logger.info('SSE cleanup complete', { sessionId: id });
    } catch (cleanupErr) {
      logger.error('SSE cleanup failed', { sessionId: id, error: cleanupErr.message });
    }
  }
});

// POST /api/stream/adventure — streams branches as SSE
router.post('/adventure', async (req, res) => {
  const { input, branches = 3, initialState = {}, sessionId = null, resumeFrom = null, branchId = null } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const id = sessionId || await createSession({
    mode: 'adventure', title: input?.slice(0, 50), state: initialState,
  });

  // 🔥 Client disconnect handling - guaranteed cleanup
  req.on('close', () => {
    logger.info('Client disconnected', { sessionId: id });
    try {
      clearBuffer(id);
      resetGeneration(id);
    } catch (err) {
      logger.error('SSE cleanup on disconnect failed', { sessionId: id, error: err.message });
    }
  });

  try {
    // Check for resume
    let startIndex = 1;
    if (resumeFrom && sessionId) {
      const position = await SSEManager.getResumePosition(sessionId);
      if (position && position.fromIndex > 1) {
        startIndex = position.fromIndex;
      }
    }

    const id = sessionId || await createSession({
      mode: 'adventure', title: input?.slice(0, 50), state: initialState,
    });

    const constraints = buildConstraintBlock([], []);
    const generated = [];
    const branchStates = [];

    await SSEManager.setStreaming(id, true);
    send(res, 'start', { sessionId: id, total: branches, resumeFrom: startIndex > 1 ? startIndex : null });

    for (let i = startIndex; i <= branches; i++) {
      // Check for idempotency
      if (await SSEManager.sceneExists(id, i, branchId)) {
        send(res, 'scene', { index: i, text: '[skipped - already exists]', skipped: true, branch: branchId || i });
        continue;
      }

      const previousBranches = generated.length
        ? generated.map((b, idx) => `Branch ${idx + 1}:\n${b.text.slice(0, 300)}...`).join('\n\n')
        : 'None yet.';

      const prevState = branchStates.length ? branchStates[branchStates.length - 1] : initialState;
      const variation = getVariation(i - 1);

      send(res, 'progress', { scene: i, total: branches, status: 'generating branch' });

      const { text } = await branchChain.call({
        input, branchNum: i, totalBranches: branches,
        previousBranches, state: JSON.stringify(prevState, null, 2),
        diff: 'N/A', constraints, variation: variation.instruction,
      });

      await addScene(id, i, text, {}, '', branchId || null);
      generated.push({ branch: i, text });
      branchStates.push(prevState);
      
      // Send with idempotency tracking
      await SSEManager.sendEvent(res, id, 'scene', { index: i, text, branch: branchId || i }, i, branchId || null);
    }

    await SSEManager.setStreaming(id, false);
    send(res, 'done', { sessionId: id, branches: generated });
  } catch (err) { 
    send(res, 'error', { message: err.message }); 
  } finally { 
    res.end();
    // 🔥 SSE cleanup - guaranteed, not optional
    try {
      clearBuffer(id);
      resetGeneration(id);
      logger.info('SSE cleanup complete', { sessionId: id });
    } catch (cleanupErr) {
      logger.error('SSE cleanup failed', { sessionId: id, error: cleanupErr.message });
    }
  }
});

// GET /api/session/:id — retrieve session and scenes
router.get('/session/:id', async (req, res) => {
  try {
    const session = await getSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const scenes = await getScenes(req.params.id);
    res.json({ session, scenes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/session/:id/chapter/:index — edit chapter with constraint validation
router.post('/session/:id/chapter/:index', async (req, res) => {
  try {
    const { id, index } = req.params;
    const { content, expectedRevision, branchId = null } = req.body;

    // Check if session is currently streaming (edit lock)
    if (await SSEManager.isStreaming(id)) {
      return res.status(409).json({ 
        error: 'Session is currently streaming. Edits are locked until generation completes.',
        code: 'STREAMING_LOCK'
      });
    }

    // Get current session
    const session = await getSession(id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    // Get previous state from all chapters before this one
    const previousState = await getChapterState(id, parseInt(index));

    // Validate edit against constraints
    const validation = validateEdit(content, previousState);
    
    if (!validation.isValid) {
      return res.status(400).json({ 
        success: false, 
        violations: validation.violations
      });
    }

    // Extract state from edited content for downstream pipeline
    const { extractState } = require('../utils/constraints');
    const extractedState = extractState(content);

    // Get chapter ID for revision history
    const chapterId = await getChapterId(id, parseInt(index), branchId);
    
    // Save revision before updating
    if (chapterId) {
      await addRevision(chapterId, content, {});
    }

    // Update chapter content with extracted state
    await updateSceneContent(id, parseInt(index), content, branchId, extractedState);

    res.json({ 
      success: true, 
      chapter: { 
        index: parseInt(index), 
        content,
        violations: validation.violations,
        extractedState
      },
      recomputeAvailable: true // Flag to show recompute button
    });
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

// POST /api/session/:id/recompute/:index — regenerate downstream chapters
router.post('/session/:id/recompute/:index', async (req, res) => {
  const { id, index } = req.params;
  const { branchId = null } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // 🔥 Client disconnect handling - guaranteed cleanup
  req.on('close', () => {
    logger.info('Client disconnected', { sessionId: id });
    try {
      clearBuffer(id);
      resetGeneration(id);
    } catch (err) {
      logger.error('SSE cleanup on disconnect failed', { sessionId: id, error: err.message });
    }
  });

  try {
    // Get session and chapters
    const session = await getSession(id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const chapters = await getChapters(id, branchId);
    const startIndex = parseInt(index);
    
    // Get all chapters up to and including the edited one
    const priorChapters = chapters.filter(c => c.index < startIndex);
    const editedChapter = chapters.find(c => c.index === startIndex);
    
    if (!editedChapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    // Rebuild state up to this point
    const genreProfile = getGenre(session.genre);
    const genreRules = session.genre ? require('../config/genreProfiles').getGenreConstraints(session.genre) : '';
    const styleGuidelines = session.author_style ? getStyleGuidelines(session.author_style) : '';
    const constraints = buildConstraintBlock(genreProfile?.hardConstraints || []);
    const voice = getVoiceBlock(session.protagonist);
    const memory = new ContextWindow({ rawWindow: 3 });
    let emotionState = applyGenreBias(emptyEmotionState(), genreProfile?.emotionBias || {});

    // Load prior chapters into memory
    for (const chapter of priorChapters) {
      await memory.add(chapter.content);
    }

    // Get remaining chapters to regenerate
    const remainingChapters = chapters.filter(c => c.index >= startIndex && c.index !== startIndex);
    const totalToRegenerate = remainingChapters.length;

    await SSEManager.setStreaming(id, true);
    send(res, 'start', { 
      sessionId: id, 
      total: totalToRegenerate, 
      fromIndex: startIndex,
      mode: 'recompute' 
    });

    // Regenerate each downstream chapter
    for (let i = 0; i < remainingChapters.length; i++) {
      const chapter = remainingChapters[i];
      const chapterNum = chapter.index;
      const variation = getVariation(chapterNum);
      
      emotionState = updateEmotion(emotionState, variation.label);
      const emotion = describeEmotion(emotionState);
      const context = memory.render();

      send(res, 'progress', { 
        chapter: chapterNum + 1, 
        total: totalToRegenerate, 
        status: 'recomputing',
        fromIndex: startIndex
      });

      // Generate new content
      const { text, validation } = await generateAndValidate(sceneChain, {
        sceneNum: chapterNum + 1, 
        totalScenes: totalToRegenerate, 
        context, 
        input: session.title || '',
        constraints, 
        voice, 
        genreRules, 
        styleGuidelines,
        variation: variation.instruction, 
        emotion,
      }, variation.label);

      // Update in database with derived_from tracking
      const { extractState } = require('../utils/constraints');
      const extractedState = extractState(text);
      await updateSceneContent(id, chapterNum, text, branchId, extractedState, startIndex);
      
      // Add to memory for next iteration
      await memory.add(text);

      // Send updated chapter
      await SSEManager.sendEvent(res, id, 'chapter', { 
        index: chapterNum, 
        content: text, 
        wordCount: text.split(/\s+/).length,
        validation, 
        emotion: emotionState,
        recomputed: true,
        fromIndex: startIndex
      }, chapterNum);
    }

    await SSEManager.setStreaming(id, false);
    send(res, 'done', { 
      sessionId: id, 
      recomputed: true,
      fromIndex: startIndex,
      totalRegenerated: totalToRegenerate
    });
  } catch (err) { 
    send(res, 'error', { message: err.message }); 
  } finally { 
    res.end();
    // 🔥 SSE cleanup - guaranteed, not optional
    try {
      clearBuffer(id);
      resetGeneration(id);
      logger.info('SSE cleanup complete', { sessionId: id });
    } catch (cleanupErr) {
      logger.error('SSE cleanup failed', { sessionId: id, error: cleanupErr.message });
    }
  }
});

// GET /api/session/:id/chapter/:index/revisions — get revision history
router.get('/session/:id/chapter/:index/revisions', async (req, res) => {
  try {
    const { id, index } = req.params;
    const { branchId = null } = req.query;

    const chapterId = await getChapterId(id, parseInt(index), branchId || null);
    if (!chapterId) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    const revisions = await getRevisions(chapterId);
    res.json({ revisions });
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

// POST /api/session/:id/chapter/:index/restore — restore previous revision
router.post('/session/:id/chapter/:index/restore', async (req, res) => {
  try {
    const { id, index } = req.params;
    const { revisionId, branchId = null } = req.body;

    // Check if session is currently streaming (edit lock)
    if (await SSEManager.isStreaming(id)) {
      return res.status(409).json({ 
        error: 'Session is currently streaming. Restore is locked until generation completes.',
        code: 'STREAMING_LOCK'
      });
    }

    // Get revision
    const chapterId = await getChapterId(id, parseInt(index), branchId || null);
    if (!chapterId) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    const revisions = await getRevisions(chapterId);
    const revision = revisions.find(r => r.id === revisionId);
    
    if (!revision) {
      return res.status(404).json({ error: 'Revision not found' });
    }

    // Save current as revision before restoring
    const currentChapter = await getChapter(id, parseInt(index), branchId || null);
    if (currentChapter) {
      await addRevision(chapterId, currentChapter.content, currentChapter.emotion);
    }

    // Restore the revision
    await updateSceneContent(id, parseInt(index), revision.content, branchId);

    res.json({ 
      success: true, 
      chapter: { 
        index: parseInt(index), 
        content: revision.content 
      }
    });
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

// Legacy endpoint for scene edits (backward compatibility)
router.post('/session/:id/scene/:index', async (req, res) => {
  try {
    const { id, index } = req.params;
    const { content, expectedRevision, branchId = null } = req.body;

    // Check if session is currently streaming (edit lock)
    if (await SSEManager.isStreaming(id)) {
      return res.status(409).json({ 
        error: 'Session is currently streaming. Edits are locked until generation completes.',
        code: 'STREAMING_LOCK'
      });
    }

    // Get current session
    const session = await getSession(id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    // Get previous state
    const previousState = await getChapterState(id, parseInt(index));

    // Validate edit against constraints
    const validation = validateEdit(content, previousState);
    
    if (!validation.isValid) {
      return res.status(400).json({ 
        success: false, 
        violations: validation.violations
      });
    }

    // Get chapter ID for revision history
    const chapterId = await getChapterId(id, parseInt(index), branchId);
    
    // Save revision before updating
    if (chapterId) {
      await addRevision(chapterId, content, {});
    }

    // Update scene content
    await updateSceneContent(id, parseInt(index), content, branchId);
    
    res.json({ 
      success: true, 
      scene: { 
        index: parseInt(index), 
        content,
        violations: validation.violations
      },
      recomputeAvailable: true
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

// ============================================
// SYNC STORY ENDPOINT (for non-streaming clients)
// ============================================

router.post('/story/sync', async (req, res) => {
  const { input, chapters = 5, genre = null, authorStyle = null, protagonist = null, sessionId = null } = req.body;

  try {
    const id = sessionId || await createSession({
      mode: 'story', title: input?.slice(0, 50), genre, authorStyle, protagonist,
      state: { characters: {}, inventory: [], choices_made: [], world_rules: [] },
    });

    const genreProfile = getGenre(genre);
    const genreRules = genre ? require('../config/genreProfiles').getGenreConstraints(genre) : '';
    const styleGuidelines = authorStyle ? getStyleGuidelines(authorStyle) : '';
    const constraints = buildConstraintBlock(genre ? genreProfile.hardConstraints : []);
    const voice = getVoiceBlock(protagonist);
    const memory = new ContextWindow({ rawWindow: 3 });
    let emotionState = applyGenreBias(emptyEmotionState(), genreProfile.emotionBias || {});
    const rawChapters = [];
    const chapterAccumulator = new ChapterAccumulator({ minWords: 3000, maxWords: 5000 });

    for (let chapterNum = 0; chapterNum < chapters; chapterNum++) {
      const variation = getVariation(chapterNum);
      emotionState = updateEmotion(emotionState, variation.label);
      const emotion = describeEmotion(emotionState);
      const context = memory.render();

      const { text, validation } = await generateAndValidate(sceneChain, {
        sceneNum: chapterNum + 1, totalScenes: chapters, context, input,
        constraints, voice, genreRules, styleGuidelines,
        variation: variation.instruction, emotion,
      }, variation.label);

      const chapter = chapterAccumulator.addChunk(text);

      if (chapter) {
        rawChapters.push(chapter.content);
        await memory.add(chapter.content);
        await addScene(id, chapter.index, chapter.content, emotionState, validation);
      }
    }

    const finalChapter = chapterAccumulator.forceFlush();
    if (finalChapter && finalChapter.wordCount > 0) {
      rawChapters.push(finalChapter.content);
      await memory.add(finalChapter.content);
      await addScene(id, finalChapter.index, finalChapter.content, emotionState, '');
    }

    const { corrected, report } = await checkContinuity(rawChapters);
    await updateSessionState(id, { protagonist: emotionState.protagonist });

    res.json({ 
      sessionId: id, 
      chapters: rawChapters, 
      continuityReport: report 
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});
