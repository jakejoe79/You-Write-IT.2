const pipeline = require('../services/core/pipeline');
const { validators, CONTRACT_VERSION } = require('../services/core/contracts');
const { ValidationError, serializeError } = require('../services/core/errors');
const { generationQueue } = require('../queue');

async function generate(req, res) {
  try {
    // HARD ENFORCEMENT: throws if invalid
    validators.validateGenerateStoryRequest(req.body);

    const { mode, input, options } = req.body;
    
    // Add job to queue for async processing
    const job = await generationQueue.add('generate', {
      mode,
      input,
      options,
    });
    
    res.json({ 
      jobId: job.id,
      status: 'queued',
      message: 'Generation job queued for processing',
    });
  } catch (err) {
    res.status(err.status || 500).json(serializeError(err));
  }
}

module.exports = { generate };
