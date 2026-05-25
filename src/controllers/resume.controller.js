import prisma from '../config/db.js';
import logger from '../config/logger.js';
import { enqueueAIJob } from '../queues/ai.queue.js';
import { emitEvent } from '../services/activity.service.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

export const uploadResume = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Please upload a PDF file' });
  }

  try {
    const userId = req.user.id;
    
    // Ensure User exists in our DB, if not create them (lazy sync with Supabase auth)
    let user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          id: userId,
          email: req.user.email || 'unknown@example.com',
        }
      });
    }

    // 1. Extract raw text from the PDF Buffer
    const render_page = async (pageData) => {
      const render_options = { normalizeWhitespace: false, disableCombineTextItems: false };
      const textContent = await pageData.getTextContent(render_options);
      let text = textContent.items.map(item => item.str).join(' ');
      
      try {
        const annotations = await pageData.getAnnotations();
        const links = annotations
          .filter(a => a.subtype === 'Link' && a.url)
          .map(a => a.url);
        if (links.length > 0) {
          text += '\n\n[Links: ' + links.join(', ') + ']\n\n';
        }
      } catch (err) {
        logger.error({ err }, "Link extraction error");
      }
      return text;
    };

    const pdfData = await pdfParse(req.file.buffer, { pagerender: render_page });
    const resumeText = pdfData.text;

    // 2. Create the AI Job record in the database
    const aiJob = await prisma.aIJob.create({
      data: {
        userId: user.id,
        type: 'PARSE_RESUME',
        status: 'PENDING',
        inputPayload: {
          originalName: req.file.originalname,
          modelId: req.body.modelId || null
        },
        creditsCost: 10
      }
    });

    // 3. Enqueue the background task
    await enqueueAIJob(aiJob.id, 'PARSE_RESUME', {
      jobId: aiJob.id,
      userId: user.id,
      originalName: req.file.originalname,
      resumeText: resumeText
    });

    logger.info({ jobId: aiJob.id, userId: user.id }, 'Resume queued for processing');

    // 3.5 Emit Activity Event for the Upload itself
    await emitEvent({
      type: 'RESUME_UPLOADED',
      actorId: user.id,
      targetId: aiJob.id,
      targetType: 'AI_JOB',
      metadata: { originalName: req.file.originalname, label: 'Resume Uploaded', icon: '📄' }
    });

    // 4. Respond immediately
    res.status(202).json({
      message: 'Resume queued for AI analysis',
      jobId: aiJob.id,
      status: 'PENDING'
    });

  } catch (err) {
    logger.error({ err }, 'Upload Error');
    res.status(500).json({ error: 'Server Error during upload processing' });
  }
};

import redis from '../config/redis.js';

export const getResumes = async (req, res) => {
  try {
    const cacheKey = `resumes:${req.user.id}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    const documents = await prisma.document.findMany({
      where: { userId: req.user.id, type: 'RESUME' },
      select: {
        id: true,
        title: true,
        atsScore: true,
        jobFitScore: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    await redis.set(cacheKey, JSON.stringify(documents), 'EX', 60);
    res.json(documents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getResumeById = async (req, res) => {
  try {
    const document = await prisma.document.findUnique({
      where: { id: req.params.id }
    });

    if (!document || document.userId !== req.user.id) {
      return res.status(404).json({ error: 'Document not found or unauthorized' });
    }

    res.json(document);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Polling endpoint for frontend to check job status
export const getJobStatus = async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await prisma.aIJob.findUnique({
      where: { id: jobId }
    });

    if (!job || job.userId !== req.user.id) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({
      jobId: job.id,
      status: job.status,
      resultPayload: job.resultPayload,
      errorMessage: job.errorMessage
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
