import express from 'express';
import { protect } from '../middlewares/auth.middleware.js';
import { 
  handleChat, 
  getActiveChat, 
  clearChat, 
  listConversations, 
  createConversation,
  updateConversation,
  deleteConversation 
} from '../controllers/chat.controller.js';

const router = express.Router();

// Multi-conversation management
router.get('/conversations', protect, listConversations);
router.post('/conversations', protect, createConversation);
router.patch('/conversations/:id', protect, updateConversation);
router.delete('/conversations/:id', protect, deleteConversation);

// Chat operations
router.get('/', protect, getActiveChat);
router.post('/', protect, handleChat);
router.delete('/', protect, clearChat);

export default router;
