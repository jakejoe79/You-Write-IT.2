async function exportHtml(content, metadata = {}) {
  const { title = 'Untitled' } = metadata;
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${title}</title></head>
<body>
  <h1>${title}</h1>
  ${content.split('\n\n').map(p => `<p>${p}</p>`).join('\n  ')}
</body>
</html>`;
}

module.exports = { export: exportHtml };
