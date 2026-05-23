import multer from 'multer';

import { config } from '../config/config.js';

// Keep the file in memory to send as Buffer -> Base64 for Gemini inlineData
export const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.limits.maxUploadSizeMB * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});
