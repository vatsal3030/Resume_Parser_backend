import { Queue } from 'bullmq';
import { createRedisConnection, isRedisQuotaExceeded, isRedisAvailable } from '../config/redis.js';
import { processAIJob } from '../workers/ai.worker.js';
import { AI_QUEUE_NAME } from '../constants/queue.constants.js';
import logger from '../config/logger.js';

export { AI_QUEUE_NAME };

let bullQueue = null;

const getBullQueue = () => {
  if (isRedisQuotaExceeded()) return null;
  if (!bullQueue) {
    const connection = createRedisConnection();
    if (connection) {
      try {
        bullQueue = new Queue(AI_QUEUE_NAME, {
          connection,
          defaultJobOptions: {
            attempts: 2,
            backoff: {
              type: 'exponential',
              delay: 5000,
            },
            removeOnComplete: true,
            removeOnFail: 50,
          },
        });

        bullQueue.on('error', (err) => {
          if (err?.message?.includes('max requests limit exceeded')) {
            logger.warn('[AI Queue] Upstash request limit reached. BullMQ queue paused; using in-process processor.');
            bullQueue = null;
          }
        });
      } catch (err) {
        logger.warn({ err: err.message }, '[AI Queue] Failed to initialize BullMQ queue, using in-process mode.');
      }
    }
  }
  return bullQueue;
};

// In-Process Concurrency Manager
const activeInProcessTasks = new Set();
const inProcessQueue = [];
const MAX_CONCURRENT_IN_PROCESS = 3;

const runNextInProcess = () => {
  if (activeInProcessTasks.size >= MAX_CONCURRENT_IN_PROCESS || inProcessQueue.length === 0) {
    return;
  }
  const nextTask = inProcessQueue.shift();
  if (!nextTask) return;

  activeInProcessTasks.add(nextTask.jobId);
  setImmediate(async () => {
    try {
      await processAIJob({
        id: nextTask.jobId,
        name: nextTask.type,
        data: nextTask.payload,
        attemptsMade: 0
      });
    } catch (err) {
      logger.error({ jobId: nextTask.jobId, err: err.message }, '[InProcessQueue] AI job execution failed');
    } finally {
      activeInProcessTasks.delete(nextTask.jobId);
      runNextInProcess();
    }
  });
};

/**
 * Hybrid Job Enqueue:
 * Uses BullMQ if Redis is healthy and within quota.
 * Automatically fails over to in-process async processing with zero downtime.
 */
export const enqueueAIJob = async (jobId, type, payload) => {
  const queue = getBullQueue();

  if (queue && isRedisAvailable()) {
    try {
      return await queue.add(type, payload, { jobId });
    } catch (err) {
      if (err?.message?.includes('max requests limit exceeded')) {
        logger.warn({ jobId, type }, '[AI Queue] Upstash limit reached during queue.add(). Running in-process.');
      } else {
        logger.warn({ jobId, err: err.message }, '[AI Queue] BullMQ add failed; falling back to in-process execution.');
      }
    }
  }

  // Resilient in-process async queue
  logger.info({ jobId, type }, '[AI Queue] Running job via in-process background worker');
  inProcessQueue.push({ jobId, type, payload });
  runNextInProcess();
  return { id: jobId, inProcess: true };
};

/**
 * Backward compatibility proxy for any legacy direct `aiQueue.add(...)` calls
 */
export const aiQueue = {
  add: async (type, payload, options = {}) => {
    const jobId = options.jobId || payload.jobId;
    return await enqueueAIJob(jobId, type, payload);
  }
};
