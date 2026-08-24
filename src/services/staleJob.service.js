import prisma from '../config/db.js';
import logger from '../config/logger.js';

/**
 * Stale Job Cleanup Service
 * 
 * Detects and recovers jobs that have been stuck in PENDING or PROCESSING
 * for too long (likely due to worker crashes, Redis disconnects, etc.).
 * 
 * Should be called periodically (e.g., on server start or via cron).
 */

const STALE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes

/**
 * Mark stale PROCESSING jobs as FAILED with a descriptive error.
 * Mark stale PENDING jobs as FAILED (never picked up by worker).
 */
export const cleanupStaleJobs = async () => {
  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS);

  try {
    // 1. Stale PROCESSING jobs (started but never completed)
    const staleProcessing = await prisma.aIJob.updateMany({
      where: {
        status: 'PROCESSING',
        startedAt: { lt: cutoff }
      },
      data: {
        status: 'FAILED',
        errorMessage: 'Job timed out — it was processing for too long and was automatically marked as failed.',
        completedAt: new Date()
      }
    });

    // 2. Stale PENDING jobs (never picked up by worker)
    const stalePending = await prisma.aIJob.updateMany({
      where: {
        status: 'PENDING',
        createdAt: { lt: cutoff }
      },
      data: {
        status: 'FAILED',
        errorMessage: 'Job was never picked up by the worker and timed out. Please try again.',
        completedAt: new Date()
      }
    });

    const total = staleProcessing.count + stalePending.count;
    if (total > 0) {
      logger.warn(
        { staleProcessing: staleProcessing.count, stalePending: stalePending.count },
        `[StaleJobCleanup] Recovered ${total} stale jobs`
      );
    }

    return { recovered: total, processing: staleProcessing.count, pending: stalePending.count };
  } catch (error) {
    logger.error({ err: error }, '[StaleJobCleanup] Failed to clean up stale jobs');
    return { recovered: 0 };
  }
};
