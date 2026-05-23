import prisma from '../config/db.js';
import logger from '../config/logger.js';

/**
 * GenerationLedgerService — Immutable record of every AI API call.
 * 
 * Tracks provider, model, token usage, cost, and timing for every generation.
 * This is the core infrastructure for future monetization, cost analytics,
 * and observability.
 */

/**
 * Record an AI generation in the immutable ledger.
 * 
 * @param {Object} params
 * @param {string} params.userId - The user who triggered the generation
 * @param {string} [params.aiJobId] - The parent AI job ID
 * @param {string} params.provider - 'openrouter' or 'gemini'
 * @param {string} params.modelId - e.g., 'gemini-2.5-flash', 'gpt-4o'
 * @param {string} params.generationType - e.g., 'PARSE_RESUME', 'TAILOR_RESUME'
 * @param {number} [params.tokensPrompt] - Prompt token count
 * @param {number} [params.tokensCompletion] - Completion token count
 * @param {number} [params.estimatedCostUsd] - Estimated cost in USD
 * @param {number} [params.durationMs] - How long the AI call took
 * @param {boolean} [params.wasRetry] - Whether this was a retry attempt
 * @param {boolean} [params.wasFallback] - Whether this used a fallback provider
 * @param {number} [params.creditsCost] - How many credits this job cost
 * @returns {Object} The created AIGeneration record
 */
export const recordGeneration = async ({
  userId,
  aiJobId = null,
  provider,
  modelId,
  generationType,
  tokensPrompt = 0,
  tokensCompletion = 0,
  estimatedCostUsd = 0,
  creditsCost = 1,
  durationMs = null,
  wasRetry = false,
  wasFallback = false,
}) => {
  try {
    const generation = await prisma.aIGeneration.create({
      data: {
        userId,
        aiJobId,
        provider,
        modelId,
        generationType,
        tokensPrompt,
        tokensCompletion,
        estimatedCostUsd,
        creditsCost,
        durationMs,
        wasRetry,
        wasFallback,
      }
    });

    logger.info({
      generationId: generation.id,
      provider,
      modelId,
      tokensPrompt,
      tokensCompletion,
      estimatedCostUsd,
      durationMs,
    }, `[GenerationLedger] Recorded: ${generationType}`);

    return generation;
  } catch (error) {
    // Ledger failures should never crash the parent operation
    logger.error({ err: error, userId, generationType }, '[GenerationLedger] Failed to record generation');
    return null;
  }
};

/**
 * Get generation history for a user (for analytics/cost tracking).
 */
export const getUserGenerations = async (userId, limit = 50) => {
  try {
    return await prisma.aIGeneration.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  } catch (error) {
    logger.error({ err: error, userId }, '[GenerationLedger] Failed to fetch generations');
    return [];
  }
};

/**
 * Get aggregate cost stats for a user.
 */
export const getUserCostSummary = async (userId) => {
  try {
    const result = await prisma.aIGeneration.aggregate({
      where: { userId },
      _sum: {
        tokensPrompt: true,
        tokensCompletion: true,
        estimatedCostUsd: true,
      },
      _count: true,
    });

    return {
      totalGenerations: result._count,
      totalTokensPrompt: result._sum.tokensPrompt || 0,
      totalTokensCompletion: result._sum.tokensCompletion || 0,
      totalEstimatedCostUsd: parseFloat(result._sum.estimatedCostUsd || 0),
    };
  } catch (error) {
    logger.error({ err: error, userId }, '[GenerationLedger] Failed to aggregate costs');
    return null;
  }
};
