// Split large texts into chunks of roughly `size` characters, breaking on whitespace
function chunk(text, size = 2000) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = start + size;
    if (end < text.length) {
      const boundary = text.lastIndexOf(' ', end);
      if (boundary > start) end = boundary;
    }
    chunks.push(text.slice(start, end).trim());
    start = end;
  }
  return chunks;
}

module.exports = { chunk };
