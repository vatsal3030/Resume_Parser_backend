import express from 'express';
import { protect as verifyToken } from '../middlewares/auth.middleware.js';
import {
  listHistory,
  getHistoryItem,
  updateHistoryItem,
  deleteHistoryItem,
  restoreHistoryItem,
  listTrash,
  permanentDeleteItem,
  emptyTrash,
  clearHistory,
} from '../controllers/history.controller.js';

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// Bulk soft-delete
router.delete('/clear', clearHistory);

// Trash routes (must be before /:id to avoid route collision)
router.get('/trash', listTrash);
router.delete('/trash/empty', emptyTrash);

// CRUD operations
router.get('/', listHistory);
router.get('/:id', getHistoryItem);
router.put('/:id', updateHistoryItem);
router.delete('/:id', deleteHistoryItem);

// Restore & permanent delete
router.post('/:id/restore', restoreHistoryItem);
router.delete('/:id/permanent', permanentDeleteItem);

export default router;
