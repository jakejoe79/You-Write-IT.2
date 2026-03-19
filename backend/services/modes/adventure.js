// Adventure mode — branching logic with state tracking + validation + constraints
const { PromptTemplate } = require('@langchain/core/prompts');
const { LLMChain } = require('langchain/chains');
const { llm } = require('../core/llm');
const { validateState, diffState, emptyState } = require('../../utils/stateValidator');
const { buildConstraintBlock, checkHardViolations } = require('../../utils/constraints');
const { getVariation } = require('../agents/styleVariance');
const { updateEmotion, describeEmotion, emptyEmotionState } = require('../../utils/emotionState');
const logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');

const adventurePrompt = fs.readFileSync(path.resolve(__dirname, '../../../prompts/adventure.txt'), 'utf8');

const stateChain = new LLMChain({
  llm,
  prompt: PromptTemplate.fromTemplate(`
Read this story branch and extract the current world state as JSON.

Include:
- characters: object mapping name -> { alive (boolean), injured (boolean), location (string), traits (string[]) }
- inventory: string array of items the protagonist has
- choices_made: string array of key decisions made
- world_rules: string array of established rules of this world

Branch:
{branch}

Return ONLY valid JSON. No markdown. No explanation.
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

Emotional state: {emotion}

Scene direction: {variation}

You are writing branch {branchNum} of {totalBranches}.
This branch should be meaningfully different from the others in: consequence, tone, or direction.
Previously generated branches (for contrast — do NOT repeat them):
{previousBranches}

Write branch {branchNum}:
  `.trim()),
});

function parseState(raw) {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : emptyState();
  } catch {
    return emptyState();
  }
}

async function run(input, options = {}) {
  const { branches = 3, initialState = {} } = options;
  const generated = [];
  const branchStates = [];
  const constraints = buildConstraintBlock();
  let emotionState = emptyEmotionState();

  for (let i = 1; i <= branches; i++) {
    const previousBranches = generated.length
      ? generated.map((b, idx) => `Branch ${idx + 1}:\n${b.text.slice(0, 300)}...`).join('\n\n')
      : 'None yet.';

    const prevState = branchStates.length
      ? branchStates[branchStates.length - 1]
      : validateState({ ...emptyState(), ...initialState });

    const diff = branchStates.length
      ? diffState(branchStates[branchStates.length - 2] || validateState(initialState), prevState)
      : [];

    const violations = checkHardViolations(diff);
    if (violations.length) violations.forEach(v => logger.warn(v));

    const variation = getVariation(i - 1);
    emotionState = updateEmotion(emotionState, variation.label);
    const emotion = describeEmotion(emotionState);

    const { text } = await branchChain.call({
      input,
      branchNum: i,
      totalBranches: branches,
      previousBranches,
      state: JSON.stringify(prevState, null, 2),
      diff: diff.length ? diff.map(d => `- ${d}`).join('\n') : 'No changes yet.',
      constraints,
      variation: variation.instruction,
      emotion,
    });

    const { text: stateRaw } = await stateChain.call({ branch: text });
    const state = validateState(parseState(stateRaw));
    branchStates.push(state);

    generated.push({ branch: i, text, state, emotion: emotionState });
  }

  return generated;
}

module.exports = { run };
