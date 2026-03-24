/**
 * Branch Worker - Processes async branching jobs
 */

const { Worker } = require('bullmq');
const { generateBranches } = require('../services/branches/BranchManager');
const { logger } = require('../services/core/tracing');
const { branchQueue, redisConnection } = require('../queue');

async function startBranchWorker() {
  const worker = new Worker('branching', async (job) => {
    const { sessionId, input, branches, initialState, branchId } = job.data;

    logger.info('Processing branching job', {
      sessionId,
      jobName: job.name,
    });

    const result = await generateBranches({
      sessionId,
      input,
      branches,
      initialState,
      branchId,
    });

    logger.info('Branching job complete', { sessionId });
    return result;
  }, {
    connection: redisConnection,
  });

  worker.on('completed', (job) => {
    logger.info('Branch job completed', { jobId: job.id });
  });

  worker.on('failed', (job, err) => {
    logger.error('Branch job failed', {
      jobId: job?.id,
      error: err.message,
    });
  });

  return worker;
}

module.exports = { startBranchWorker };
