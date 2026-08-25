          import { GoogleGenAI } from '@google/genai';
import logger from '../config/logger.js';

/**
 * AI Provider Layer
 * Abstracts calling different AI providers (OpenRouter vs Google Gemini Direct)
 * Implements resilient fallback mechanisms and modern model routing.
 */

// Safe Lazy Gemini Client
let geminiClientInstance = null;
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in environment.');
  }
  if (!geminiClientInstance) {
    geminiClientInstance = new GoogleGenAI({ apiKey });
  }
  return geminiClientInstance;
};

// Model Constants
const DEFAULT_DIRECT_GEMINI_MODEL = process.env.GEMINI_MODELS || 'gemini-3.6-flash';
const DEFAULT_FREE_OPENROUTER_MODEL = process.env.DEFAULT_FREE_MODEL || 'nvidia/nemotron-3.5-lightning:free';

/**
 * Normalizes direct Google Gemini models.
 * Only maps truly dead/invalid model IDs. Modern models pass through.
 */
const normalizeDirectGeminiModel = (modelId) => {
  if (!modelId) return DEFAULT_DIRECT_GEMINI_MODEL;
  // Map known deprecated Gemini model names to a working fallback
  const deprecatedMap = {
    'gemini-2.5-flash': 'gemini-3.6-flash',
    'gemini-2.5-pro': 'gemini-3.6-flash',
    'gemini-2.0-flash': 'gemini-3.6-flash',
    'gemini-2.0-flash-exp': 'gemini-3.6-flash',
    'gemini-1.5-flash': 'gemini-3.6-flash',
    'gemini-1.5-pro': 'gemini-3.6-flash',
    'gemini-pro': 'gemini-3.6-flash',
  };
  return deprecatedMap[modelId] || modelId;
};

/**
 * Normalizes OpenRouter model IDs.
 * Maps dead/deprecated IDs to verified working alternatives.
 */
const normalizeOpenRouterModel = (modelId) => {
  if (!modelId) return DEFAULT_FREE_OPENROUTER_MODEL;
  const legacyMap = {
    // Dead free models
    'google/gemini-2.0-flash-exp:free': 'google/gemma-4-31b-it:free',
    'google/gemini-2.0-flash-lite-preview-02-05:free': 'google/gemma-4-31b-it:free',
    'google/gemini-2.0-pro-exp-02-05:free': 'google/gemma-4-31b-it:free',
    'meta-llama/llama-3.3-70b-instruct:free': 'google/gemma-4-31b-it:free',
    'qwen/qwen-2.5-72b-instruct:free': 'google/gemma-4-31b-it:free',
    'deepseek/deepseek-r1:free': 'nvidia/nemotron-3-ultra-550b-a55b:free',
    'deepseek/deepseek-v4-flash:free': 'nvidia/nemotron-3.5-lightning:free',
    'nvidia/nemotron-3.5-lightning:free': 'nvidia/nemotron-3.5-lightning:free',
    'google/gemma-4-26b-a4b-it:free': 'google/gemma-4-31b-it:free',
    // Dead paid models → redirect to current versions
    'anthropic/claude-3.5-sonnet': 'anthropic/claude-sonnet-5',
    'anthropic/claude-3-haiku': 'anthropic/claude-haiku-4.5',
    'deepseek/deepseek-chat': 'deepseek/deepseek-v4-flash',
    'openai/gpt-4o-mini': 'openai/gpt-4o-mini', // still alive
  };
  return legacyMap[modelId] || modelId;
};

/**
 * Normalizes the model selection and returns the appropriate provider and model name.
 */
export const resolveProviderAndModel = (requestedModelId) => {
  const hasGeminiKey = !!process.env.GEMINI_API_KEY;
  const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;

  if (!requestedModelId || requestedModelId === 'default') {
    if (hasGeminiKey) {
      return { provider: 'gemini', model: DEFAULT_DIRECT_GEMINI_MODEL };
    }
    if (hasOpenRouter) {
      return { provider: 'openrouter', model: DEFAULT_FREE_OPENROUTER_MODEL };
    }
    return { provider: 'gemini', model: DEFAULT_DIRECT_GEMINI_MODEL };
  }

  // If a specific gemini direct model is requested (starts with 'gemini-')
  if (requestedModelId.startsWith('gemini-')) {
    return { provider: 'gemini', model: normalizeDirectGeminiModel(requestedModelId) };
  }

  // OpenRouter models (contain '/')
  if (hasOpenRouter) {
    return { provider: 'openrouter', model: normalizeOpenRouterModel(requestedModelId) };
  }

  // Fallback if OpenRouter key is missing
  logger.warn(`OpenRouter model ${requestedModelId} requested, but OPENROUTER_API_KEY is missing. Falling back to Direct Gemini.`);
  return { provider: 'gemini', model: DEFAULT_DIRECT_GEMINI_MODEL };
};

/**
 * Robust JSON Parser with Automatic Repair for Truncated or Malformed AI Outputs
 */
export const extractJson = (content) => {
  if (typeof content === 'object' && content !== null) return content;
  if (typeof content !== 'string') throw new Error('Response is not a valid string');

  let str = content.trim();

  // 1. Strip markdown fences
  str = str.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  // 2. Direct parse attempt
  try {
    return JSON.parse(str);
  } catch {}

  // 3. Find outermost { ... } or [ ... ]
  const firstBrace = str.indexOf('{');
  const firstBracket = str.indexOf('[');
  let startIdx = -1;

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
  }

  if (startIdx === -1) {
    throw new Error(`No JSON object or array found in output. Content: ${str.slice(0, 100)}`);
  }

  let candidate = str.substring(startIdx);

  try {
    return JSON.parse(candidate);
  } catch {}

  const lastBrace = candidate.lastIndexOf('}');
  const lastBracket = candidate.lastIndexOf(']');
  const endIdx = Math.max(lastBrace, lastBracket);
  if (endIdx > 0) {
    try {
      return JSON.parse(candidate.substring(0, endIdx + 1));
    } catch {}
  }

  // 4. Truncation and Syntax Healing Algorithm
  let repaired = candidate.replace(/,\s*([}\]])/g, '$1');
  
  // Balance unclosed quotes, brackets, and braces
  let inString = false;
  let escaped = false;
  let stack = [];
  
  for (let i = 0; i < repaired.length; i++) {
    const char = repaired[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{' || char === '[') {
        stack.push(char);
      } else if (char === '}') {
        if (stack.length && stack[stack.length - 1] === '{') stack.pop();
      } else if (char === ']') {
        if (stack.length && stack[stack.length - 1] === '[') stack.pop();
      }
    }
  }

  if (inString) {
    repaired += '"';
  }

  repaired = repaired.replace(/,\s*$/, '');

  while (stack.length > 0) {
    const top = stack.pop();
    if (top === '{') repaired += '}';
    if (top === '[') repaired += ']';
  }

  try {
    return JSON.parse(repaired);
  } catch (err) {
    // Second-pass healing: strip trailing partial key-value pair and re-balance
    repaired = repaired.replace(/,\s*"[^"]*"?\s*:?\s*[^,}\]]*$/, '');
    let s2 = [];
    let inS = false;
    let esc = false;
    for (let i = 0; i < repaired.length; i++) {
      const c = repaired[i];
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') { inS = !inS; continue; }
      if (!inS) {
        if (c === '{' || c === '[') s2.push(c);
        else if (c === '}' && s2[s2.length - 1] === '{') s2.pop();
        else if (c === ']' && s2[s2.length - 1] === '[') s2.pop();
      }
    }
    if (inS) repaired += '"';
    while (s2.length > 0) {
      const t = s2.pop();
      if (t === '{') repaired += '}';
      if (t === '[') repaired += ']';
    }
    try {
      return JSON.parse(repaired);
    } catch {
      throw new Error(`Failed to parse response as JSON. Output snippet: ${str.slice(0, 150)}...`);
    }
  }
};

/**
 * Call OpenRouter API with dynamic token budgeting & credit auto-healing
 */
const callOpenRouter = async (model, prompt, systemInstruction, responseFormat, maxTokens = 4096) => {
  logger.info(`Generating content via OpenRouter (Model: ${model}, MaxTokens: ${maxTokens})`);
  
  const messages = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }
  messages.push({ role: 'user', content: prompt });

  const cleanReferer = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.replace(/"/g, '').split(',')[0] 
    : 'http://localhost:3000';

  const payload = {
    model: model,
    messages,
    max_tokens: maxTokens,
    response_format: responseFormat === 'json' ? { type: "json_object" } : undefined
  };

  const { default: axios } = await import('axios');

  try {
    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', payload, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': cleanReferer,
        'X-Title': 'Elevara',
      },
      timeout: 90000
    });

    const content = response.data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('OpenRouter returned an empty response.');
    }

    if (responseFormat === 'json') {
      return extractJson(content);
    }
    
    return content;
  } catch (error) {
    const errorBody = error.response?.data;
    const errorMsg = errorBody?.error?.message || (typeof errorBody === 'string' ? errorBody : error.message);
    
    // Auto-heal 402 token reserve limit: "You requested up to X tokens, but can only afford Y"
    if (error.response?.status === 402 || errorMsg?.includes('can only afford') || errorMsg?.includes('fewer max_tokens')) {
      const match = errorMsg.match(/can only afford (\d+)/i);
      const affordable = match ? parseInt(match[1], 10) : 2000;
      if (affordable >= 500 && maxTokens > affordable) {
        const newMaxTokens = Math.max(500, affordable - 100);
        logger.warn(`OpenRouter token limit reached (${maxTokens}). Auto-adjusting to ${newMaxTokens} tokens and retrying.`);
        return callOpenRouter(model, prompt, systemInstruction, responseFormat, newMaxTokens);
      }
    }

    const errorData = errorBody ? JSON.stringify(errorBody) : error.message;
    logger.error(`OpenRouter Axios Error: ${errorData}`);
    throw new Error(`OpenRouter API error: ${errorData}`);
  }
};

/**
 * Call Direct Gemini API
 */
const callGeminiDirect = async (model, prompt, systemInstruction, responseFormat) => {
  const normalizedModel = normalizeDirectGeminiModel(model);
  logger.info(`Generating content via Direct Gemini API (Model: ${normalizedModel})`);
  const fullPrompt = systemInstruction ? `${systemInstruction}\n\n${prompt}` : prompt;
  
  const client = getGeminiClient();
  const response = await client.models.generateContent({
    model: normalizedModel,
    contents: fullPrompt,
    config: {
      responseMimeType: responseFormat === 'json' ? "application/json" : "text/plain",
      maxOutputTokens: 32000
    }
  });

  if (responseFormat === 'json') {
    return extractJson(response.text);
  }
  return response.text;
};

/**
 * Unified Generate function with Resilient Fallback
 */
export const generateAI = async ({
  prompt,
  systemInstruction = '',
  responseFormat = 'text',
  modelId = null
}) => {
  const target = resolveProviderAndModel(modelId);

  try {
    if (target.provider === 'openrouter') {
      const result = await callOpenRouter(target.model, prompt, systemInstruction, responseFormat);
      return { result, provider: target.provider, model: target.model };
    } else {
      const result = await callGeminiDirect(target.model, prompt, systemInstruction, responseFormat);
      return { result, provider: target.provider, model: target.model };
    }
  } catch (error) {
    logger.warn({ err: error.message }, `Primary AI provider (${target.provider}) failed. Attempting fallback.`);

    // Fallback strategy:
    // If OpenRouter was primary, attempt Gemini Direct
    if (target.provider === 'openrouter' && process.env.GEMINI_API_KEY) {
      try {
        logger.info(`Fallback: Attempting Direct Gemini (${DEFAULT_DIRECT_GEMINI_MODEL})`);
        const result = await callGeminiDirect(DEFAULT_DIRECT_GEMINI_MODEL, prompt, systemInstruction, responseFormat);
        return { result, provider: 'gemini', model: DEFAULT_DIRECT_GEMINI_MODEL };
      } catch (fallbackError) {
        logger.error({ err: fallbackError.message }, 'Fallback AI provider (Gemini) also failed.');
        throw new Error(`All AI providers failed. Last error: ${fallbackError.message}`);
      }
    } 
    // If Gemini Direct was primary, attempt OpenRouter free model
    else if (target.provider === 'gemini' && process.env.OPENROUTER_API_KEY) {
      try {
        logger.info(`Fallback: Attempting OpenRouter (${DEFAULT_FREE_OPENROUTER_MODEL})`);
        const result = await callOpenRouter(DEFAULT_FREE_OPENROUTER_MODEL, prompt, systemInstruction, responseFormat);
        return { result, provider: 'openrouter', model: DEFAULT_FREE_OPENROUTER_MODEL };
      } catch (fallbackError) {
        logger.error({ err: fallbackError.message }, 'Fallback AI provider (OpenRouter) also failed.');
        throw new Error(`All AI providers failed. Last error: ${fallbackError.message}`);
      }
    }
    
    throw error;
  }
};
