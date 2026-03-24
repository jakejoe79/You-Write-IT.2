const { PromptTemplate } = require('@langchain/core/prompts');
const { llm } = require('../core/llm');
const fs = require('fs');
const path = require('path');

const systemPrompt = fs.readFileSync(path.resolve(__dirname, '../../../prompts/writer.txt'), 'utf8');

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
    prompt: PromptTemplate.fromTemplate(`${systemPrompt}\n\nPlan:\n{plan}\n\nContext:\n{context}`),
  });
}

async function write(plan, context) {
  const { text } = await chain.call({ plan, context });
  return text;
}

module.exports = { write };
