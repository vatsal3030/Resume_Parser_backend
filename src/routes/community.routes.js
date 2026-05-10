import express from 'express';
import { protect } from '../middlewares/auth.middleware.js';
import { 
  createPost, 
  getPosts, 
  getPostById, 
  addComment, 
  toggleUpvote 
} from '../controllers/community.controller.js';

const router = express.Router();

router.get('/', protect, getPosts);
router.post('/', protect, createPost);
router.get('/:id', protect, getPostById);
router.post('/:id/comments', protect, addComment);
router.post('/:id/upvote', protect, toggleUpvote);

export default router;
