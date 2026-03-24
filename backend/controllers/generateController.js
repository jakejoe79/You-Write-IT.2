const pipeline = require('../services/core/pipeline');
const { validators, CONTRACT_VERSION } = require('../services/core/contracts');
const { ValidationError, serializeError } = require('../services/core/errors');

async function generate(req, res) {
  try {
    // HARD ENFORCEMENT: throws if invalid
    validators.validateGenerateStoryRequest(req.body);

    const { mode, input, options } = req.body;
    const result = await pipeline.run(mode, input, options);
    
    const response = { result };
    // HARD ENFORCEMENT: throws if invalid
    validators.validateGenerateStoryResponse(response);
    
    res.json(response);
  } catch (err) {
    res.status(err.status || 500).json(serializeError(err));
  }
}

module.exports = { generate };
