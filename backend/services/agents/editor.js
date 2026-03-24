const { PromptTemplate } = require('@langchain/core/prompts');
const { llm } = require('../core/llm');
const fs = require('fs');
const path = require('path');

const systemPrompt = fs.readFileSync(path.resolve(__dirname, '../../../prompts/editor.txt'), 'utf8');

// Use mock LLM for testing if MOCK_LLM env var is set
const useMockLlm = process.env.MOCK_LLM === 'true';
let LLMChain, chain;

if (useMockLlm) {
  const { createMockChain } = require('../core/mockLlm');
  const mockChains = createMockChain();
  LLMChain = { fromTemplate: () => mockChains };
  chain = mockChains;
} else {
  const { LLMChain: RealLLMChain } = require('langchain/chains');
  LLMChain = RealLLMChain;
  chain = new LLMChain({
    llm,
    prompt: PromptTemplate.fromTemplate(`${systemPrompt}\n\nInstructions: {instructions}\n\nText:\n{text}`),
  });
}

async function edit(text, instructions = 'Improve clarity and flow.') {
  const { text: result } = await chain.call({ text, instructions });
  return result;
}

module.exports = { edit };
