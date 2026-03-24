// Kindle = epub with specific structure, then user runs kindlegen/Calibre
// We generate the epub and note the conversion step
const epub = require('./epub');

async function exportKindle(scenes, metadata = {}) {
  const result = await epub.export(scenes, metadata);
  return {
    ...result,
    note: 'Convert to .mobi/.azw3 using: ebook-convert output.epub output.mobi (Calibre)',
  };
}

module.exports = { export: exportKindle };
