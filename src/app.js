import express from 'express';
import cors from 'cors';
import { API_PREFIX } from './constants.js';
import resumeRoutes from './routes/resume.routes.js';

const app = express();

// CORS: Only allow frontend origins (Vercel + localhost dev)
const allowedOrigins = [
  'http://localhost:3000',
  process.env.ALLOWED_ORIGINS // Set this to your Vercel URL in Render env vars
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.) in dev
    if (!origin || allowedOrigins.some(allowed => origin.startsWith(allowed))) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());

// Routes
app.use(`${API_PREFIX}/resumes`, resumeRoutes);

app.get('/', (req, res) => {
  res.send('API is running...');
});

export default app;
