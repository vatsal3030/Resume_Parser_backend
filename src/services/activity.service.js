import prisma from '../config/db.js';
import logger from '../config/logger.js';

/**
 * ActivityService — Centralized event publisher.
 * 
 * Every significant platform action (resume upload, AI completion, etc.)
 * flows through this service to create an immutable ActivityEvent record.
 * Downstream consumers (NotificationService, Dashboard Feed) read from this ledger.
 */

/**
 * Emit a domain event into the activity_events ledger.
 * 
 * @param {Object} params
 * @param {string} params.type - Event type enum (e.g., 'RESUME_UPLOADED', 'AI_JOB_COMPLETED')
 * @param {string} params.actorId - The user who triggered the event
 * @param {string} [params.targetId] - The entity this event is about (resume ID, job ID, etc.)
 * @param {string} [params.targetType] - The entity type ('RESUME', 'AI_JOB', 'COVER_LETTER')
 * @param {Object} [params.metadata] - Flexible payload (title, score, model used, etc.)
 * @returns {Object} The created ActivityEvent record
 */
export const emitEvent = async ({ type, actorId, targetId = null, targetType = null, metadata = null }) => {
  try {
    // Idempotency check: prevent duplicate events within the last 5 minutes
    if (targetId) {
      const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
      const existingEvent = await prisma.activityEvent.findFirst({
        where: {
          type,
          actorId,
          targetId,
          createdAt: { gte: fiveMinsAgo }
        }
      });
      
      if (existingEvent) {
        logger.warn({ type, actorId, targetId }, '[ActivityService] Idempotency check triggered. Skipping duplicate event.');
        return existingEvent;
      }
    }

    const event = await prisma.activityEvent.create({
      data: {
        type,
        actorId,
        targetId,
        targetType,
        metadata,
      }
    });

    logger.info({ eventId: event.id, type, actorId, targetId }, `[ActivityService] Event emitted: ${type}`);
    return event;
  } catch (error) {
    // Activity logging should never crash the parent operation
    logger.error({ err: error, type, actorId }, '[ActivityService] Failed to emit event');
    return null;
  }
};

/**
 * Fetch recent activity events for a user's dashboard feed.
 * 
 * @param {string} userId
 * @param {number} [limit=20]
 * @returns {Array} Recent activity events
 */
export const getRecentActivity = async (userId, limit = 20) => {
  try {
    return await prisma.activityEvent.findMany({
      where: { actorId: userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  } catch (error) {
    logger.error({ err: error, userId }, '[ActivityService] Failed to fetch activity');
    return [];
  }
};
