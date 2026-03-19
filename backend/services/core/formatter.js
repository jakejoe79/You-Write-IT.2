// Normalize LLM outputs into consistent structure
function normalize(raw) {
  // Already a structured object (multi-scene, adventure branches, etc.)
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return {
      ...raw,
      generatedAt: new Date().toISOString(),
    };
  }

  // Plain string
  const text = typeof raw === 'string' ? raw.trim() : JSON.stringify(raw);
  return {
    text,
    wordCount: text.split(/\s+/).length,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { normalize };
