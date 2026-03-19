require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'llama3',
  chromaUrl: process.env.CHROMA_URL || 'http://localhost:8000',
  nodeEnv: process.env.NODE_ENV || 'development',
};
