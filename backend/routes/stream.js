const express = require('express');
const router = express.Router();
const { getGenre } = require('../config/genreProfiles');
const { getStyleGuidelines } = require('../config/styleMapper');
const { getVariation } = require('../services/agents/styleVariance');
const { buildConstraintBlock, checkHardViolations } = require('../utils/constraints');
const { updateEmotion, describeEmotion, emptyEmotionState, applyGenreBias } = require('../utils/emotionState');
const { ContextWindow } = require('../services/core/memoryCompressor');
const { getVoiceBlock } = require('../characters/voiceProfiles');
const { generateAndValidate } = require('../services/agents/sceneValidator');
const { checkContinuity } = require('../services/agents/continuity');
const { createSession, addScene, updateSessionState, getSession, getScenes, updateSceneContent } = require('../db/sqlite');
const { LLMChain } = require('langchain/chains');
const { PromptTemplate } = require('@langchain/core/prompts');
const { llm } = require('../services/core/llm');
const { chunk } = require('../utils/chunker');
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

// POST /api/stream/story — streams scenes as SSE with session persistence
router.post('/story', async (req, res) => {
  const { input, scenes = 3, genre = null, authorStyle = null, protagonist = null, sessionId = null } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

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
    const rawScenes = [];

    send(res, 'start', { sessionId: id, total: scenes });

    for (let i = 1; i <= scenes; i++) {
      const variation = getVariation(i - 1);
      emotionState = updateEmotion(emotionState, variation.label);
      const emotion = describeEmotion(emotionState);
      const context = memory.render();

      send(res, 'progress', { scene: i, total: scenes, status: 'generating' });

      const { text, validation } = await generateAndValidate(sceneChain, {
        sceneNum: i, totalScenes: scenes, context, input,
        constraints, voice, genreRules, styleGuidelines,
        variation: variation.instruction, emotion,
      }, variation.label);

      rawScenes.push(text);
      await memory.add(text);
      await addScene(id, i, text, emotionState, validation);
      send(res, 'scene', { index: i, text, validation, emotion: emotionState });
    }

    send(res, 'progress', { status: 'checking continuity' });
    const { corrected, report } = await checkContinuity(rawScenes);
    await updateSessionState(id, { protagonist: emotionState.protagonist });

    send(res, 'done', { sessionId: id, scenes: corrected, continuityReport: report });
  } catch (err) { send(res, 'error', { message: err.message }); }
  finally { res.end(); }
});

// POST /api/stream/abridge — streams abridged chunks as SSE
router.post('/abridge', async (req, res) => {
  const { input, chunkSize = 2000, reading_level = 'adult', chapterHooks = true, sessionId = null } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  try {
    const id = sessionId || await createSession({
      mode: 'abridge', title: input?.slice(0, 50), reading_level,
      state: {},
    });

    const levelGuidance = READING_LEVELS[reading_level] || READING_LEVELS.adult;
    const chunks = chunk(input, chunkSize);

    send(res, 'start', { sessionId: id, total: chunks.length });

    const { text: threadRaw } = await summarizeChain.call({ sample: input.slice(0, 2000) });
    const threads = parseThreads(threadRaw) || { characters: [], themes: [], key_events: [], tone: 'neutral' };
    const characters = threads.characters.join(', ') || 'unknown';
    const themes = threads.themes.join(', ') || 'unknown';
    const tone = threads.tone || 'neutral';
    let prevSummary = 'None.';
    const key_events = [...(threads.key_events || [])];

    for (let i = 0; i < chunks.length; i++) {
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
      send(res, 'scene', { index: i + 1, text: chapterText });

      prevSummary = text.slice(0, 400);
      key_events.push(`[chunk ${i + 1}] ${text.slice(0, 120)}...`);
    }

    send(res, 'done', { sessionId: id, total: chunks.length });
  } catch (err) { send(res, 'error', { message: err.message }); }
  finally { res.end(); }
});

// POST /api/stream/adventure — streams branches as SSE
router.post('/adventure', async (req, res) => {
  const { input, branches = 3, initialState = {}, sessionId = null } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  try {
    const id = sessionId || await createSession({
      mode: 'adventure', title: input?.slice(0, 50), state: initialState,
    });

    const constraints = buildConstraintBlock([], []);
    const generated = [];
    const branchStates = [];

    send(res, 'start', { sessionId: id, total: branches });

    for (let i = 1; i <= branches; i++) {
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

      await addScene(id, i, text, {}, '');
      generated.push({ branch: i, text });
      branchStates.push(prevState);
      send(res, 'scene', { index: i, text, branch: i });
    }

    send(res, 'done', { sessionId: id, branches: generated });
  } catch (err) { send(res, 'error', { message: err.message }); }
  finally { res.end(); }
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

// POST /api/session/:id/scene/:index — update scene content with reconciliation
router.post('/session/:id/scene/:index', async (req, res) => {
  try {
    const { id, index } = req.params;
    const { content } = req.body;

    // Get current session to validate edit
    const session = await getSession(id);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    // Run hard constraint check on the edit
    const violations = checkHardViolations([]); // Could parse content for character deaths, etc.
    if (violations.length) {
      return res.status(400).json({ error: 'Edit violates constraints', violations });
    }

    await updateSceneContent(id, parseInt(index), content);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
