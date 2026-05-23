import express from 'express';
import { protect } from '../middlewares/auth.middleware.js';
import { onboardUser, getUserDetails, updateProfile } from '../controllers/user.controller.js';

const router = express.Router();

router.get('/me', protect, getUserDetails);
router.post('/onboard', protect, onboardUser);
router.put('/profile', protect, updateProfile);

export default router;
