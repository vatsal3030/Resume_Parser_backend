import { GoogleGenAI } from '@google/genai';
import logger from '../config/logger.js';
import { generateAI } from '../providers/ai.provider.js';

// Configuration (Kept for chatWithCopilot streaming)
const defaultModel = process.env.GEMINI_MODELS || 'gemini-2.5-flash';
const useOpenRouter = process.env.USE_OPENROUTER === 'true';

// Initialize Gemini (Direct)
const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

// ============================================================================
// Specialized Prompts (The "Career Tools")
// ============================================================================

export const extractDetailsFromPDF = async (resumeText, modelId = null) => {
  const systemInstruction = `You are an expert technical recruiter and resume reviewer. Analyze the provided resume document. Return ONLY a raw JSON object, without markdown \`\`\`json blocks.`;
  
  const prompt = `
Extract the following details and strictly format your output as a JSON object:
1. "candidateName": Full name. (string or null)
2. "email": Email address. (string or null)
3. "phone": Phone number. (string or null)
4. "linkedin": LinkedIn URL. (string or null)
5. "github": GitHub URL. (string or null)
6. "atsScore": A simulated ATS score out of 100. (number)
7. "jobFitScore": A general job fit score out of 100 for a general tech role. (number)
8. "summary": A professional summary (3-4 sentences). (string)
9. "strengths": Array of key strengths. (Array of strings)
10. "weaknesses": Array of areas of improvement. (Array of strings)
11. "suggestions": Array of actionable advice. (Array of strings)
12. "recommendedDoc": An improved, reorganized version of their resume in Markdown format.

Here is the extracted text from the resume:
${resumeText}
`;

  return await generateAI({ prompt, systemInstruction, responseFormat: 'json', modelId });
};

export const rewriteBullet = async (text, action = 'enhance', modelId = null) => {
  const systemInstruction = `You are an expert resume writer. Return ONLY a raw JSON object with a single key "result" containing the rewritten text.`;
  let prompt = '';
  
  if (action === 'quantify') {
    prompt = `Rewrite this resume bullet point to include quantified metrics and impact (even if you have to suggest placeholder numbers like [X]%). Text: "${text}"`;
  } else if (action === 'professional') {
    prompt = `Rewrite this resume bullet point to sound highly professional, using strong action verbs. Text: "${text}"`;
  } else {
    prompt = `Enhance and polish this resume bullet point to make it more impactful for ATS systems. Text: "${text}"`;
  }

  return await generateAI({ prompt, systemInstruction, responseFormat: 'json', modelId });
};

export const tailorResume = async (resumeText, jobDescription, modelId = null) => {
  const systemInstruction = `You are an expert career coach and recruiter. Return ONLY a raw JSON object, without markdown \`\`\`json blocks.`;
  const prompt = `
Take the following Resume and Job Description. 
Tailor the resume to match the job description. Inject relevant ATS keywords from the JD where appropriate without lying.

Return a JSON object:
1. "tailoredSummary": A revised professional summary targeting the JD.
2. "suggestedKeywords": Array of keywords from the JD that the candidate should add.
3. "tailoredBullets": Array of objects { "original": "...", "suggested": "..." } with 3-5 key bullet points rewritten to align with the JD.
4. "matchScore": Number out of 100 indicating how well the current resume matches the JD.

Resume:
${resumeText}

Job Description:
${jobDescription}
`;
  return await generateAI({ prompt, systemInstruction, responseFormat: 'json', modelId });
};

export const generateCoverLetter = async (resumeText, jobDescription, modelId = null) => {
  const systemInstruction = `You are an expert career coach writing a highly compelling cover letter. Output ONLY the raw cover letter text in markdown format.`;
  const prompt = `
Write a professional, modern cover letter for the following job description based on the candidate's resume.
Ensure it is engaging, not overly robotic, and highlights the specific skills from the resume that match the job description.

Resume:
${resumeText}

Job Description:
${jobDescription}
`;
  return await generateAI({ prompt, systemInstruction, responseFormat: 'text', modelId });
};

export const generateMockInterview = async (resumeText, targetRole, modelId = null) => {
  const systemInstruction = `You are an expert technical interviewer at a top company. Output ONLY a raw JSON object.`;
  const prompt = `
Based on the candidate's resume and their target role (${targetRole}), generate a mock interview.
Return a JSON object containing an array called "questions". Each item in the array should be an object with:
1. "type": "technical", "behavioral", or "situational"
2. "question": The interview question.
3. "context": Why you are asking this (based on a specific thing in their resume).
4. "expectedAnswerGuidance": Key points the candidate should cover in a good answer.

Generate exactly 5 highly relevant questions.

Resume:
${resumeText}
`;
  return await generateAI({ prompt, systemInstruction, responseFormat: 'json', modelId });
};

export const generateRoadmap = async (resumeText, targetRole, modelId = null) => {
  const systemInstruction = `You are an expert technical career coach. Output ONLY a raw JSON object.`;
  const prompt = `
  Analyze this resume and identify the skill gaps preventing the candidate from becoming a ${targetRole}.
  Create a step-by-step learning roadmap to bridge these gaps.
  
  Return a JSON object:
  1. "targetRole": "${targetRole}"
  2. "currentLevel": "Beginner | Intermediate | Advanced"
  3. "skillGaps": Array of strings (missing skills)
  4. "roadmap": Array of objects: { "step": 1, "title": "...", "description": "...", "resources": ["..."] }

  Resume:
  ${resumeText}
  `;
  return await generateAI({ prompt, systemInstruction, responseFormat: 'json', modelId });
};

export const generatePortfolio = async (resumeText, modelId = null) => {
  const systemInstruction = `You are an expert web developer and UI/UX designer. Output ONLY a raw JSON object.`;
  const prompt = `
  Take this resume and extract/generate the structure for a stunning personal portfolio website.
  
  Return a JSON object:
  1. "header": { "name": "...", "title": "...", "tagline": "..." }
  2. "about": "A compelling 2-paragraph bio."
  3. "skills": Array of strings, grouped into categories if possible.
  4. "projects": Array of objects { "name": "...", "description": "...", "techStack": ["..."] } (Extract from experience/projects)
  5. "contact": { "email": "...", "linkedin": "...", "github": "..." }

  Resume:
  ${resumeText}
  `;
  return await generateAI({ prompt, systemInstruction, responseFormat: 'json', modelId });
};

export const analyzeGitHub = async (githubUsername, modelId = null) => {
  // First, we fetch real GitHub data
  let githubData = null;
  try {
    const res = await fetch(`https://api.github.com/users/${githubUsername}/repos?sort=updated&per_page=10`);
    if (res.ok) {
      const repos = await res.json();
      githubData = repos.map(r => ({
        name: r.name,
        description: r.description,
        language: r.language,
        stars: r.stargazers_count,
        forks: r.forks_count,
        topics: r.topics
      }));
    }
  } catch (error) {
    logger.error('Failed to fetch github data');
  }

  const systemInstruction = `You are an expert engineering manager. Output ONLY a raw JSON object.`;
  const prompt = `
  Analyze this GitHub profile data for the user ${githubUsername}.
  
  Return a JSON object:
  1. "developerArchetype": "e.g., The React Specialist, The Open Source Contributor, The Full Stack Generalist"
  2. "topLanguages": Array of strings.
  3. "strengths": Array of strings based on the repo analysis.
  4. "areasForGrowth": Array of strings (what they should build next).
  5. "overallScore": Score out of 100 based on activity and project complexity.

  GitHub Data:
  ${JSON.stringify(githubData || "No public data found", null, 2)}
  `;
  return await generateAI({ prompt, systemInstruction, responseFormat: 'json', modelId });
};

export const chatWithCopilot = async function*(history, newMessage) {
  const systemInstruction = `You are the AI Career Copilot, an expert career advisor. Keep your answers concise, practical, and helpful.`;
  
  if (useOpenRouter) {
    const messages = [
      { role: 'system', content: systemInstruction },
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: newMessage }
    ];

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'AI Career OS',
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash',
        messages,
        stream: true
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim() !== '');
      for (const line of lines) {
        if (line === 'data: [DONE]') return;
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.choices && data.choices[0].delta && data.choices[0].delta.content) {
              yield data.choices[0].delta.content;
            }
          } catch (e) {
            // Ignore parse errors on partial streams
          }
        }
      }
    }
  } else {
    // Native Gemini Stream — use generateContentStream (correct SDK method)
    // Build the full conversation as a single prompt since @google/genai
    // does not expose a chat().sendMessageStream() method.
    let fullPrompt = `${systemInstruction}\n\n`;
    for (const msg of history) {
      const label = msg.role === 'assistant' ? 'Assistant' : 'User';
      fullPrompt += `${label}: ${msg.content}\n`;
    }
    fullPrompt += `User: ${newMessage}\nAssistant:`;

    const responseStream = await gemini.models.generateContentStream({
      model: defaultModel,
      contents: fullPrompt,
    });
    
    for await (const chunk of responseStream) {
      if (chunk.text) {
        yield chunk.text;
      }
    }
  }
};
