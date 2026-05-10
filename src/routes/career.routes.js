import express from 'express';
import { protect } from '../middlewares/auth.middleware.js';
import { 
  rewriteResumeBullet, 
  requestTailoring, 
  requestCoverLetter, 
  requestMockInterview,
  requestRoadmap,
  requestPortfolio,
  requestGitHubAnalysis
} from '../controllers/career.controller.js';

const router = express.Router();

// Synchronous AI Tools
router.post('/rewrite-bullet', protect, rewriteResumeBullet);

// Asynchronous Queue-based AI Tools
router.post('/tailor-resume', protect, requestTailoring);
router.post('/cover-letter', protect, requestCoverLetter);
router.post('/mock-interview', protect, requestMockInterview);

// Phase 3 Tools
router.post('/roadmap', protect, requestRoadmap);
router.post('/portfolio', protect, requestPortfolio);
router.post('/github', protect, requestGitHubAnalysis);

export default router;
