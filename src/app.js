import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { API_PREFIX } from './constants.js';
import resumeRoutes from './routes/resume.routes.js';
import userRoutes from './routes/user.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import careerRoutes from './routes/career.routes.js';
import trackerRoutes from './routes/tracker.routes.js';
import chatRoutes from './routes/chat.routes.js';
import communityRoutes from './routes/community.routes.js';
import recruiterRoutes from './routes/recruiter.routes.js';
import extensionRoutes from './routes/extension.routes.js';
import domainRoutes from './routes/domain.routes.js';
import adminRoutes from './routes/admin.routes.js';
import historyRoutes from './routes/history.routes.js';
import studioRoutes from './routes/studio.routes.js';
import dsaRoutes from './routes/dsa.routes.js';
import prisma from './config/db.js';
import { globalErrorHandler } from './middlewares/error.middleware.js';
import { standardRateLimiter } from './middlewares/rateLimit.middleware.js';
import { tracingMiddleware } from './utils/tracing.js';

const app = express();

app.use(tracingMiddleware);
app.use(helmet());

// CORS: Only allow frontend origins (Vercel + localhost dev + extensions)
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()) : [])
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server, ping)
    if (!origin) {
      return callback(null, true);
    }
    
    const isAllowed = 
      allowedOrigins.some(allowed => origin.startsWith(allowed)) ||
      origin.startsWith('chrome-extension://') ||
      origin.startsWith('moz-extension://') ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1') ||
      origin.endsWith('.vercel.app') ||
      origin.endsWith('vixora.co.in');

    if (isAllowed) {
      callback(null, true);
    } else {
      // Return false instead of throwing a fatal 500 Error
      callback(null, false);
    }
  },
  credentials: true
}));

app.use(express.json());
app.use(standardRateLimiter);

// Routes
app.use(`${API_PREFIX}/resumes`, resumeRoutes);
app.use(`${API_PREFIX}/users`, userRoutes);
app.use(`${API_PREFIX}/payments`, paymentRoutes);
app.use(`${API_PREFIX}/career`, careerRoutes);
app.use(`${API_PREFIX}/tracker`, trackerRoutes);
app.use(`${API_PREFIX}/chat`, chatRoutes);
app.use(`${API_PREFIX}/community`, communityRoutes);
app.use(`${API_PREFIX}/recruiter`, recruiterRoutes);
app.use(`${API_PREFIX}/extension`, extensionRoutes);
app.use(`${API_PREFIX}/domain`, domainRoutes);
app.use(`${API_PREFIX}/admin`, adminRoutes);
app.use(`${API_PREFIX}/history`, historyRoutes);
app.use(`${API_PREFIX}/studio`, studioRoutes);
app.use(`${API_PREFIX}/dsa`, dsaRoutes);

app.get('/', (req, res) => {
  res.send('API is running...');
});

// Ping & health check endpoints
app.get(['/ping', '/api/ping'], (req, res) => {
  res.status(200).json({ status: 'pong', timestamp: new Date().toISOString() });
});

app.get(['/api/health', '/health'], async (req, res) => {
  try {
    const count = await prisma.document.count();
    res.status(200).json({
      status: 'ok',
      db: 'connected',
      docCount: count,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(200).json({
      status: 'degraded',
      db: 'reconnecting',
      message: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

app.use(globalErrorHandler);

export default app;
