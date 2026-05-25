import { GoogleGenAI } from '@google/genai';
import logger from '../config/logger.js';

/**
 * AI Provider Layer
 * Abstracts the logic for calling different AI providers (OpenRouter vs Google Gemini Direct)
 * Implements fallback mechanisms to ensure high availability.
 */

// Initialize Direct Gemini Client
const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

// Environment Configuration
const DEFAULT_FREE_MODEL = process.env.OPENROUTER_MODEL || process.env.DEFAULT_FREE_MODEL || 'deepseek/deepseek-v4-flash:free';
const DEFAULT_PRO_MODEL = process.env.DEFAULT_PRO_MODEL || 'google/gemini-2.5-pro';
const DIRECT_GEMINI_FALLBACK = process.env.GEMINI_MODELS || 'gemini-2.5-flash';

/**
 * Normalizes the model selection and returns the appropriate provider and model name.
 * IMPORTANT: Gemini Direct is ALWAYS the primary for 'default' requests.
 * OpenRouter is only used when a user explicitly selects an OpenRouter model ID.
 */
const resolveProviderAndModel = (requestedModelId) => {
  const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;

  // If no model requested, use OpenRouter if available, else Gemini
  if (!requestedModelId || requestedModelId === 'default') {
    if (hasOpenRouter) {
      return { provider: 'openrouter', model: DEFAULT_FREE_MODEL };
    }
    return { provider: 'gemini', model: DIRECT_GEMINI_FALLBACK };
  }

  // If a specific gemini direct model is requested
  if (requestedModelId.startsWith('gemini-')) {
    return { provider: 'gemini', model: requestedModelId };
  }

  // Any other specific string is an OpenRouter model (e.g., 'deepseek/deepseek-chat:free')
  if (hasOpenRouter) {
     return { provider: 'openrouter', model: requestedModelId };
  }

  // Fallback if OpenRouter isn't configured but an OR model was requested
  logger.warn(`OpenRouter model ${requestedModelId} requested, but OPENROUTER_API_KEY is missing. Falling back to Direct Gemini.`);
  return { provider: 'gemini', model: DIRECT_GEMINI_FALLBACK };
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

  const cleanReferer = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.replace(/"/g, '').split(',')[0] : 'http://localhost:3000';

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
      }
    });
    data = response.data;
  } catch (error) {
    const errorData = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    logger.error(`OpenRouter Axios Error: ${errorData}`);
    throw new Error(`OpenRouter API error: ${errorData}`);
  }

  let content = data.choices[0].message.content;
  
  if (responseFormat === 'json') {
    try {
      // Robust JSON parsing: strip markdown blocks if they exist
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        content = jsonMatch[1];
      } else {
        const genericMatch = content.match(/```\n([\s\S]*?)\n```/);
        if (genericMatch) {
          content = genericMatch[1];
        } else {
          // Bracket matching fallback if wrapped in conversational text
          const firstBrace = content.indexOf('{');
          const lastBrace = content.lastIndexOf('}');
          const firstBracket = content.indexOf('[');
          const lastBracket = content.lastIndexOf(']');
          
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
            content = content.substring(startIdx, endIdx + 1);
          }
        }
      }
      return JSON.parse(content);
    } catch (e) {
      logger.error({ err: e.message, content }, 'Failed to parse JSON from OpenRouter');
      // Pass the raw content back so frontend can attempt to salvage it
      throw new Error(`Failed to parse OpenRouter response as JSON. Raw output: ${content}`);
    }
  }
  
  return content;
};

/**
 * Call Direct Gemini API
 */
const callGeminiDirect = async (model, prompt, systemInstruction, responseFormat) => {
  logger.info(`Generating content via Direct Gemini API (Model: ${model})`);
  const fullPrompt = systemInstruction ? `${systemInstruction}\n\n${prompt}` : prompt;
  
  const response = await gemini.models.generateContent({
    model: model,
    contents: fullPrompt,
    config: {
      responseMimeType: responseFormat === 'json' ? "application/json" : "text/plain",
      maxOutputTokens: 16000
    }
  });

  return responseFormat === 'json' ? JSON.parse(response.text) : response.text;
};

/**
 * Unified Generate function with Fallback
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

    // Fallback logic
    if (target.provider === 'openrouter') {
      // If OpenRouter fails, try direct Gemini
      try {
        logger.info(`Fallback: Attempting Direct Gemini (${DIRECT_GEMINI_FALLBACK})`);
        const result = await callGeminiDirect(DIRECT_GEMINI_FALLBACK, prompt, systemInstruction, responseFormat);
        return { result, provider: 'gemini', model: DIRECT_GEMINI_FALLBACK };
      } catch (fallbackError) {
        logger.error({ err: fallbackError.message }, 'Fallback AI provider also failed.');
        throw new Error(`All AI providers failed. Last error: ${fallbackError.message}`);
      }
    } else {
      // If Direct Gemini failed, and OpenRouter is available, try OpenRouter free
      if (process.env.OPENROUTER_API_KEY) {
         try {
           logger.info(`Fallback: Attempting OpenRouter (${DEFAULT_FREE_MODEL})`);
           const result = await callOpenRouter(DEFAULT_FREE_MODEL, prompt, systemInstruction, responseFormat);
           return { result, provider: 'openrouter', model: DEFAULT_FREE_MODEL };
         } catch (fallbackError) {
           logger.error({ err: fallbackError.message }, 'Fallback AI provider also failed.');
           throw new Error(`All AI providers failed. Last error: ${fallbackError.message}`);
         }
      }
      throw error;
    }
  }
};
