// Memory service — Chroma vector store via LangChain
const { Chroma } = require('@langchain/community/vectorstores/chroma');
const { OllamaEmbeddings } = require('@langchain/ollama');
const { env } = require('../../config/env');

const embeddings = new OllamaEmbeddings({
  baseUrl: env.ollamaUrl,
  model: env.ollamaModel,
});

let store = null;

async function getStore(collectionName = 'book-memory') {
  if (!store) {
    store = await Chroma.fromExistingCollection(embeddings, {
      collectionName,
      url: env.chromaUrl,
    });
  }
  return store;
}

async function storeMemory(texts, metadatas = []) {
  const s = await getStore();
  await s.addDocuments(texts.map((t, i) => ({ pageContent: t, metadata: metadatas[i] || {} })));
}

async function retrieve(query, topK = 5) {
  const s = await getStore();
  const results = await s.similaritySearch(query, topK);
  return results.map(r => r.pageContent);
}

module.exports = { storeMemory, retrieve };
