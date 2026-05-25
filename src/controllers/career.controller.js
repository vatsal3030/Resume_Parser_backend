import prisma from '../config/db.js';
import { aiQueue } from '../queues/ai.queue.js';
import { rewriteBullet, gradeMockInterview } from '../services/ai.service.js';
import logger from '../config/logger.js';

// Synchronous small AI tasks
export const rewriteResumeBullet = async (req, res) => {
  try {
    const { text, action, modelId } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const result = await rewriteBullet(text, action, modelId);
    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Failed to rewrite bullet');
    res.status(500).json({ error: 'Failed to rewrite bullet point' });
  }
};

// Asynchronous background AI tasks
export const requestTailoring = async (req, res) => {
  try {
    const { resumeId, jobDescription, modelId } = req.body;

    const resume = await prisma.document.findUnique({
      where: { id: resumeId, userId: req.user.id }
    });

    if (!resume) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    // Create DB AI Job
    const aiJob = await prisma.aIJob.create({
      data: {
        userId: req.user.id,
        type: 'TAILOR_RESUME',
        status: 'PENDING',
        inputPayload: { resumeId, jobDescription, modelId }
      }
    });

    // Enqueue
    await aiQueue.add('TAILOR_RESUME', {
      jobId: aiJob.id,
      userId: req.user.id,
      resumeId,
      resumeText: JSON.stringify(resume.content),
      jobDescription,
      modelId
    }, { jobId: aiJob.id });

    res.status(202).json({ 
      message: 'Tailoring started',
      jobId: aiJob.id
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to queue tailoring job');
    res.status(500).json({ error: 'Failed to start tailoring process' });
  }
};

export const requestCoverLetter = async (req, res) => {
  try {
    const { resumeId, jobDescription, companyName, modelId } = req.body;

    const resume = await prisma.document.findUnique({
      where: { id: resumeId, userId: req.user.id }
    });

    if (!resume) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    const aiJob = await prisma.aIJob.create({
      data: {
        userId: req.user.id,
        type: 'GENERATE_COVER_LETTER',
        status: 'PENDING',
        inputPayload: { resumeId, jobDescription, companyName, modelId }
      }
    });

    await aiQueue.add('GENERATE_COVER_LETTER', {
      jobId: aiJob.id,
      userId: req.user.id,
      resumeId,
      resumeText: JSON.stringify(resume.content),
      jobDescription,
      companyName,
      modelId
    }, { jobId: aiJob.id });

    res.status(202).json({ 
      message: 'Cover letter generation started',
      jobId: aiJob.id
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to queue cover letter job');
    res.status(500).json({ error: 'Failed to start cover letter generation' });
  }
};

export const requestMockInterview = async (req, res) => {
  try {
    const { resumeId, targetRole, modelId } = req.body;

    const resume = await prisma.document.findUnique({
      where: { id: resumeId, userId: req.user.id }
    });

    if (!resume) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    const aiJob = await prisma.aIJob.create({
      data: {
        userId: req.user.id,
        type: 'GENERATE_MOCK_INTERVIEW',
        status: 'PENDING',
        inputPayload: { resumeId, targetRole, modelId }
      }
    });

    await aiQueue.add('GENERATE_MOCK_INTERVIEW', {
      jobId: aiJob.id,
      userId: req.user.id,
      resumeId,
      resumeText: JSON.stringify(resume.content),
      targetRole,
      modelId
    }, { jobId: aiJob.id });

    res.status(202).json({ 
      message: 'Mock interview generation started',
      jobId: aiJob.id
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to queue mock interview job');
    res.status(500).json({ error: 'Failed to start mock interview generation' });
  }
};

export const requestGradeInterview = async (req, res) => {
  try {
    const { answers, questions, modelId } = req.body;
    
    if (!answers || !questions) {
      return res.status(400).json({ error: 'Answers and questions are required' });
    }

    const result = await gradeMockInterview(answers, questions, modelId);
    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Failed to grade interview');
    res.status(500).json({ error: 'Failed to grade interview' });
  }
};

export const requestRoadmap = async (req, res) => {
  try {
    const { resumeId, targetRole, modelId } = req.body;

    const resume = await prisma.document.findUnique({
      where: { id: resumeId, userId: req.user.id }
    });

    if (!resume) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    const aiJob = await prisma.aIJob.create({
      data: {
        userId: req.user.id,
        type: 'GENERATE_ROADMAP',
        status: 'PENDING',
        inputPayload: { resumeId, targetRole, modelId }
      }
    });

    await aiQueue.add('GENERATE_ROADMAP', {
      jobId: aiJob.id,
      userId: req.user.id,
      resumeId,
      resumeText: JSON.stringify(resume.content),
      targetRole,
      modelId
    }, { jobId: aiJob.id });

    res.status(202).json({ 
      message: 'Roadmap generation started',
      jobId: aiJob.id
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to queue roadmap job');
    res.status(500).json({ error: 'Failed to start roadmap generation' });
  }
};

export const requestPortfolio = async (req, res) => {
  try {
    const { resumeId, modelId } = req.body;

    const resume = await prisma.document.findUnique({
      where: { id: resumeId, userId: req.user.id }
    });

    if (!resume) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    const aiJob = await prisma.aIJob.create({
      data: {
        userId: req.user.id,
        type: 'GENERATE_PORTFOLIO',
        status: 'PENDING',
        inputPayload: { resumeId, modelId }
      }
    });

    await aiQueue.add('GENERATE_PORTFOLIO', {
      jobId: aiJob.id,
      userId: req.user.id,
      resumeId,
      resumeText: JSON.stringify(resume.content),
      modelId
    }, { jobId: aiJob.id });

    res.status(202).json({ 
      message: 'Portfolio generation started',
      jobId: aiJob.id
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to queue portfolio job');
    res.status(500).json({ error: 'Failed to start portfolio generation' });
  }
};

export const requestGitHubAnalysis = async (req, res) => {
  try {
    const { githubUsername, modelId } = req.body;

    if (!githubUsername) {
      return res.status(400).json({ error: 'GitHub username is required' });
    }

    const aiJob = await prisma.aIJob.create({
      data: {
        userId: req.user.id,
        type: 'ANALYZE_GITHUB',
        status: 'PENDING',
        inputPayload: { githubUsername, modelId }
      }
    });

    await aiQueue.add('ANALYZE_GITHUB', {
      jobId: aiJob.id,
      userId: req.user.id,
      githubUsername,
      modelId
    }, { jobId: aiJob.id });

    res.status(202).json({ 
      message: 'GitHub analysis started',
      jobId: aiJob.id
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to queue github analysis job');
    res.status(500).json({ error: 'Failed to start github analysis' });
  }
};
