import { GoogleGenAI } from '@google/genai';
import prisma from '../config/db.js';
import { aiQueue } from '../queues/ai.queue.js';
import logger from '../config/logger.js';
import { generateAI } from '../providers/ai.provider.js';

// Configuration
const DEFAULT_FREE_MODEL = process.env.DEFAULT_FREE_MODEL || 'deepseek/deepseek-chat:free';
const DIRECT_GEMINI_FALLBACK = process.env.GEMINI_MODELS || 'gemini-2.5-flash';

// Initialize Gemini (Direct)
const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

// System Prompt describing tools and constraints
const SYSTEM_PROMPT = `You are the AI Career Copilot, an autonomous career advisor and assistant on the Elevara platform.
You can execute actions and trigger background jobs on behalf of the user by calling tools.
To call a tool, you MUST return a single JSON code block of this format:
\`\`\`json
{
  "tool": "toolName",
  "arguments": {
    "argName": "value"
  }
}
\`\`\`

Available tools:
1. listResumes: Lists all resumes of the user. Returns an array of resumes with id and title.
   Arguments: None.
2. getResumeContent: Retrieves the content of a specific resume.
   Arguments: { "resumeId": "string" }
3. tailorResume: Tailors a resume to a job description. This runs a background job.
   Arguments: { "resumeId": "string", "jobDescription": "string", "modelId": "string" }
4. generateCoverLetter: Generates a cover letter based on a resume and job description. This runs a background job.
   Arguments: { "resumeId": "string", "jobDescription": "string", "companyName": "string", "modelId": "string" }
5. generateMockInterview: Generates mock interview questions. This runs a background job.
   Arguments: { "resumeId": "string", "targetRole": "string", "modelId": "string" }
6. generateRoadmap: Generates a skill gap learning roadmap. This runs a background job.
   Arguments: { "resumeId": "string", "targetRole": "string", "modelId": "string" }
7. generatePortfolio: Generates a portfolio website structure. This runs a background job.
   Arguments: { "resumeId": "string", "modelId": "string" }
8. analyzeGitHub: Analyzes a GitHub profile. This runs a background job.
   Arguments: { "githubUsername": "string", "modelId": "string" }
9. navigateTo: Tells the frontend to navigate to a page.
   Arguments: { "path": "string" } (Valid paths: "/dashboard/studio", "/dashboard/tracker", "/dashboard/tools/tailor", "/dashboard/tools/cover-letter", "/dashboard/tools/mock-interview", "/dashboard/tools/roadmap", "/dashboard/tools/portfolio", "/dashboard/tools/github")

Instructions:
- If the user asks to analyze, tailor, generate, or track something and you do not know the resume ID, call listResumes first to see if they have resumes. If they have resumes, ask them which one to use or use the most relevant one. If they have no resumes, tell them to upload a resume first.
- If a tool requires arguments like jobDescription or targetRole, ALWAYS ask the user for them FIRST before calling the tool. Do NOT guess or hallucinate these values.
- When you call a tool, the system will execute it and return the tool output to you in the next turn.
- Only output ONE tool call at a time. Do not add any text before or after the JSON block when calling a tool.
- Once you have enqueued a job, explain to the user in natural language that the job has been enqueued and they will be notified when it is ready.
- If you are ready to respond to the user without calling a tool, write a natural language response.
`;

/**
 * Normalizes the model selection and returns the appropriate provider and model name.
 */
const resolveProviderAndModel = (requestedModelId) => {
  const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;

  if (!requestedModelId || requestedModelId === 'default') {
    if (hasOpenRouter) {
      return { provider: 'openrouter', model: DEFAULT_FREE_MODEL };
    }
    return { provider: 'gemini', model: DIRECT_GEMINI_FALLBACK };
  }

  if (requestedModelId.startsWith('gemini-')) {
    return { provider: 'gemini', model: requestedModelId };
  }

  if (hasOpenRouter) {
     return { provider: 'openrouter', model: requestedModelId };
  }

  logger.warn(`OpenRouter model ${requestedModelId} requested, but OPENROUTER_API_KEY is missing. Falling back to Direct Gemini.`);
  return { provider: 'gemini', model: DIRECT_GEMINI_FALLBACK };
};

/**
 * Call OpenRouter with a messages array
 */
const callOpenRouterMessages = async (model, messages) => {
  logger.info(`Agent calling OpenRouter (Model: ${model})`);
  const cleanReferer = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.replace(/"/g, '').split(',')[0] : 'http://localhost:3000';

  const { default: axios } = await import('axios');
  const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
    model: model,
    messages,
    max_tokens: 4000
  }, {
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': cleanReferer,
      'X-Title': 'Elevara',
    }
  });

  return response.data.choices[0].message.content;
};

/**
 * Call Gemini Direct with a messages array
 */
const callGeminiDirectMessages = async (model, messages) => {
  logger.info(`Agent calling Direct Gemini API (Model: ${model})`);
  const systemInstruction = messages.find(m => m.role === 'system')?.content || '';
  const conversationMessages = messages.filter(m => m.role !== 'system');
  
  const contents = conversationMessages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  const response = await gemini.models.generateContent({
    model: model,
    contents,
    config: {
      systemInstruction,
      maxOutputTokens: 4000
    }
  });

  return response.text;
};

/**
 * Unified Agent call function respecting user's model choice.
 */
export const callAgentAI = async (messages, modelId = null) => {
  const target = resolveProviderAndModel(modelId);
  try {
    if (target.provider === 'openrouter') {
      return await callOpenRouterMessages(target.model, messages);
    } else {
      return await callGeminiDirectMessages(target.model, messages);
    }
  } catch (error) {
    logger.warn({ err: error.message }, `Agent AI: Primary provider (${target.provider}) failed. Attempting fallback.`);
    
    if (target.provider === 'openrouter') {
      try {
        return await callGeminiDirectMessages(DIRECT_GEMINI_FALLBACK, messages);
      } catch (fallbackError) {
        throw new Error('All AI providers failed.');
      }
    } else {
      if (process.env.OPENROUTER_API_KEY) {
        try {
          return await callOpenRouterMessages(DEFAULT_FREE_MODEL, messages);
        } catch (fallbackError) {
          throw new Error('All AI providers failed.');
        }
      }
      throw error;
    }
  }
};

/**
 * Parse JSON tool calls from assistant text
 */
const parseToolCall = (text) => {
  if (!text) return null;
  const match = text.match(/```json\s*([\s\S]*?)\s*```/);
  const jsonStr = match ? match[1] : text;
  
  try {
    const parsed = JSON.parse(jsonStr.trim());
    if (parsed && typeof parsed === 'object' && parsed.tool) {
      return parsed;
    }
  } catch (e) {
    const braceMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try {
        const parsed = JSON.parse(braceMatch[0]);
        if (parsed && typeof parsed === 'object' && parsed.tool) {
          return parsed;
        }
      } catch (innerError) {
        // Ignore
      }
    }
  }
  return null;
};

/**
 * Execute actual tool action in DB or queue
 */
const executeAgentTool = async (userId, toolName, args) => {
  try {
    switch (toolName) {
      case 'listResumes': {
        const resumes = await prisma.document.findMany({
          where: { userId, type: 'RESUME', deletedAt: null },
          select: { id: true, title: true, createdAt: true }
        });
        return resumes;
      }
      case 'getResumeContent': {
        const resume = await prisma.document.findFirst({
          where: { id: args.resumeId, userId }
        });
        if (!resume) return { error: 'Resume not found' };
        return { id: resume.id, title: resume.title, content: resume.content };
      }
      case 'tailorResume': {
        const resume = await prisma.document.findFirst({
          where: { id: args.resumeId, userId }
        });
        if (!resume) return { error: 'Resume not found' };
        const modelId = args.modelId || 'default';
        const aiJob = await prisma.aIJob.create({
          data: {
            userId,
            type: 'TAILOR_RESUME',
            status: 'PENDING',
            inputPayload: { resumeId: args.resumeId, jobDescription: args.jobDescription, modelId }
          }
        });
        await aiQueue.add('TAILOR_RESUME', {
          jobId: aiJob.id,
          userId,
          resumeId: args.resumeId,
          resumeText: JSON.stringify(resume.content),
          jobDescription: args.jobDescription,
          modelId
        }, { jobId: aiJob.id });
        return { success: true, jobId: aiJob.id, message: 'Resume tailoring background job started successfully.' };
      }
      case 'generateCoverLetter': {
        const resume = await prisma.document.findFirst({
          where: { id: args.resumeId, userId }
        });
        if (!resume) return { error: 'Resume not found' };
        const modelId = args.modelId || 'default';
        const aiJob = await prisma.aIJob.create({
          data: {
            userId,
            type: 'GENERATE_COVER_LETTER',
            status: 'PENDING',
            inputPayload: { resumeId: args.resumeId, jobDescription: args.jobDescription, companyName: args.companyName, modelId }
          }
        });
        await aiQueue.add('GENERATE_COVER_LETTER', {
          jobId: aiJob.id,
          userId,
          resumeId: args.resumeId,
          resumeText: JSON.stringify(resume.content),
          jobDescription: args.jobDescription,
          companyName: args.companyName,
          modelId
        }, { jobId: aiJob.id });
        return { success: true, jobId: aiJob.id, message: 'Cover letter generation background job started successfully.' };
      }
      case 'generateMockInterview': {
        const resume = await prisma.document.findFirst({
          where: { id: args.resumeId, userId }
        });
        if (!resume) return { error: 'Resume not found' };
        const modelId = args.modelId || 'default';
        const aiJob = await prisma.aIJob.create({
          data: {
            userId,
            type: 'GENERATE_MOCK_INTERVIEW',
            status: 'PENDING',
            inputPayload: { resumeId: args.resumeId, targetRole: args.targetRole, modelId }
          }
        });
        await aiQueue.add('GENERATE_MOCK_INTERVIEW', {
          jobId: aiJob.id,
          userId,
          resumeId: args.resumeId,
          resumeText: JSON.stringify(resume.content),
          targetRole: args.targetRole,
          modelId
        }, { jobId: aiJob.id });
        return { success: true, jobId: aiJob.id, message: 'Mock interview generation background job started successfully.' };
      }
      case 'generateRoadmap': {
        const resume = await prisma.document.findFirst({
          where: { id: args.resumeId, userId }
        });
        if (!resume) return { error: 'Resume not found' };
        const modelId = args.modelId || 'default';
        const aiJob = await prisma.aIJob.create({
          data: {
            userId,
            type: 'GENERATE_ROADMAP',
            status: 'PENDING',
            inputPayload: { resumeId: args.resumeId, targetRole: args.targetRole, modelId }
          }
        });
        await aiQueue.add('GENERATE_ROADMAP', {
          jobId: aiJob.id,
          userId,
          resumeId: args.resumeId,
          resumeText: JSON.stringify(resume.content),
          targetRole: args.targetRole,
          modelId
        }, { jobId: aiJob.id });
        return { success: true, jobId: aiJob.id, message: 'Career roadmap generation background job started successfully.' };
      }
      case 'generatePortfolio': {
        const resume = await prisma.document.findFirst({
          where: { id: args.resumeId, userId }
        });
        if (!resume) return { error: 'Resume not found' };
        const modelId = args.modelId || 'default';
        const aiJob = await prisma.aIJob.create({
          data: {
            userId,
            type: 'GENERATE_PORTFOLIO',
            status: 'PENDING',
            inputPayload: { resumeId: args.resumeId, modelId }
          }
        });
        await aiQueue.add('GENERATE_PORTFOLIO', {
          jobId: aiJob.id,
          userId,
          resumeId: args.resumeId,
          resumeText: JSON.stringify(resume.content),
          modelId
        }, { jobId: aiJob.id });
        return { success: true, jobId: aiJob.id, message: 'Portfolio generation background job started successfully.' };
      }
      case 'analyzeGitHub': {
        const modelId = args.modelId || 'default';
        const aiJob = await prisma.aIJob.create({
          data: {
            userId,
            type: 'ANALYZE_GITHUB',
            status: 'PENDING',
            inputPayload: { githubUsername: args.githubUsername, modelId }
          }
        });
        await aiQueue.add('ANALYZE_GITHUB', {
          jobId: aiJob.id,
          userId,
          githubUsername: args.githubUsername,
          modelId
        }, { jobId: aiJob.id });
        return { success: true, jobId: aiJob.id, message: 'GitHub analysis background job started successfully.' };
      }
      case 'navigateTo': {
        return { success: true, navigateTo: args.path, message: `Navigating user to ${args.path}` };
      }
      default:
        return { error: `Tool ${toolName} not found` };
    }
  } catch (error) {
    logger.error({ err: error, toolName }, 'Failed to execute agent tool');
    return { error: `Failed to execute tool ${toolName}: ${error.message}` };
  }
};

/**
 * Main Agent Loop runner
 */
export const runAgentLoop = async (userId, message, context = {}) => {
  // Fetch active conversation — respect requested conversationId
  let conversation = null;
  
  if (context.conversationId) {
    conversation = await prisma.conversation.findFirst({
      where: { id: context.conversationId, userId, deletedAt: null },
      include: { messages: { orderBy: { createdAt: 'asc' } } }
    });
  }
  
  if (!conversation) {
    conversation = await prisma.conversation.findFirst({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      include: { messages: { orderBy: { createdAt: 'asc' } } }
    });
  }
  
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { userId, title: 'Copilot Chat' }
    });
    conversation.messages = [];
  }

  // Save user's new message to DB
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: 'user',
      content: message
    }
  });

  // Pull last 15 messages for active model context
  const dbMessages = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'asc' },
    take: 15
  });

  const messages = [
    { role: 'system', content: `${SYSTEM_PROMPT}\n\nUser Context:\n- Current Page Path: ${context.pathname || 'Unknown'}` },
    ...dbMessages.map(m => ({ role: m.role, content: m.content }))
  ];

  let loopCount = 0;
  let actionInfo = null;

  while (loopCount < 5) {
    loopCount++;
    const content = await callAgentAI(messages, context.modelId);
    const toolCall = parseToolCall(content);

    if (toolCall) {
      logger.info({ toolCall }, 'Copilot agent invoking tool');
      const result = await executeAgentTool(userId, toolCall.tool, toolCall.arguments || {});

      // Record actions for SSE payload
      if (toolCall.tool === 'navigateTo' && result.navigateTo) {
        actionInfo = { type: 'navigate', path: result.navigateTo };
      }
      if (result.success && result.jobId) {
        actionInfo = { type: 'job', jobId: result.jobId, tool: toolCall.tool };
      }

      // Add thoughts and result to message queue
      messages.push({ role: 'assistant', content: content });
      messages.push({ role: 'user', content: `Tool execution result: ${JSON.stringify(result)}` });

      // Save intermediate loops to DB
      await prisma.message.createMany({
        data: [
          { conversationId: conversation.id, role: 'assistant', content },
          { conversationId: conversation.id, role: 'user', content: `Tool execution result: ${JSON.stringify(result)}` }
        ]
      });
    } else {
      // Done executing tools. Return context for streaming.
      return { conversationId: conversation.id, messages, actionInfo };
    }
  }

  return { conversationId: conversation.id, messages, actionInfo };
};

/**
 * Stream Final Response Generator
 * Uses requested modelId.
 */
export const streamFinalResponse = async function*(messages, modelId = null) {
  const target = resolveProviderAndModel(modelId);
  const systemInstruction = messages.find(m => m.role === 'system')?.content || '';
  const conversationMessages = messages.filter(m => m.role !== 'system');
  
  try {
    if (target.provider === 'openrouter') {
      const { default: axios } = await import('axios');
      const cleanReferer = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.replace(/"/g, '').split(',')[0] : 'http://localhost:3000';
      const openRouterMessages = [
        { role: 'system', content: systemInstruction },
        ...conversationMessages.map(m => ({ role: m.role, content: m.content }))
      ];
      
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': cleanReferer,
          'X-Title': 'Elevara',
        },
        body: JSON.stringify({
          model: target.model,
          messages: openRouterMessages,
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
      // Gemini Direct Streaming
      const contents = conversationMessages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

      const responseStream = await gemini.models.generateContentStream({
        model: target.model,
        contents,
        config: {
          systemInstruction,
          maxOutputTokens: 8000
        }
      });

      for await (const chunk of responseStream) {
        if (chunk.text) {
          yield chunk.text;
        }
      }
    }
  } catch (error) {
    logger.error({ err: error.message }, 'AI streaming failed.');
    yield `I encountered a temporary issue connecting to the AI service. Please try again in a moment.`;
  }
};

