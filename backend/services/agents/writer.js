const { PromptTemplate } = require('@langchain/core/prompts');
const { LLMChain } = require('langchain/chains');
const { llm } = require('../core/llm');
const fs = require('fs');
const path = require('path');

const systemPrompt = fs.readFileSync(path.resolve(__dirname, '../../../prompts/writer.txt'), 'utf8');

const chain = new LLMChain({
  llm,
  prompt: PromptTemplate.fromTemplate(`${systemPrompt}\n\nPlan:\n{plan}\n\nContext:\n{context}`),
});

async function write(plan, context) {
  const { text } = await chain.call({ plan, context });
  return text;
}

module.exports = { write };
