// Story mode — full pipeline: genre + style + variation + emotion + memory + voice + scene validation
const { PromptTemplate } = require('@langchain/core/prompts');
const { LLMChain } = require('langchain/chains');
const { llm } = require('../core/llm');
const continuity = require('../agents/continuity');
const { getVariation } = require('../agents/styleVariance');
const { buildConstraintBlock, checkHardViolations, validateEdit } = require('../services/validators/ConstraintValidator');
const { validateState, diffState, emptyState } = require('../services/validators/StateValidator');
const { ContextWindow } = require('../core/memoryCompressor');
const { getVoiceBlock } = require('../../characters/voiceProfiles');
const { generateAndValidate } = require('../agents/sceneValidator');
const { getGenre, getGenreConstraints } = require('../../config/genreProfiles');
const { getStyleGuidelines } = require('../../config/styleMapper');
const fs = require('fs');
const path = require('path');

const writerPrompt = fs.readFileSync(path.resolve(__dirname, '../../../prompts/writer.txt'), 'utf8');

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

async function run(input, options = {}) {
  const {
    style      = 'literary',
    tone       = 'neutral',
    scenes     = 1,
    protagonist = null,
    genre      = null,
    authorStyle = null,
  } = options;

  // Genre = hard constraints. Style = soft guidelines. Keep them separate.
  const genreProfile    = getGenre(genre);
  const genreRules      = genre ? getGenreConstraints(genre) : '';
  const styleGuidelines = authorStyle ? getStyleGuidelines(authorStyle) : `Style: ${style}\nTone: ${tone}`;

  // Genre hard constraints merge into the constraint block
  const constraints = buildConstraintBlock(
    genre ? genreProfile.hardConstraints : [],
    []
  );

  const voice = getVoiceBlock(protagonist);

  // Apply genre bias to emotion baseline — thriller starts fearful, romance starts hopeful
  let emotionState = applyGenreBias(emptyEmotionState(), genreProfile.emotionBias || {});

  if (scenes === 1) {
    const variation = getVariation(0);
    emotionState = updateEmotion(emotionState, variation.label);
    const emotion = describeEmotion(emotionState);
    const callArgs = {
      sceneNum: 1, totalScenes: 1, context: 'None yet.',
      input, constraints, voice, genreRules, styleGuidelines,
      variation: variation.instruction, emotion,
    };
    const { text } = await generateAndValidate(sceneChain, callArgs, variation.label);
    return text;
  }

  const rawScenes = [];
  const memory = new ContextWindow({ rawWindow: 3 });

  for (let i = 1; i <= scenes; i++) {
    const variation = getVariation(i - 1);
    emotionState = updateEmotion(emotionState, variation.label);
    const emotion = describeEmotion(emotionState);
    const context = memory.render();

    const callArgs = {
      sceneNum: i, totalScenes: scenes, context,
      input, constraints, voice, genreRules, styleGuidelines,
      variation: variation.instruction, emotion,
    };

    const { text } = await generateAndValidate(sceneChain, callArgs, variation.label);
    rawScenes.push(text);
    await memory.add(text);
  }

  const { corrected, report } = await continuity.check(rawScenes);
  return { scenes: corrected, continuityReport: report };
}

module.exports = { run };
