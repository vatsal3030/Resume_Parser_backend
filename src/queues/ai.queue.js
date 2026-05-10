import { Queue } from 'bullmq';
import { createRedisConnection } from '../config/redis.js';

export const AI_QUEUE_NAME = 'ai-tasks-queue';

/**
 * AI Task Queue — Upstash Free Tier Optimized
 * 
 * Key optimizations to stay within 500k commands/month:
 * 
 * 1. removeOnComplete: true  → Immediately purge completed jobs (saves storage + list commands)
 * 2. removeOnFail: 50        → Keep only last 50 failures (down from 1000)
 * 3. attempts: 2             → Reduce retries (each retry = many Redis commands)
 * 4. backoff delay: 5000ms   → Longer waits between retries = fewer polling commands
 */
export const aiQueue = new Queue(AI_QUEUE_NAME, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 5000, // 5s, 10s — slower backoff saves commands
    },
    removeOnComplete: true,  // Immediately remove completed jobs from Redis
    removeOnFail: 50,        // Keep only 50 failed jobs (was 1000)
  },
});

/**
 * Helper to enqueue a job
 */
export const enqueueAIJob = async (jobId, type, payload) => {
  return await aiQueue.add(type, payload, { jobId });
};
