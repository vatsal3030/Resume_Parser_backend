import express from 'express';
import { protect } from '../middlewares/auth.middleware.js';
import { handleChat } from '../controllers/chat.controller.js';

const router = express.Router();

router.post('/', protect, handleChat);

export default router;
