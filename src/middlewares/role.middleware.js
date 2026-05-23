import logger from '../config/logger.js';

/**
 * Middleware to restrict access to ADMIN users only.
 * Must be used AFTER the `protect` authentication middleware.
 */
export const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized: No user found in request' });
  }

  if (req.user.role !== 'ADMIN') {
    logger.warn({ userId: req.user.id }, 'Unauthorized admin access attempt');
    return res.status(403).json({ error: 'Forbidden: Requires ADMIN role' });
  }

  next();
};
