// Chapter balancer — normalizes chapter sizes before export.
// Splits oversized chapters, merges undersized ones.
// Target: consistent reading experience, not arbitrary word counts.

const DEFAULT_TARGET_WORDS = 1500; // ~5–6 min read per chapter
const DEFAULT_MIN_WORDS    = 600;
const DEFAULT_MAX_WORDS    = 3000;

/**
 * Count words in a string.
 */
function wordCount(text) {
  return text.trim().split(/\s+/).length;
}

/**
 * Split a chapter that exceeds maxWords into roughly equal parts.
 * Splits on paragraph boundaries to avoid cutting mid-sentence.
 */
function splitChapter(text, maxWords) {
  const paragraphs = text.split(/\n\n+/);
  const parts = [];
  let current = [];
  let count = 0;

  for (const para of paragraphs) {
    const wc = wordCount(para);
    if (count + wc > maxWords && current.length > 0) {
      parts.push(current.join('\n\n'));
      current = [para];
      count = wc;
    } else {
      current.push(para);
      count += wc;
    }
  }
  if (current.length) parts.push(current.join('\n\n'));
  return parts;
}

/**
 * Balance an array of chapter strings.
 * - Splits chapters over maxWords
 * - Merges consecutive chapters under minWords
 * Returns a new array of balanced chapter strings.
 */
function balance(chapters, options = {}) {
  const {
    targetWords = DEFAULT_TARGET_WORDS,
    minWords    = DEFAULT_MIN_WORDS,
    maxWords    = DEFAULT_MAX_WORDS,
  } = options;

  // Step 1: split oversized chapters
  const split = [];
  for (const ch of chapters) {
    if (wordCount(ch) > maxWords) {
      split.push(...splitChapter(ch, targetWords));
    } else {
      split.push(ch);
    }
  }

  // Step 2: merge undersized consecutive chapters
  const merged = [];
  let buffer = '';

  for (const ch of split) {
    const combined = buffer ? `${buffer}\n\n${ch}` : ch;
    if (wordCount(combined) < minWords) {
      buffer = combined;
    } else {
      if (buffer && wordCount(buffer) < minWords) {
        // flush buffer merged into this chapter
        merged.push(combined);
        buffer = '';
      } else {
        if (buffer) { merged.push(buffer); buffer = ''; }
        merged.push(ch);
      }
    }
  }
  if (buffer) merged.push(buffer); // flush remainder

  return merged;
}

/**
 * Returns a summary of chapter word counts — useful for debugging before export.
 */
function report(chapters) {
  return chapters.map((ch, i) => ({
    chapter: i + 1,
    words: wordCount(ch),
    status: wordCount(ch) < DEFAULT_MIN_WORDS ? 'short' :
            wordCount(ch) > DEFAULT_MAX_WORDS ? 'long'  : 'ok',
  }));
}

module.exports = { balance, report, wordCount };
