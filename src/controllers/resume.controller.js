import { extractDetailsFromPDF } from '../services/ai.service.js';
import prisma from '../config/db.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

export const uploadResume = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Please upload a PDF file' });
  }

  try {
    // 1. Extract raw text from the PDF Buffer instead of converting to base64
    const pdfData = await pdfParse(req.file.buffer);
    const resumeText = pdfData.text;

    // 2. Get parsed JSON from AI using only the extracted text
    const aiData = await extractDetailsFromPDF(resumeText);

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
    console.error("=== UPLOAD ERROR ===");
    console.error("Error name:", err.name);
    console.error("Error message:", err.message);

    // Friendly message for Gemini overload / quota
    const isOverload = err.message?.includes('503') || err.message?.includes('UNAVAILABLE') || err.message?.includes('high demand');
    const isQuotaExhausted = err.message?.includes('429') || err.message?.includes('quota') || err.message?.includes('RESOURCE_EXHAUSTED');

    let friendlyMsg = err.message || 'Server Error during analysis';
    let status = 500;

    if (isQuotaExhausted) {
      friendlyMsg = 'The AI service has reached its request limit (quota exceeded). Please try again in a few minutes.';
      status = 429;
    } else if (isOverload) {
      friendlyMsg = 'Gemini AI is temporarily overloaded. Please wait a moment and try again.';
      status = 503;
    }

    res.status(status).json({ error: friendlyMsg });
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
