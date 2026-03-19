const { PromptTemplate } = require('@langchain/core/prompts');
const { LLMChain } = require('langchain/chains');
const { llm } = require('../core/llm');
const fs = require('fs');
const path = require('path');

const systemPrompt = fs.readFileSync(path.resolve(__dirname, '../../../prompts/editor.txt'), 'utf8');

const chain = new LLMChain({
  llm,
  prompt: PromptTemplate.fromTemplate(`${systemPrompt}\n\nInstructions: {instructions}\n\nText:\n{text}`),
});

async function edit(text, instructions = 'Improve clarity and flow.') {
  const { text: result } = await chain.call({ text, instructions });
  return result;
}

module.exports = { edit };
