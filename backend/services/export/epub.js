// Delegates to Python epub builder via child_process
// Runs chapter balancing before export so Kindle readers get consistent chapter lengths
const { execFile } = require('child_process');
const path = require('path');
const { balance, report } = require('../../utils/chapterBalancer');
const logger = require('../../utils/logger');

async function exportEpub(content, metadata = {}) {
  const { title = 'Untitled', author = 'Unknown', balanceChapters = true } = metadata;

  // content can be a string (single blob) or array of chapter strings
  let chapters = Array.isArray(content) ? content : content.split(/\n{3,}/);

  if (balanceChapters) {
    chapters = balance(chapters);
    const chapterReport = report(chapters);
    logger.info('Chapter balance report:', chapterReport);
  }

  // Rejoin with triple newline — Python epub builder splits on this
  const finalContent = chapters.join('\n\n\n');
  const outPath = path.resolve(__dirname, `../../../../data/outputs/${Date.now()}.epub`);

  return new Promise((resolve, reject) => {
    const script = path.resolve(__dirname, '../../../../python/epub_builder.py');
    execFile('python', [script, '--title', title, '--author', author, '--output', outPath], {
      input: finalContent,
    }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve({ path: outPath, message: stdout.trim(), chapters: chapters.length });
    });
  });
}

module.exports = { export: exportEpub };
