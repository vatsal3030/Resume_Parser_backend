import express from 'express';
import { protect } from '../middlewares/auth.middleware.js';
import { 
  createCompany, 
  createJobPosting, 
  getRecruiterDashboard, 
  getJobMatches 
} from '../controllers/recruiter.controller.js';

const router = express.Router();

router.get('/dashboard', protect, getRecruiterDashboard);
router.post('/companies', protect, createCompany);
router.post('/jobs', protect, createJobPosting);
router.get('/jobs/:jobId/matches', protect, getJobMatches);

export default router;
