import express from 'express';
import { protect } from '../middlewares/auth.middleware.js';
import { getDSAStats, saveDSAUsernames, getSinglePlatformStats } from '../controllers/dsa.controller.js';

const router = express.Router();

router.use(protect);

router.get('/stats', getDSAStats);
router.put('/usernames', saveDSAUsernames);
router.get('/platform/:platform/:username', getSinglePlatformStats);

export default router;
