// Ollama wrapper via LangChain
const { Ollama } = require('@langchain/ollama');
const env = require('../../config/env');

const llm = new Ollama({
  baseUrl: env.ollamaUrl,
  model: env.ollamaModel,
});

async function complete(prompt) {
  return llm.invoke(prompt);
}

// Alias used by agents that import callLLM directly
const callLLM = complete;

module.exports = { complete, callLLM, llm };
