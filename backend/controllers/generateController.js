const pipeline = require('../services/core/pipeline');

async function generate(req, res) {
  try {
    const { mode, input, options } = req.body;
    const result = await pipeline.run(mode, input, options);
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { generate };
