import prisma from '../config/db.js';
import logger from '../config/logger.js';
import { getToolConfig } from '../config/toolRegistry.js';

/**
 * Per-tool rate limiter middleware.
 * Uses the tool registry's rateLimit config (maxPerHour, maxPerDay).
 * Checks AIJob count for the user + tool type within the time window.
 *
 * Usage: router.post('/tool', toolRateLimit('TAILOR_RESUME'), handler)
 */
export function toolRateLimit(toolId) {
  const toolConfig = getToolConfig(toolId);
  if (!toolConfig) {
    return (req, res, next) => next(); // Unknown tool = no limit
  }

  const { maxPerHour = 10, maxPerDay = 50 } = toolConfig.rateLimit || {};

  return async (req, res, next) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);

      // Count jobs in the last hour
      const hourlyCount = await prisma.aIJob.count({
        where: {
          userId,
          type: toolId,
          createdAt: { gte: oneHourAgo },
        },
      });

      if (hourlyCount >= maxPerHour) {
        logger.warn({ userId, toolId, hourlyCount, maxPerHour }, 'Hourly rate limit hit');
        return res.status(429).json({
          error: 'Rate limit exceeded',
          message: `You can use ${toolConfig.name} up to ${maxPerHour} times per hour. Try again later.`,
          retryAfter: 60, // minutes
        });
      }

      // Count jobs today
      const dailyCount = await prisma.aIJob.count({
        where: {
          userId,
          type: toolId,
          createdAt: { gte: startOfDay },
        },
      });

      if (dailyCount >= maxPerDay) {
        logger.warn({ userId, toolId, dailyCount, maxPerDay }, 'Daily rate limit hit');
        return res.status(429).json({
          error: 'Daily limit reached',
          message: `You've used ${toolConfig.name} ${dailyCount} times today (max ${maxPerDay}). Try again tomorrow.`,
          retryAfter: 1440, // minutes
        });
      }

      // Attach usage info for downstream
      req.toolUsage = { toolId, hourlyCount, dailyCount, maxPerHour, maxPerDay };
      next();
    } catch (error) {
      logger.error({ err: error, userId, toolId }, 'Rate limit check error');
      next(); // Fail open — don't block on rate limit errors
    }
  };
}
