import prisma from '../config/db.js';
import logger from '../config/logger.js';

/**
 * WorkflowService — Manages stateful multi-step user journeys.
 * 
 * Powers the "Continue Where You Left Off" dashboard card.
 * Replaces hardcoded frontend localStorage logic with persistent backend state.
 */

/**
 * Create or update a workflow for a user.
 * If an IN_PROGRESS workflow of the same type exists, update it.
 * Otherwise, create a new one.
 */
export const upsertWorkflow = async ({ userId, type, currentStep, completionPercentage = 0, metadata = null }) => {
  try {
    // Check for existing active workflow of same type
    const existing = await prisma.workflow.findFirst({
      where: { userId, type, status: 'IN_PROGRESS' },
    });

    if (existing) {
      const updated = await prisma.workflow.update({
        where: { id: existing.id },
        data: { currentStep, completionPercentage, metadata },
      });
      logger.info({ workflowId: updated.id, type, currentStep }, '[WorkflowService] Workflow updated');
      return updated;
    }

    const workflow = await prisma.workflow.create({
      data: { userId, type, currentStep, completionPercentage, metadata },
    });
    logger.info({ workflowId: workflow.id, type }, '[WorkflowService] Workflow created');
    return workflow;
  } catch (error) {
    logger.error({ err: error, userId, type }, '[WorkflowService] Failed to upsert workflow');
    return null;
  }
};

/**
 * Mark a workflow as completed.
 */
export const completeWorkflow = async (workflowId) => {
  try {
    return await prisma.workflow.update({
      where: { id: workflowId },
      data: { status: 'COMPLETED', completionPercentage: 100 },
    });
  } catch (error) {
    logger.error({ err: error, workflowId }, '[WorkflowService] Failed to complete workflow');
    return null;
  }
};

/**
 * Get active (in-progress) workflows for a user.
 * Used by the dashboard "Continue Where You Left Off" card.
 */
export const getActiveWorkflows = async (userId, limit = 5) => {
  try {
    return await prisma.workflow.findMany({
      where: { userId, status: 'IN_PROGRESS' },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
  } catch (error) {
    logger.error({ err: error, userId }, '[WorkflowService] Failed to fetch active workflows');
    return [];
  }
};
