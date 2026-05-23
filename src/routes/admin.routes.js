import express from 'express';
import { protect } from '../middlewares/auth.middleware.js';
import { requireAdmin } from '../middlewares/role.middleware.js';
import { getPlatformMetrics } from '../controllers/admin.controller.js';

const router = express.Router();

// All admin routes are protected AND require ADMIN role
router.use(protect);
router.use(requireAdmin);

router.get('/metrics', getPlatformMetrics);

export default router;
