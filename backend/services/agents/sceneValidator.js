// Scene validator — verifies a scene actually achieved its intended purpose.
// If it didn't, the pipeline regenerates with a stronger instruction.
// This is the difference between intending structure and enforcing it.

const { PromptTemplate } = require('@langchain/core/prompts');
const { llm } = require('../core/llm');
const logger = require('../../utils/logger');

const MAX_RETRIES = 3;

// Use mock LLM for testing if MOCK_LLM env var is set
const useMockLlm = process.env.MOCK_LLM === 'true';
let LLMChain, validateChain, regenerateChain;

if (useMockLlm) {
  const { createMockChain } = require('../core/mockLlm');
  const mockChains = createMockChain();
  LLMChain = { fromTemplate: () => mockChains };
  validateChain = mockChains;
  regenerateChain = mockChains;
} else {
  const { LLMChain: RealLLMChain } = require('langchain/chains');
  LLMChain = RealLLMChain;
  
  validateChain = new LLMChain({
    llm,
    prompt: PromptTemplate.fromTemplate(`
You are a story editor reviewing a scene against its intended purpose.

Intended purpose: {purpose}

Scene:
{scene}

Does this scene clearly achieve its intended purpose?
Answer with PASS or FAIL on the first line.
Then explain briefly (1–2 sentences). Be specific.
    `.trim()),
  });

  regenerateChain = new LLMChain({
    llm,
    prompt: PromptTemplate.fromTemplate(`
{originalPrompt}

IMPORTANT: The previous attempt failed to achieve this purpose: {purpose}
Reason it failed: {reason}

This time, make the purpose unmistakable. Do not be subtle about it.
Rewrite the scene now:
    `.trim()),
  });
}

/**
 * Validates a scene against its expected purpose.
 * Returns { passed: bool, reason: string }
 */
async function validateScene(scene, expectedPurpose) {
  const { text } = await validateChain.call({ scene, purpose: expectedPurpose });
  const firstLine = text.trim().split('\n')[0].toUpperCase();
  const passed = firstLine.includes('PASS');
  const reason = text.trim().split('\n').slice(1).join(' ').trim();
  return { passed, reason };
}

/**
 * Generates a scene and validates it meets its purpose.
 * Retries up to MAX_RETRIES times with escalating instructions.
 * Returns the final scene text and validation result.
 */
async function generateAndValidate(chain, callArgs, expectedPurpose) {
  let { text } = await chain.call(callArgs);
  let validation = await validateScene(text, expectedPurpose);

  if (validation.passed) {
    logger.info(`Scene validated: ${expectedPurpose}`);
    return { text, validation };
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    logger.warn(`Scene failed validation (attempt ${attempt}): ${validation.reason}`);

    const { text: regenerated } = await regenerateChain.call({
      originalPrompt: JSON.stringify(callArgs),
      purpose: expectedPurpose,
      reason: validation.reason,
    });

    text = regenerated;
    validation = await validateScene(text, expectedPurpose);

    if (validation.passed) {
      logger.info(`Scene passed on retry ${attempt}: ${expectedPurpose}`);
      return { text, validation };
    }
  }

  // After max retries, use the best attempt but mark as degraded
  logger.warn(`Scene did not pass after ${MAX_RETRIES} retries. Using best attempt.`);
  return { text, validation };
}

module.exports = { validateScene, generateAndValidate };
