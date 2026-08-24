/**
 * Centralized Configuration & Feature Flags
 * 
 * Provides typed access to environment variables and feature flags.
 * This ensures that missing environment variables fail early or default safely,
 * instead of causing runtime crashes deep in the application.
 */

const getBool = (val, defaultVal = false) => {
  if (val === undefined || val === null) return defaultVal;
  return val.toString().toLowerCase() === 'true' || val === '1';
};

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  
  // AI Provider Settings
  useOpenRouter: getBool(process.env.USE_OPENROUTER, false),
  openRouterModel: process.env.OPENROUTER_MODEL || 'google/gemma-4-26b-a4b-it:free',
  geminiModel: process.env.GEMINI_MODELS || 'gemini-2.0-flash',
  
  // Feature Flags
  features: {
    ENABLE_REALTIME: getBool(process.env.ENABLE_REALTIME, false),
    ENABLE_COPILOT: getBool(process.env.ENABLE_COPILOT, true),
    ENABLE_GITHUB_ANALYSIS: getBool(process.env.ENABLE_GITHUB_ANALYSIS, true),
    ENABLE_INTERVIEWS: getBool(process.env.ENABLE_INTERVIEWS, true),
    ENABLE_ADMIN_DASHBOARD: getBool(process.env.ENABLE_ADMIN_DASHBOARD, true),
  },

  // Governance Limits
  limits: {
    maxUploadSizeMB: parseInt(process.env.MAX_UPLOAD_SIZE_MB || '5', 10),
    maxGenerationsPerDay: parseInt(process.env.MAX_GENERATIONS_PER_DAY || '500', 10),
    maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS || '3', 10),
  }
};
