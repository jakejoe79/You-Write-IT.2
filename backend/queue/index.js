/**
 * Queue System - BullMQ integration for async job processing
 */

const { Queue, Worker } = require('bullmq');
const redisConnection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
};

const generationQueue = new Queue('generation', {
  connection: redisConnection,
});

const branchQueue = new Queue('branching', {
  connection: redisConnection,
});

module.exports = {
  generationQueue,
  branchQueue,
  redisConnection,
};
