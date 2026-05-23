import prisma from '../config/db.js';
import logger from '../config/logger.js';

/**
 * NotificationService — Creates user-facing notifications from domain events.
 * 
 * Notifications are derived from ActivityEvents but add user-specific state
 * (is_read, priority, action_url) to power the TopHeader bell dropdown.
 */

/**
 * Create a notification for a user.
 * 
 * @param {Object} params
 * @param {string} params.userId - The user to notify
 * @param {string} params.title - Notification title
 * @param {string} params.message - Notification body
 * @param {string} [params.eventId] - The source ActivityEvent ID
 * @param {string} [params.actionUrl] - Deep link into the app
 * @param {string} [params.priority] - 'NORMAL', 'HIGH', 'URGENT'
 * @returns {Object} The created Notification record
 */
export const createNotification = async ({ userId, title, message, eventId = null, actionUrl = null, priority = 'NORMAL' }) => {
  try {
    // Idempotency: avoid creating duplicate notifications for the same event/tool run within 1 minute
    const oneMinAgo = new Date(Date.now() - 60 * 1000);
    const duplicate = await prisma.notification.findFirst({
      where: {
        userId,
        title,
        actionUrl,
        createdAt: { gte: oneMinAgo },
      },
    });

    if (duplicate) {
      logger.warn({ userId, title, actionUrl }, '[NotificationService] Duplicate notification blocked (idempotency check)');
      return duplicate;
    }

    const notification = await prisma.notification.create({
      data: {
        userId,
        title,
        message,
        eventId,
        actionUrl,
        priority,
      }
    });

    logger.info({ notificationId: notification.id, userId, title }, `[NotificationService] Notification created`);
    return notification;
  } catch (error) {
    logger.error({ err: error, userId, title }, '[NotificationService] Failed to create notification');
    return null;
  }
};

/**
 * Fetch unread notifications for a user (for the bell dropdown).
 * 
 * @param {string} userId
 * @param {number} [limit=10]
 * @returns {Array} Notifications
 */
export const getNotifications = async (userId, limit = 10) => {
  try {
    return await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  } catch (error) {
    logger.error({ err: error, userId }, '[NotificationService] Failed to fetch notifications');
    return [];
  }
};

/**
 * Mark a notification as read.
 */
export const markAsRead = async (notificationId, userId) => {
  try {
    return await prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });
  } catch (error) {
    logger.error({ err: error, notificationId }, '[NotificationService] Failed to mark as read');
    return null;
  }
};

/**
 * Mark all notifications as read for a user.
 */
export const markAllAsRead = async (userId) => {
  try {
    return await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  } catch (error) {
    logger.error({ err: error, userId }, '[NotificationService] Failed to mark all as read');
    return null;
  }
};
