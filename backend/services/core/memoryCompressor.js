// Memory compressor — prevents prompt bloat by summarizing accumulated history.
// Every COMPRESS_EVERY scenes, raw history is replaced with a compressed summary.
// Preserved: key facts, emotional shifts, hard constraint anchors.

const { LLMChain } = require('langchain/chains');
const { PromptTemplate } = require('@langchain/core/prompts');
const { llm } = require('./llm');

const COMPRESS_EVERY = 5; // compress after every N scenes

const compressChain = new LLMChain({
  llm,
  prompt: PromptTemplate.fromTemplate(`
You are compressing story memory for an ongoing narrative system.
Summarize the following scenes into a compact memory block.

Preserve:
- All character names, statuses, and key traits
- All world rules established
- Key plot events (what happened, not how it was written)
- Emotional trajectory of the protagonist (rising/falling fear, hope, etc.)
- Any unresolved threads or open questions

Be concise. This will be injected into future prompts — every word costs tokens.
Target: under 300 words.

Scenes to compress:
{scenes}

Return plain text. No headers. No bullet points.
  `.trim()),
});

/**
 * Decides whether compression should run based on scene count.
 */
function shouldCompress(sceneCount) {
  return sceneCount > 0 && sceneCount % COMPRESS_EVERY === 0;
}

/**
 * Compresses an array of scene strings into a single memory block.
 * Returns the compressed string.
 */
async function compress(scenes) {
  const scenesText = scenes
    .map((s, i) => `Scene ${i + 1}:\n${s}`)
    .join('\n\n---\n\n');

  const { text } = await compressChain.call({ scenes: scenesText });
  return text.trim();
}

/**
 * Manages a rolling context window.
 * - Keeps a compressed memory block for older scenes
 * - Keeps the last N raw scenes for immediate context
 * - Returns a formatted context string ready for prompt injection
 */
class ContextWindow {
  constructor({ rawWindow = 3 } = {}) {
    this.rawWindow = rawWindow;   // how many recent scenes to keep raw
    this.compressed = '';         // compressed memory of older scenes
    this.rawScenes = [];          // recent scenes kept verbatim
    this.totalScenes = 0;
  }

  async add(scene) {
    this.rawScenes.push(scene);
    this.totalScenes++;

    if (shouldCompress(this.totalScenes) && this.rawScenes.length > this.rawWindow) {
      const toCompress = this.rawScenes.slice(0, -this.rawWindow);
      const newCompressed = await compress(toCompress);
      // Merge with existing compressed memory
      this.compressed = this.compressed
        ? await compress([this.compressed, newCompressed])
        : newCompressed;
      this.rawScenes = this.rawScenes.slice(-this.rawWindow);
    }
  }

  /**
   * Returns a context string for prompt injection.
   */
  render() {
    const parts = [];
    if (this.compressed) {
      parts.push(`Story so far (compressed):\n${this.compressed}`);
    }
    if (this.rawScenes.length) {
      parts.push(
        this.rawScenes
          .map((s, i) => `Recent scene ${this.totalScenes - this.rawScenes.length + i + 1}:\n${s.slice(0, 400)}...`)
          .join('\n\n')
      );
    }
    return parts.join('\n\n') || 'None yet.';
  }
}

module.exports = { compress, shouldCompress, ContextWindow };
