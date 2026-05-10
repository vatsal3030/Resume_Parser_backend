import { generateContent } from '../services/ai.service.js';
import prisma from '../config/db.js';
import logger from '../config/logger.js';

export const checkJobFit = async (req, res) => {
  try {
    const { jobDescription } = req.body;
    
    if (!jobDescription) {
      return res.status(400).json({ error: 'Job description is required' });
    }

    // Get user's most recent resume document
    const userDoc = await prisma.document.findFirst({
      where: { userId: req.user.id, type: 'RESUME' },
      orderBy: { createdAt: 'desc' }
    });

    // BUG FIX: field is `content`, not `parsedContent`
    if (!userDoc || !userDoc.content) {
      return res.status(400).json({ error: 'No parsed resume found to compare against.' });
    }

    const systemInstruction = `You are an expert ATS (Applicant Tracking System). Return ONLY a JSON object.`;
    const prompt = `
    Compare the following resume against the job description.
    Calculate a fit score out of 100 based on matching skills, experience, and keywords.
    Provide 2-3 brief bullet points of why it matches or what is missing.
    
    Format: {"score": 85, "reasoning": ["Strong React skills match JD", "Missing AWS experience"]}

    Resume:
    ${JSON.stringify(userDoc.content)}

    Job Description:
    ${jobDescription}
    `;

    // BUG FIX: Use the shared generateContent function instead of broken gemini.models.chat()
    const result = await generateContent(prompt, systemInstruction, 'json');

    res.json({
      score: result.score || 0,
      reasoning: result.reasoning || []
    });

  } catch (error) {
    logger.error({ err: error }, 'Failed to check job fit');
    res.status(500).json({ error: 'Failed to analyze job fit' });
  }
};
