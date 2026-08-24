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
 * Normalizes legacy/deprecated model slugs to active models.
 */
const normalizeDirectGeminiModel = (modelId) => {
  if (!modelId) return DEFAULT_DIRECT_GEMINI_MODEL;
  if (modelId === 'gemini-2.5-flash' || modelId === 'gemini-1.5-flash' || modelId === 'gemini-2.0-flash' || modelId === 'gemini-3.6-flash') {
    return 'gemini-3.6-flash';
  }
  if (modelId === 'gemini-3.7-flash') {
    return 'gemini-3.7-flash';
  }
  if (modelId === 'gemini-2.5-pro' || modelId === 'gemini-1.5-pro' || modelId === 'gemini-3.1-pro-preview' || modelId === 'gemini-3.1-pro') {
    return 'gemini-3.6-flash'; // gemini-3.6-flash is high-performance and reliably available
  }
  return modelId;
};

const normalizeOpenRouterModel = (modelId) => {
  if (!modelId) return DEFAULT_FREE_OPENROUTER_MODEL;
  const legacyMap = {
    'deepseek/deepseek-v4-flash:free': 'google/gemma-4-26b-a4b-it:free',
    'deepseek/deepseek-chat:free': 'nvidia/nemotron-3.5-lightning:free',
    'deepseek/deepseek-r1:free': 'nvidia/nemotron-3.5-lightning:free',
    'meta-llama/llama-3.3-70b-instruct:free': 'nvidia/nemotron-3.5-lightning:free',
    'google/gemini-2.0-flash-lite-preview-02-05:free': 'google/gemma-4-26b-a4b-it:free',
    'google/gemini-2.0-pro-exp-02-05:free': 'google/gemma-4-26b-a4b-it:free',
  };
  return legacyMap[modelId] || modelId;
};

/**
 * Normalizes the model selection and returns the appropriate provider and model name.
 */
export const resolveProviderAndModel = (requestedModelId) => {
  const hasGeminiKey = !!process.env.GEMINI_API_KEY;
  const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;

  // If no model requested or 'default', prefer Gemini Direct if key is present, else OpenRouter
  if (!requestedModelId || requestedModelId === 'default') {
    if (hasGeminiKey) {
      return { provider: 'gemini', model: DEFAULT_DIRECT_GEMINI_MODEL };
    }
    if (hasOpenRouter) {
      return { provider: 'openrouter', model: DEFAULT_FREE_OPENROUTER_MODEL };
    }
    return { provider: 'gemini', model: DEFAULT_DIRECT_GEMINI_MODEL };
  }

  // If a specific gemini direct model is requested
  if (requestedModelId.startsWith('gemini-')) {
    return { provider: 'gemini', model: normalizeDirectGeminiModel(requestedModelId) };
  }

  // Any other string is treated as an OpenRouter model ID
  if (hasOpenRouter) {
    return { provider: 'openrouter', model: normalizeOpenRouterModel(requestedModelId) };
  }

  // Fallback if OpenRouter isn't configured
  logger.warn(`OpenRouter model ${requestedModelId} requested, but OPENROUTER_API_KEY is missing. Falling back to Direct Gemini.`);
  return { provider: 'gemini', model: DEFAULT_DIRECT_GEMINI_MODEL };
};

/**
 * Robust JSON Parser for AI Outputs
 */
const extractJson = (content) => {
  if (typeof content === 'object' && content !== null) return content;
  if (typeof content !== 'string') throw new Error('Response is not a valid JSON string');

  const str = content.trim();

  // 1. Direct JSON parse
  try {
    return JSON.parse(str);
  } catch {}

  // 2. Strip ```json ... ``` or ``` ... ```
  const codeBlockMatch = str.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {}
  }

  // 3. Bracket extraction fallback
  const firstBrace = str.indexOf('{');
  const lastBrace = str.lastIndexOf('}');
  const firstBracket = str.indexOf('[');
  const lastBracket = str.lastIndexOf(']');

  let startIdx = -1;
  let endIdx = -1;

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
    endIdx = lastBrace;
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
    endIdx = lastBracket;
  }

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const candidate = str.substring(startIdx, endIdx + 1);
    try {
      return JSON.parse(candidate);
    } catch {}
  }

  throw new Error(`Failed to parse response as JSON. Output snippet: ${str.slice(0, 150)}...`);
};

/**
 * Call OpenRouter API
 */
const callOpenRouter = async (model, prompt, systemInstruction, responseFormat) => {
  logger.info(`Generating content via OpenRouter (Model: ${model})`);
  
  const messages = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }
  messages.push({ role: 'user', content: prompt });

  const cleanReferer = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.replace(/"/g, '').split(',')[0] 
    : 'http://localhost:3000';

  let data;
  try {
    const { default: axios } = await import('axios');
    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: model,
      messages,
      max_tokens: 4000,
      response_format: responseFormat === 'json' ? { type: "json_object" } : undefined
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': cleanReferer,
        'X-Title': 'Elevara',
      },
      timeout: 45000
    });
    data = response.data;
  } catch (error) {
    const errorData = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    logger.error(`OpenRouter Axios Error: ${errorData}`);
    throw new Error(`OpenRouter API error: ${errorData}`);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenRouter returned an empty response.');
  }

  if (responseFormat === 'json') {
    return extractJson(content);
  }
  
  return content;
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
      maxOutputTokens: 16000
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
