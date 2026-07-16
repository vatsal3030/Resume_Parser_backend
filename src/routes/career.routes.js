import express from 'express';
import { protect } from '../middlewares/auth.middleware.js';
import { enforceQuota } from '../middlewares/quota.middleware.js';
import { strictRateLimiter } from '../middlewares/rateLimit.middleware.js';
import { creditGuard } from '../middlewares/creditGuard.middleware.js';
import { toolRateLimit } from '../middlewares/toolRateLimit.middleware.js';
import { requireFields } from '../utils/validation.js';
import { 
  rewriteResumeBullet, 
  requestTailoring, 
  requestCoverLetter, 
  requestMockInterview,
  requestRoadmap,
  requestPortfolio,
  requestGitHubAnalysis,
  requestGradeInterview,
  requestGitHubReadme
} from '../controllers/career.controller.js';

const router = express.Router();

/**
 * AI Guard Stack (applied to all career routes):
 * 1. protect          → JWT auth
 * 2. strictRateLimiter → IP-level rate limit (global)
 * 3. enforceQuota      → Daily generation cap + concurrent job limit
 * 4. creditGuard(tool) → Per-tool credit deduction + audit logging
 * 5. toolRateLimit(tool) → Per-tool hourly/daily rate limit
 */

// Synchronous AI Tools (micro — low credit cost)
router.post('/rewrite-bullet',
  protect, strictRateLimiter, enforceQuota,
  creditGuard('REWRITE_BULLET'), toolRateLimit('REWRITE_BULLET'),
  requireFields('text'), rewriteResumeBullet
);

// Asynchronous Queue-based AI Tools
router.post('/tailor-resume',
  protect, strictRateLimiter, enforceQuota,
  creditGuard('TAILOR_RESUME'), toolRateLimit('TAILOR_RESUME'),
  requireFields('resumeId', 'jobDescription'), requestTailoring
);

router.post('/cover-letter',
  protect, strictRateLimiter, enforceQuota,
  creditGuard('GENERATE_COVER_LETTER'), toolRateLimit('GENERATE_COVER_LETTER'),
  requireFields('resumeId', 'jobDescription'), requestCoverLetter
);

router.post('/mock-interview',
  protect, strictRateLimiter, enforceQuota,
  creditGuard('GENERATE_MOCK_INTERVIEW'), toolRateLimit('GENERATE_MOCK_INTERVIEW'),
  requireFields('resumeId', 'targetRole'), requestMockInterview
);

router.post('/grade-interview',
  protect, strictRateLimiter, enforceQuota,
  creditGuard('GRADE_MOCK_INTERVIEW'), toolRateLimit('GRADE_MOCK_INTERVIEW'),
  requireFields('answers', 'questions'), requestGradeInterview
);

router.post('/roadmap',
  protect, strictRateLimiter, enforceQuota,
  creditGuard('GENERATE_ROADMAP'), toolRateLimit('GENERATE_ROADMAP'),
  requireFields('resumeId', 'targetRole'), requestRoadmap
);

router.post('/portfolio',
  protect, strictRateLimiter, enforceQuota,
  creditGuard('GENERATE_PORTFOLIO'), toolRateLimit('GENERATE_PORTFOLIO'),
  requireFields('resumeId'), requestPortfolio
);

router.post('/github',
  protect, strictRateLimiter, enforceQuota,
  creditGuard('ANALYZE_GITHUB'), toolRateLimit('ANALYZE_GITHUB'),
  requireFields('githubUsername'), requestGitHubAnalysis
);

router.post('/github-readme',
  protect, strictRateLimiter, enforceQuota,
  creditGuard('GENERATE_GITHUB_README'), toolRateLimit('GENERATE_GITHUB_README'),
  requireFields('githubUsername', 'analysisData'), requestGitHubReadme
);

export default router;
