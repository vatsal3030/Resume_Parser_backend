import express from 'express';
import { protect as verifyToken } from '../middlewares/auth.middleware.js';
import {
  listTemplates,
  getTemplate,
  listStudioResumes,
  createStudioResume,
  getStudioResume,
  updateStudioResume,
  deleteStudioResume,
  duplicateStudioResume,
  importFromParsed,
} from '../controllers/studio.controller.js';

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// Templates (read-only for users)
router.get('/templates', listTemplates);
router.get('/templates/:id', getTemplate);

// Studio Resumes CRUD
router.get('/resumes', listStudioResumes);
router.post('/resumes', createStudioResume);
router.get('/resumes/:id', getStudioResume);
router.put('/resumes/:id', updateStudioResume);
router.delete('/resumes/:id', deleteStudioResume);

// Actions
router.post('/resumes/:id/duplicate', duplicateStudioResume);
router.post('/resumes/import/:resumeId', importFromParsed);

export default router;
