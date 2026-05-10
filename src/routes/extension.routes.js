import express from 'express';
import { protect } from '../middlewares/auth.middleware.js';
import { checkJobFit } from '../controllers/extension.controller.js';

const router = express.Router();

router.post('/fit', protect, checkJobFit);

export default router;
