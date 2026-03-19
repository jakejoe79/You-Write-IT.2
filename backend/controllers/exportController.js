async function exportBook(req, res) {
  try {
    const { format, content, metadata } = req.body;
    // format: 'epub' | 'kindle' | 'html'
    const exporter = require(`../services/export/${format}`);
    const output = await exporter.export(content, metadata);
    res.json({ output });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { exportBook };
