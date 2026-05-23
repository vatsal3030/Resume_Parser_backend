import prisma from '../config/db.js';
import logger from '../config/logger.js';
import { getToolConfig, getToolCreditCost } from '../config/toolRegistry.js';

/**
 * Credit Guard Middleware — Checks and deducts credits before AI tool execution.
 * Logs every transaction in the credit_audit ledger for full traceability.
 *
 * Usage: router.post('/tool', creditGuard('TAILOR_RESUME'), handler)
 */
export function creditGuard(toolId) {
  const toolConfig = getToolConfig(toolId);
  const cost = getToolCreditCost(toolId);

  return async (req, res, next) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
      // 1. Fetch user's current credit balance
      const profile = await prisma.profile.findUnique({
        where: { userId },
        select: { creditBalance: true },
      });

      if (!profile) return res.status(404).json({ error: 'Profile not found' });

      const balance = profile.creditBalance ?? 0;

      // 2. Check if user has enough credits
      if (balance < cost) {
        logger.warn({ userId, balance, cost, toolId }, 'Insufficient credits');
        return res.status(402).json({
          error: 'Insufficient credits',
          message: `This action costs ${cost} credit${cost > 1 ? 's' : ''}. You have ${balance}.`,
          required: cost,
          balance,
          toolName: toolConfig?.name || toolId,
        });
      }

      // 3. Deduct credits atomically
      await prisma.profile.update({
        where: { userId },
        data: { creditBalance: { decrement: cost } },
      });

      // 4. Log to credit_audit ledger
      await prisma.creditAudit.create({
        data: {
          userId,
          action: 'DEBIT',
          amount: -cost,
          reason: `Tool: ${toolConfig?.name || toolId}`,
          balanceAfter: balance - cost,
          toolType: toolId,
        },
      });

      // 5. Attach credit info to request for downstream use
      req.creditInfo = {
        toolId,
        cost,
        previousBalance: balance,
        newBalance: balance - cost,
      };

      logger.info({ userId, toolId, cost, newBalance: balance - cost }, 'Credits deducted');
      next();
    } catch (error) {
      logger.error({ err: error, userId, toolId }, 'Credit guard error');
      res.status(500).json({ error: 'Credit validation failed' });
    }
  };
}

/**
 * Refund credits (e.g. when a job fails).
 */
export async function refundCredits(userId, toolId, reason = 'Job failed') {
  const cost = getToolCreditCost(toolId);
  try {
    await prisma.profile.update({
      where: { userId },
      data: { creditBalance: { increment: cost } },
    });

    await prisma.creditAudit.create({
      data: {
        userId,
        action: 'REFUND',
        amount: cost,
        reason,
        toolType: toolId,
      },
    });

    logger.info({ userId, toolId, cost }, 'Credits refunded');
  } catch (error) {
    logger.error({ err: error, userId, toolId }, 'Credit refund failed');
  }
}
