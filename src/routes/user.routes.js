import express from 'express';
import { protect } from '../middlewares/auth.middleware.js';
import { onboardUser, getUserDetails } from '../controllers/user.controller.js';

const router = express.Router();

router.get('/me', protect, getUserDetails);
router.post('/onboard', protect, onboardUser);

export default router;
