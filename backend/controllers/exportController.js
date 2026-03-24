const { validators, CONTRACT_VERSION } = require('../services/core/contracts');
const { serializeError } = require('../services/core/errors');

async function exportBook(req, res) {
  try {
    // HARD ENFORCEMENT: throws if invalid
    validators.validateExportRequest(req.body);

    const { format, content, metadata } = req.body;
    // format: 'epub' | 'kindle' | 'html'
    const exporter = require(`../services/export/${format}`);
    
    // Export expects scenes array, not raw content
    const output = await exporter.export(content, metadata);
    
    const response = { output };
    // HARD ENFORCEMENT: throws if invalid
    validators.validateExportResponse(response);
    
    res.json(response);
  } catch (err) {
    res.status(err.status || 500).json(serializeError(err));
  }
}

module.exports = { exportBook };
