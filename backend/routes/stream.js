const express = require('express');
const router = express.Router();
const { getGenre } = require('../config/genreProfiles');
const { getStyleGuidelines } = require('../config/styleMapper');
const { getVariation } = require('../services/agents/styleVariance');
const { buildConstraintBlock } = require('../utils/constraints');
const { updateEmotion, describeEmotion, emptyEmotionState, applyGenreBias } = require('../utils/emotionState');
const { ContextWindow } = require('../services/core/memoryCompressor');
const { getVoiceBlock } = require('../characters/voiceProfiles');
const { generateAndValidate } = require('../services/agents/sceneValidator');
const { checkContinuity } = require('../services/agents/continuity');
const { LLMChain } = require('langchain/chains');
const { PromptTemplate } = require('@langchain/core/prompts');
const { llm } = require('../services/core/llm');
const fs = require('fs');
const path = require('path');

const writerPrompt = fs.readFileSync(
  path.resolve(__dirname, '../../prompts/writer.txt'), 'utf8'
);

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

// SSE helper
function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// POST /api/stream/story — streams scenes as SSE
router.post('/story', async (req, res) => {
  const {
    input, scenes = 3, genre = null, authorStyle = null,
    protagonist = null,
  } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  try {
    const genreProfile    = getGenre(genre);
    const genreRules      = genre ? require('../config/genreProfiles').getGenreConstraints(genre) : '';
    const styleGuidelines = authorStyle ? getStyleGuidelines(authorStyle) : '';
    const constraints     = buildConstraintBlock(genre ? genreProfile.hardConstraints : []);
    const voice           = getVoiceBlock(protagonist);
    const memory          = new ContextWindow({ rawWindow: 3 });
    let emotionState      = applyGenreBias(emptyEmotionState(), genreProfile.emotionBias || {});
    const rawScenes       = [];

    send(res, 'start', { total: scenes });

    for (let i = 1; i <= scenes; i++) {
      const variation = getVariation(i - 1);
      emotionState = updateEmotion(emotionState, variation.label);
      const emotion = describeEmotion(emotionState);
      const context = memory.render();

      send(res, 'progress', { scene: i, total: scenes, status: 'generating' });

      const callArgs = {
        sceneNum: i, totalScenes: scenes, context, input,
        constraints, voice, genreRules, styleGuidelines,
        variation: variation.instruction, emotion,
      };

      const { text, validation } = await generateAndValidate(sceneChain, callArgs, variation.label);
      rawScenes.push(text);
      await memory.add(text);

      send(res, 'scene', { index: i, text, validation, emotion: emotionState });
    }

    send(res, 'progress', { status: 'checking continuity' });
    const { corrected, report } = await checkContinuity(rawScenes);

    send(res, 'done', { scenes: corrected, continuityReport: report });
  } catch (err) {
    send(res, 'error', { message: err.message });
  } finally {
    res.end();
  }
});

module.exports = router;
