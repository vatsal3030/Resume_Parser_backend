import { extractDetailsFromPDF } from '../services/ai.service.js';
import prisma from '../config/db.js';

export const uploadResume = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Please upload a PDF file' });
  }

  try {
    const base64Data = req.file.buffer.toString('base64');
    
    // 1. Get parsed JSON from AI
    const aiData = await extractDetailsFromPDF(base64Data);

    // 2. Save into Prisma
    const resume = await prisma.resume.create({
      data: {
        userId: req.user.id,
        originalName: req.file.originalname,
        candidateName: aiData.candidateName,
        email: aiData.email,
        phone: aiData.phone,
        linkedin: aiData.linkedin,
        github: aiData.github,
        atsScore: aiData.atsScore,
        jobFitScore: aiData.jobFitScore,
        summary: aiData.summary,
        strengths: aiData.strengths || [],
        weaknesses: aiData.weaknesses || [],
        suggestions: aiData.suggestions || [],
        recommendedDoc: aiData.recommendedDoc
      }
    });

    res.status(201).json(resume);

  } catch (err) {
    console.error("Analysis Error:", err);
    res.status(500).json({ error: 'Server Error during analysis' });
  }
};

export const getResumes = async (req, res) => {
  try {
    const resumes = await prisma.resume.findMany({
      where: { userId: req.user.id },
      select: {
          id: true,
          originalName: true,
          atsScore: true,
          jobFitScore: true,
          candidateName: true,
          createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(resumes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getResumeById = async (req, res) => {
  try {
    const resume = await prisma.resume.findUnique({
      where: { id: req.params.id }
    });

    if (!resume || resume.userId !== req.user.id) {
      return res.status(404).json({ error: 'Resume not found or unauthorized' });
    }

    res.json(resume);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
