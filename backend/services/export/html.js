const { assertValidStatus, VALID_STATUS } = require('../core/contracts');

async function exportHtml(scenes, metadata = {}) {
  const { title = 'Untitled' } = metadata;
  
  // Export integrity: only export generated chapters
  const exportable = scenes.filter(s => s.status === 'generated');
  
  // Warn if we're dropping non-final chapters
  if (exportable.length !== scenes.length) {
    const logger = require('../utils/logger');
    logger.warn('Export contains non-final chapters', {
      total: scenes.length,
      exportable: exportable.length,
      dropped: scenes.length - exportable.length,
    });
  }
  
  const content = exportable.map(s => s.content).join('\n\n');
  
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
