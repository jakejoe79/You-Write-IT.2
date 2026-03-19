const { PromptTemplate } = require('@langchain/core/prompts');
const { LLMChain } = require('langchain/chains');
const { llm } = require('../core/llm');
const fs = require('fs');
const path = require('path');

const systemPrompt = fs.readFileSync(path.resolve(__dirname, '../../../prompts/planner.txt'), 'utf8');

const chain = new LLMChain({
  llm,
  prompt: PromptTemplate.fromTemplate(`${systemPrompt}\n\nContext:\n{context}`),
});

async function plan(context) {
  const { text } = await chain.call({ context });
  return text;
}

module.exports = { plan };
