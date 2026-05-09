import express from 'express';
import cors from 'cors';
import { API_PREFIX } from './constants.js';
import resumeRoutes from './routes/resume.routes.js';
import prisma from './config/db.js';

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

// Health check endpoint — pings DB to keep Supabase + Render alive
app.get('/api/health', async (req, res) => {
  try {
    const count = await prisma.resume.count();
    res.status(200).json({
      status: 'ok',
      db: 'connected',
      resumeCount: count,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      db: 'unreachable',
      message: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

export default app;
