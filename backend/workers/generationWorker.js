/**
 * Generation Worker - Processes async generation jobs
 */

const { Worker } = require('bullmq');
const { generateStory } = require('../services/generator');
const { logger } = require('../services/core/tracing');
const { generationQueue, redisConnection } = require('../queue');

async function startWorker() {
  const worker = new Worker('generation', async (job) => {
    const { sessionId, input, chapters, genre, authorStyle, protagonist } = job.data;

    logger.info('Processing generation job', {
      sessionId,
      jobName: job.name,
    });

    const result = await generateStory({
      sessionId,
      input,
      chapters,
      genre,
      authorStyle,
      protagonist,
    });

    logger.info('Generation job complete', { sessionId });
    return result;
  }, {
    connection: redisConnection,
  });

  worker.on('completed', (job) => {
    logger.info('Job completed', { jobId: job.id });
  });

  worker.on('failed', (job, err) => {
    logger.error('Job failed', {
      jobId: job?.id,
      error: err.message,
    });
  });

  return worker;
}

module.exports = { startWorker };
