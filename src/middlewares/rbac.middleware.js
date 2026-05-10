import prisma from '../config/db.js';

export const requireRole = (requiredRole) => {
  return async (req, res, next) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { role: true }
      });

      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      if (user.role !== requiredRole) {
        return res.status(403).json({ error: `Forbidden: Requires ${requiredRole} role` });
      }

      next();
    } catch (err) {
      res.status(500).json({ error: 'Role check failed' });
    }
  };
};
