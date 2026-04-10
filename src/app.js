import express from 'express';
import cors from 'cors';
import { API_PREFIX } from './constants.js';
import resumeRoutes from './routes/resume.routes.js';

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use(`${API_PREFIX}/resumes`, resumeRoutes);

app.get('/', (req, res) => {
  res.send('API is running...');
});

export default app;
