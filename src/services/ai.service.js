import logger from '../config/logger.js';
import { generateAI } from '../providers/ai.provider.js';

// ============================================================================
// Specialized Prompts (The "Career Tools")
// ============================================================================

export const extractDetailsFromPDF = async (resumeText, modelId = null) => {
  const systemInstruction = `You are an expert technical recruiter and resume reviewer who works across ALL industries and domains — not just tech/CSE. Analyze the provided resume document. Return ONLY a raw JSON object, without markdown \`\`\`json blocks.`;
  
  const prompt = `
Extract the following details and strictly format your output as a JSON object:
1. "candidateName": Full name. (string or null)
2. "email": Email address. (string or null)
3. "phone": Phone number. (string or null)
4. "linkedin": LinkedIn URL. (string or null)
5. "github": GitHub URL. (string or null)
6. "portfolio": Personal website, portfolio URL, Behance, Dribbble, or custom domain URL. (string or null)
7. "atsScore": A simulated ATS score out of 100. (number)
8. "jobFitScore": A general job fit score out of 100 for roles matching their domain. (number)
8. "summary": A professional summary (3-4 sentences). (string)
9. "strengths": Array of key strengths. (Array of strings)
10. "weaknesses": Array of areas of improvement. (Array of strings)
11. "suggestions": Array of actionable advice. (Array of strings)
12. "recommendedDoc": An improved, reorganized version of their resume in Markdown format.
13. "detectedDomain": The candidate's primary domain/field detected from education, skills, and experience (e.g., "Computer Science", "Mechanical Engineering", "Electrical Engineering", "Civil Engineering", "MBA / Business Administration", "Finance", "Marketing", "UI/UX Design", "Data Science", "Medical / Healthcare", "Law", "Architecture", "Chemical Engineering", etc.) (string)
14. "roleFitExplanation": A 2-3 sentence explanation of why the candidate fits (or doesn't fit) their apparent target role, what strengths they bring, and what gaps exist. (string)
15. "suggestedRoles": Array of 3-5 best-fit job roles for this candidate based on their resume. Each should be an object with:
    - "role": Job title (string)
    - "matchPercentage": How well their resume matches this role (number, 0-100)
    - "reasoning": Brief one-line reason (string)

IMPORTANT: The candidate may come from ANY domain — engineering, business, arts, science, medical, law, etc. Do NOT assume they are from Computer Science. Detect their actual domain from their education section, skills, and work experience.

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
  const systemInstruction = `You are an expert interviewer who has conducted 10,000+ interviews across all industries and domains. You personalize interviews based on the candidate's actual background from their resume. Output ONLY a raw JSON object.`;
  const prompt = `
IMPORTANT: First analyze the candidate's resume to detect their primary domain/field (e.g., Computer Science, Mechanical Engineering, Electrical Engineering, Civil Engineering, MBA, Finance, Marketing, Design, Medical, Law, Data Science, etc.). The interview MUST be tailored to their actual domain, not assumed to be CSE/IT.

Based on the candidate's resume and their target role (${targetRole}), generate a comprehensive 6-round mock interview simulation.

Return a JSON object with:
- "detectedDomain": The candidate's primary domain/field detected from their resume
- "interviewLevel": "Entry" | "Mid" | "Senior" based on experience
- "rounds": Array of 6 rounds

Each round object must have:
1. "title": Descriptive round title (e.g., "Round 1: Aptitude & Logical Reasoning")
2. "type": One of "aptitude", "mcq", "technical", "coding", "project_discussion", "behavioral"
3. "description": 1-line description of what this round tests
4. "questions": Array of exactly 5 questions

Round structure:
- Round 1 (aptitude): Logic puzzles, math reasoning, pattern recognition, probability — universal for all domains
- Round 2 (mcq): Domain-specific technical MCQs with 4 options each (e.g., CS: OS/DBMS/Networks, Mech: Thermodynamics/Strength of Materials, MBA: Case studies)
- Round 3 (coding/technical): For tech roles: DSA problems. For non-tech: domain-specific problem-solving (case studies, calculations, design problems)
- Round 4 (technical): Core subject deep-dive based on their resume skills and domain (system design for senior tech, domain theory for others)
- Round 5 (project_discussion): Questions about their specific projects mentioned in resume, probing depth of understanding
- Round 6 (behavioral): HR round with STAR-method situational questions, conflict resolution, leadership, teamwork

Each question object must have:
- "id": Unique string ID (e.g., "r1_q1")
- "question": The actual question text (be specific and realistic)
- "difficulty": "Easy" | "Medium" | "Hard"
- "timeMinutes": Suggested time to answer (1-15 minutes)
- "context": Why this question is being asked / what it tests
- "options": (Required ONLY for "mcq" type) Array of exactly 4 string options
- "expectedAnswerGuidance": Detailed key points for a perfect answer (or correct option for MCQ)

CRITICAL RULES:
1. Questions MUST be personalized to the candidate's actual skills, projects, and experience from their resume
2. For non-CSE candidates, do NOT ask coding/DSA questions — ask domain-relevant problem-solving instead
3. MCQ options should have plausible distractors, not obviously wrong answers
4. Difficulty should progressively increase within each round
5. Project discussion questions should reference SPECIFIC projects from their resume

Resume:
${resumeText}
`;
  return await generateAI({ prompt, systemInstruction, responseFormat: 'json', modelId });
};

export const gradeMockInterview = async (answers, questions, modelId = null) => {
  const systemInstruction = `You are a strict but fair technical interviewer grading a mock interview. Output ONLY a raw JSON object.`;
  const prompt = `
You are grading a candidate's mock interview. 
Here are the questions that were asked, along with the expected guidance for full credit:
${JSON.stringify(questions, null, 2)}

Here are the candidate's answers:
${JSON.stringify(answers, null, 2)}

Evaluate their performance. Return a JSON object with:
1. "totalScore": A number out of 100.
2. "feedbackSummary": A 3-4 sentence general feedback summary.
3. "rounds": An array corresponding to the rounds they completed. Each round should have:
   - "title": Round title
   - "score": Score out of 100 for this round
   - "questionFeedback": An array of objects for each question in the round containing:
      - "questionId": The ID of the question
      - "score": Score out of 10 (0-10)
      - "feedback": Specific feedback on their answer. What was good, what was missing.
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
  If any data is missing from the resume, invent plausible default professional values based on the overall profile.
  
  Return a JSON object with this exact structure:
  1. "header": { "name": "...", "title": "...", "tagline": "..." }
  2. "about": "A compelling 2-paragraph bio."
  3. "skills": Array of strings ONLY (e.g., ["React", "Node.js", "Python"]). Do NOT group into objects.
  4. "projects": Array of objects { "name": "...", "description": "...", "techStack": ["..."], "liveUrl": "..." } (Extract from experience/projects, and include a liveUrl if provided)
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
        topics: r.topics,
        homepage: r.homepage
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
  2. "gitRoast": A witty, slightly sarcastic but good-natured roasting or praising of their coding habits (1-2 sentences).
  3. "topLanguages": Array of objects { "name": "...", "percentage": "...", "repoCount": ... } (e.g., { "name": "JavaScript", "percentage": "45%", "repoCount": 5 })
  4. "topRepos": Array of top 3 repositories { "name": "...", "description": "Write a short, engaging description for this repo based on its data.", "stars": ..., "language": "...", "liveUrl": "..." } (Extract liveUrl from homepage if provided, otherwise leave empty)
  5. "strengths": Array of strings based on the repo analysis.
  6. "areasForGrowth": Array of strings (what they should build next).
  7. "overallScore": Score out of 100 based on activity and project complexity.
  8. "stackCombinations": Array of short strings (e.g., ["MERN Stack", "JAMstack", "AI/ML Focus", "Backend Specialist"]) based on their repos.
  9. "codeComplexity": String (e.g., "High", "Medium", "Low") based on the types of projects.
  10. "commitStyle": String (e.g., "Weekend Warrior", "Night Owl", "Consistent Daily", "Burst Coder") simulating a commit time distribution archetype.

  GitHub Data:
  ${JSON.stringify(githubData || "No public data found", null, 2)}
  `;
  return await generateAI({ prompt, systemInstruction, responseFormat: 'json', modelId });
};

export const generateGitHubReadme = async (githubUsername, analysisData, modelId = null) => {
  const systemInstruction = `You are an expert developer advocate and technical writer. Generate a stunning, professional GitHub profile README.md file. Return ONLY the raw Markdown content — no JSON wrapping, no code fences around the entire output. The README should be ready to paste directly into a GitHub profile repository.`;
  const prompt = `
Generate a professional and visually appealing GitHub profile README.md for the user "@${githubUsername}".

Use the following analysis data to personalize the README:
- Developer Archetype: ${analysisData.developerArchetype || 'Developer'}
- Overall Score: ${analysisData.overallScore || 'N/A'}/100
- Top Languages: ${JSON.stringify(analysisData.topLanguages || [])}
- Top Repos: ${JSON.stringify(analysisData.topRepos || [])}
- Strengths: ${JSON.stringify(analysisData.strengths || [])}
- Areas for Growth: ${JSON.stringify(analysisData.areasForGrowth || [])}
- Stack Combinations: ${JSON.stringify(analysisData.stackCombinations || [])}
- Code Complexity: ${analysisData.codeComplexity || 'Medium'}
- Commit Style: ${analysisData.commitStyle || 'Active'}

Requirements:
1. Start with an engaging header using the developer archetype as a tagline
2. Include a brief "About Me" section based on their strengths and stack
3. Add a "Tech Stack" section with relevant emoji badges for their top languages
4. Include a "Featured Projects" section highlighting their top repos with descriptions
5. Add GitHub stats using shields.io badges (e.g., profile views counter, GitHub stats card, top languages card, streak stats). Use the actual username "${githubUsername}" in all badge URLs.
6. Include a fun "Git Roast" or fun fact section
7. Add social/connect section placeholders
8. Use appropriate emojis, headers, and formatting
9. Keep it concise but impactful — around 60-100 lines of markdown
10. Use GitHub-flavored markdown only

The generated README should be modern, clean, and stand out.
  `;
  return await generateAI({ prompt, systemInstruction, responseFormat: 'text', modelId });
};
