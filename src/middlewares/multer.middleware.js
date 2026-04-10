import multer from 'multer';

// Keep the file in memory to send as Buffer -> Base64 for Gemini inlineData
export const upload = multer({ storage: multer.memoryStorage() });
