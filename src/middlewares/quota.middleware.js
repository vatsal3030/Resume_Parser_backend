import prisma from '../config/db.js';
import { config } from '../config/config.js';
import logger from '../config/logger.js';

/**
 * Middleware to check if a user has exceeded their daily AI generation quota.
 * Prevents runaway costs and API abuse.
 */
export const enforceQuota = async (req, res, next) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // 1. Check Daily Limit
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const generationCount = await prisma.aIGeneration.count({
      where: {
        userId,
        createdAt: {
          gte: today
        }
      }
    });

    if (generationCount >= config.limits.maxGenerationsPerDay) {
      logger.warn({ userId, count: generationCount }, 'User exceeded daily AI quota');
      return res.status(429).json({ 
        error: 'Daily generation limit reached. Please upgrade your plan or try again tomorrow.' 
      });
    }

    // 2. Check for Concurrent Jobs
    // Allow parallel jobs up to maxConcurrentJobs (e.g. 3), ignoring stale jobs older than 3 minutes
    const staleCutoff = new Date(Date.now() - 3 * 60 * 1000);
    const activeJobs = await prisma.aIJob.count({
      where: {
        userId,
        status: { in: ['PENDING', 'PROCESSING'] },
        createdAt: { gte: staleCutoff }
      }
    });

    const maxJobs = config.limits.maxConcurrentJobs || 3;
    if (activeJobs >= maxJobs) {
      logger.warn({ userId, activeJobs, maxJobs }, 'User exceeded concurrent job limit');
      return res.status(429).json({ 
        error: `You have ${activeJobs} AI tasks currently in progress. Please wait for them to finish before starting more.` 
      });
    }

    next();
  } catch (error) {
    logger.error({ err: error, userId }, 'Quota Check Error');
    res.status(500).json({ error: 'Internal Server Error during quota validation' });
  }
};
