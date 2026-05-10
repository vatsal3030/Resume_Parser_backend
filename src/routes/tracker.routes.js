import express from 'express';
import { protect } from '../middlewares/auth.middleware.js';
import { 
  getApplications, 
  createApplication, 
  updateApplication, 
  deleteApplication 
} from '../controllers/tracker.controller.js';

const router = express.Router();

router.route('/')
  .get(protect, getApplications)
  .post(protect, createApplication);

router.route('/:id')
  .put(protect, updateApplication)
  .delete(protect, deleteApplication);

export default router;
