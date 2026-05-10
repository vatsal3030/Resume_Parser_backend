import express from 'express';
import { upload } from '../middlewares/multer.middleware.js';
import { protect } from '../middlewares/auth.middleware.js';
import { uploadResume, getResumes, getResumeById, getJobStatus } from '../controllers/resume.controller.js';

const router = express.Router();

router.post('/upload', protect, upload.single('resume'), uploadResume);
router.get('/', protect, getResumes);
router.get('/jobs/:jobId', protect, getJobStatus); // Polling endpoint
router.get('/:id', protect, getResumeById);

export default router;
