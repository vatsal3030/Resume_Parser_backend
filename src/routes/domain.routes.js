import express from 'express';
import { protect as verifyToken } from '../middlewares/auth.middleware.js';
import { getRecentActivity } from '../services/activity.service.js';
import { getNotifications, markAsRead, markAllAsRead } from '../services/notification.service.js';
import { getActiveWorkflows } from '../services/workflow.service.js';
import { getUserGenerations, getUserCostSummary } from '../services/generation.ledger.service.js';

const router = express.Router();

// ===== Activity Feed =====
router.get('/activity', verifyToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const events = await getRecentActivity(req.user.id, limit);
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch activity feed' });
  }
});

// ===== Notifications =====
router.get('/notifications', verifyToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const notifications = await getNotifications(req.user.id, limit);
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

router.patch('/notifications/:id/read', verifyToken, async (req, res) => {
  try {
    await markAsRead(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

router.patch('/notifications/read-all', verifyToken, async (req, res) => {
  try {
    await markAllAsRead(req.user.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

// ===== Workflows =====
router.get('/workflows', verifyToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const workflows = await getActiveWorkflows(req.user.id, limit);
    res.json(workflows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch workflows' });
  }
});

// ===== AI Generation Ledger =====
router.get('/generations', verifyToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const generations = await getUserGenerations(req.user.id, limit);
    res.json(generations);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch generation history' });
  }
});

router.get('/generations/summary', verifyToken, async (req, res) => {
  try {
    const summary = await getUserCostSummary(req.user.id);
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch cost summary' });
  }
});

export default router;
