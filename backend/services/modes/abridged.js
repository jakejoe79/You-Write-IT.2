// Abridged mode — chunking + reduction + narrative thread tracking + reader level targeting
const { PromptTemplate } = require('@langchain/core/prompts');
const { LLMChain } = require('langchain/chains');
const { llm } = require('../core/llm');
const { chunk } = require('../../utils/chunker');
const fs = require('fs');
const path = require('path');

const abridgedPrompt = fs.readFileSync(path.resolve(__dirname, '../../../prompts/abridged.txt'), 'utf8');

const READING_LEVELS = {
  middle_school: 'Use simple vocabulary and short sentences. Avoid complex metaphors. Aim for clarity over style.',
  high_school:   'Use clear language with moderate complexity. Some literary devices are fine.',
  adult:         'No restrictions on vocabulary or complexity. Preserve the author\'s original style.',
  esl:           'Use simple, direct language. Avoid idioms, slang, and culturally specific references. Short sentences.',
};

const threadChain = new LLMChain({
  llm,
  prompt: PromptTemplate.fromTemplate(`
Read this text and identify the narrative threads that must be preserved across an abridged version.

Return JSON with:
- characters: string[] — main characters by name
- themes: string[] — central themes (max 4)
- key_events: string[] — plot events that cannot be dropped
- tone: string — one word describing the overall tone

Text (first 2000 chars):
{sample}

Return ONLY valid JSON. No explanation.
  `.trim()),
});

const summarizeChain = new LLMChain({
  llm,
  prompt: PromptTemplate.fromTemplate(`
${abridgedPrompt}

Narrative threads to maintain throughout (do NOT lose these):
- Characters: {characters}
- Themes: {themes}
- Key events so far: {key_events}
- Tone: {tone}

Reader level guidance: {levelGuidance}

Previous summary (for context):
{prevSummary}

Passage to summarize:
{passage}
  `.trim()),
});

const smoothChain = new LLMChain({
  llm,
  prompt: PromptTemplate.fromTemplate(`
The following is an abridged text assembled from multiple summarized chunks.
Smooth out any awkward transitions, repeated phrases, or tone inconsistencies.
The overall tone should be: {tone}
The central themes are: {themes}
Reader level guidance: {levelGuidance}
Do not add new plot. Return only the improved text.

Text:
{text}
  `.trim()),
});

function parseThreads(raw) {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  } catch {
    return null;
  }
}

async function run(input, options = {}) {
  const { chunkSize = 2000, reading_level = 'adult' } = options;
  const levelGuidance = READING_LEVELS[reading_level] || READING_LEVELS.adult;
  const chunks = chunk(input, chunkSize);

  const { text: threadRaw } = await threadChain.call({ sample: input.slice(0, 2000) });
  const threads = parseThreads(threadRaw) || { characters: [], themes: [], key_events: [], tone: 'neutral' };

  const characters = threads.characters.join(', ') || 'unknown';
  const themes     = threads.themes.join(', ')     || 'unknown';
  const tone       = threads.tone                  || 'neutral';
  const summaries  = [];
  let prevSummary  = 'None.';
  const key_events = [...(threads.key_events || [])];

  for (const passage of chunks) {
    const { text } = await summarizeChain.call({
      passage, prevSummary, characters, themes, tone, levelGuidance,
      key_events: key_events.join('; ') || 'None yet.',
    });
    summaries.push(text);
    prevSummary = text.slice(0, 400);
    key_events.push(`[chunk ${summaries.length}] ${text.slice(0, 120)}...`);
  }

  const assembled = summaries.join('\n\n');

  if (chunks.length > 1) {
    const { text: smoothed } = await smoothChain.call({ text: assembled, tone, themes, levelGuidance });
    return smoothed;
  }

  return assembled;
}

module.exports = { run };
