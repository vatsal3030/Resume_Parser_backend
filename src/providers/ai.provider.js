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
const DEFAULT_FREE_MODEL = process.env.DEFAULT_FREE_MODEL || 'deepseek/deepseek-chat:free';
const DEFAULT_PRO_MODEL = process.env.DEFAULT_PRO_MODEL || 'google/gemini-2.5-pro';
const DIRECT_GEMINI_FALLBACK = process.env.GEMINI_MODELS || 'gemini-2.5-flash';

/**
 * Normalizes the model selection and returns the appropriate provider and model name.
 */
const resolveProviderAndModel = (requestedModelId) => {
  const useOpenRouter = process.env.USE_OPENROUTER === 'true';

  // If no model requested, use default logic
  if (!requestedModelId || requestedModelId === 'default') {
    if (useOpenRouter && process.env.OPENROUTER_API_KEY) {
      return { provider: 'openrouter', model: DEFAULT_FREE_MODEL };
    }
    return { provider: 'gemini', model: DIRECT_GEMINI_FALLBACK };
  }

  // If a specific gemini direct model is requested
  if (requestedModelId === 'gemini-2.5-flash' || requestedModelId === 'gemini-2.5-pro') {
    return { provider: 'gemini', model: requestedModelId };
  }

  // Assume any other specific string is an OpenRouter model
  if (useOpenRouter && process.env.OPENROUTER_API_KEY) {
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

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.ALLOWED_ORIGINS?.split(',')[0] || 'http://localhost:3000',
      'X-Title': 'AI Career OS',
    },
    body: JSON.stringify({
      model: model,
      messages,
      response_format: responseFormat === 'json' ? { type: 'json_object' } : undefined
    })
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${errorData}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  
  return responseFormat === 'json' ? JSON.parse(content) : content;
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
      maxOutputTokens: 8000
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
      return await callOpenRouter(target.model, prompt, systemInstruction, responseFormat);
    } else {
      return await callGeminiDirect(target.model, prompt, systemInstruction, responseFormat);
    }
  } catch (error) {
    logger.warn({ err: error.message }, `Primary AI provider (${target.provider}) failed. Attempting fallback.`);

    // Fallback logic
    if (target.provider === 'openrouter') {
      // If OpenRouter fails, try direct Gemini
      try {
        logger.info(`Fallback: Attempting Direct Gemini (${DIRECT_GEMINI_FALLBACK})`);
        return await callGeminiDirect(DIRECT_GEMINI_FALLBACK, prompt, systemInstruction, responseFormat);
      } catch (fallbackError) {
        logger.error({ err: fallbackError.message }, 'Fallback AI provider also failed.');
        throw new Error('All AI providers failed.');
      }
    } else {
      // If Direct Gemini failed, and OpenRouter is available, try OpenRouter free
      if (process.env.USE_OPENROUTER === 'true' && process.env.OPENROUTER_API_KEY) {
         try {
           logger.info(`Fallback: Attempting OpenRouter (${DEFAULT_FREE_MODEL})`);
           return await callOpenRouter(DEFAULT_FREE_MODEL, prompt, systemInstruction, responseFormat);
         } catch (fallbackError) {
           logger.error({ err: fallbackError.message }, 'Fallback AI provider also failed.');
           throw new Error('All AI providers failed.');
         }
      }
      throw error;
    }
  }
};
