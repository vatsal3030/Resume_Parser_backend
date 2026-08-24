import { Worker } from 'bullmq';
import { createRedisConnection, isRedisQuotaExceeded } from '../config/redis.js';
import logger from '../config/logger.js';
import prisma from '../config/db.js';
import { AI_QUEUE_NAME } from '../constants/queue.constants.js';
import { 
  extractDetailsFromPDF, 
  tailorResume, 
  generateCoverLetter, 
  generateMockInterview,
  gradeMockInterview,
  generateRoadmap,
  generatePortfolio,
  analyzeGitHub
} from '../services/ai.service.js';
import { resolveProviderAndModel } from '../providers/ai.provider.js';
import { recordGeneration } from '../services/generation.ledger.service.js';
import { emitEvent } from '../services/activity.service.js';
import { createNotification } from '../services/notification.service.js';
import { upsertWorkflow, completeWorkflow } from '../services/workflow.service.js';
import { getCreditCost } from '../config/credits.js';
import { refundCredits } from '../middlewares/creditGuard.middleware.js';
import { runWithTrace } from '../utils/tracing.js';

/**
 * Maps job types to human-readable labels for notifications & events.
 */
const JOB_TYPE_LABELS = {
  PARSE_RESUME: { label: 'Resume Analysis', event: 'RESUME_ANALYZED', icon: '📄', toolType: 'RESUME_ANALYSIS', url: '/dashboard/analyze' },
  TAILOR_RESUME: { label: 'Resume Tailoring', event: 'RESUME_TAILORED', icon: '✂️', toolType: 'TAILOR', url: '/dashboard/tools/tailor' },
  GENERATE_COVER_LETTER: { label: 'Cover Letter', event: 'COVER_LETTER_GENERATED', icon: '✉️', toolType: 'COVER_LETTER', url: '/dashboard/tools/cover-letter' },
  GENERATE_MOCK_INTERVIEW: { label: 'Mock Interview', event: 'MOCK_INTERVIEW_GENERATED', icon: '🎤', toolType: 'MOCK_INTERVIEW', url: '/dashboard/tools/mock-interview' },
  GENERATE_ROADMAP: { label: 'Career Roadmap', event: 'ROADMAP_GENERATED', icon: '🗺️', toolType: 'ROADMAP', url: '/dashboard/tools/roadmap' },
  GENERATE_PORTFOLIO: { label: 'Portfolio', event: 'PORTFOLIO_GENERATED', icon: '🌐', toolType: 'PORTFOLIO', url: '/dashboard/tools/portfolio' },
  ANALYZE_GITHUB: { label: 'GitHub Analysis', event: 'GITHUB_ANALYZED', icon: '🐙', toolType: 'GITHUB_ANALYSIS', url: '/dashboard/tools/github' },
  GRADE_MOCK_INTERVIEW: { label: 'Interview Graded', event: 'MOCK_INTERVIEW_GRADED', icon: '📝', toolType: 'MOCK_INTERVIEW_SCORE', url: '/dashboard/tools/mock-interview' },
};

/**
 * Auto-save a completed AI generation into the tool_outputs table.
 * This powers the global history system.
 */
async function saveToolOutput({ userId, aiJobId, jobName, jobData, result, provider, model }) {
  try {
    const typeInfo = JOB_TYPE_LABELS[jobName] || { label: jobName, toolType: jobName };
    
    // Build a friendly title
    const datePart = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const contextPart = jobData.companyName || jobData.targetRole || jobData.originalName || jobData.githubUsername || '';
    const title = contextPart 
      ? `${typeInfo.label} — ${contextPart} — ${datePart}`
      : `${typeInfo.label} — ${datePart}`;

    // Build input summary (compact metadata for display)
    const inputSummary = {};
    if (jobData.resumeId) inputSummary.resumeId = jobData.resumeId;
    if (jobData.jobDescription) inputSummary.jobDescription = jobData.jobDescription;
    if (jobData.originalName) inputSummary.resumeTitle = jobData.originalName;
    if (jobData.targetRole) inputSummary.targetRole = jobData.targetRole;
    if (jobData.companyName) inputSummary.company = jobData.companyName;
    if (jobData.githubUsername) inputSummary.githubUsername = jobData.githubUsername;
    if (jobData.jobDescription) {
      inputSummary.jobDescriptionSnippet = jobData.jobDescription.substring(0, 150) + '...';
    }

    let outputPayload = result;
    const meta = {
      provider,
      model,
      inputs: {
        resumeId: jobData.resumeId || null,
        jobDescription: jobData.jobDescription || null,
        targetRole: jobData.targetRole || null,
        companyName: jobData.companyName || null,
        githubUsername: jobData.githubUsername || null
      }
    };
    if (typeof result === 'object' && result !== null) {
      outputPayload = { ...result, _meta: meta };
    } else {
      outputPayload = { text: result, _meta: meta };
    }

    const output = await prisma.toolOutput.create({
      data: {
        userId,
        aiJobId,
        toolType: typeInfo.toolType,
        title,
        inputSummary: Object.keys(inputSummary).length > 0 ? inputSummary : undefined,
        outputPayload,
      },
    });

    logger.info({ userId, toolType: typeInfo.toolType, aiJobId }, 'Tool output saved to history');
    return output;
  } catch (error) {
    // Never crash the main flow for a history save failure
    logger.error({ err: error, aiJobId }, 'Failed to save tool output to history (non-fatal)');
  }
}

/**
 * Core AI Job Execution Engine
 * Used by both BullMQ Worker and In-Process Async Queue Fallback.
 */
export const processAIJob = async (job) => {
  return runWithTrace({ jobId: job.id }, async () => {
    const startTime = Date.now();
    logger.info({ name: job.name, jobId: job.id }, 'Processing AI Job');
    
    // 1. Update job status to PROCESSING in DB
    await prisma.aIJob.update({
      where: { id: job.id },
      data: { status: 'PROCESSING', startedAt: new Date() }
    });

    // Determine provider info for ledger (from input payload or defaults)
    const target = resolveProviderAndModel(job.data?.modelId);
    let resolvedProvider = target.provider;
    let resolvedModel = target.model;

    try {
      let result;
      let generationResult;

      // 2. Route the job based on name/type
      switch (job.name) {
        case 'PARSE_RESUME':
          generationResult = await extractDetailsFromPDF(job.data.resumeText, job.data.modelId);
          result = generationResult.result;
          
          // Save the parsed Document
          const parsedDoc = await prisma.document.create({
            data: {
              userId: job.data.userId,
              type: 'RESUME',
              title: job.data.originalName,
              content: result,
              atsScore: result.atsScore,
              jobFitScore: result.jobFitScore
            }
          });
          // Append documentId to the result so the frontend can retrieve it
          result.documentId = parsedDoc.id;
          break;

        case 'TAILOR_RESUME':
          generationResult = await tailorResume(job.data.resumeText, job.data.jobDescription, job.data.modelId);
          result = generationResult.result;
          break;

        case 'GENERATE_COVER_LETTER':
          generationResult = await generateCoverLetter(job.data.resumeText, job.data.jobDescription, job.data.modelId);
          result = generationResult.result;
          // Save the Cover Letter Document
          await prisma.document.create({
            data: {
              userId: job.data.userId,
              type: 'COVER_LETTER',
              title: `Cover Letter - ${job.data.companyName || 'Unknown Company'}`,
              content: { text: result }
            }
          });
          break;

        case 'GENERATE_MOCK_INTERVIEW':
          generationResult = await generateMockInterview(job.data.resumeText, job.data.targetRole, job.data.modelId);
          result = generationResult.result;
          break;

        case 'GRADE_MOCK_INTERVIEW':
          generationResult = await gradeMockInterview(job.data.answers, job.data.questions, job.data.modelId);
          result = generationResult.result;
          break;

        case 'GENERATE_ROADMAP':
          generationResult = await generateRoadmap(job.data.resumeText, job.data.targetRole, job.data.modelId);
          result = generationResult.result;
          break;

        case 'GENERATE_PORTFOLIO':
          generationResult = await generatePortfolio(job.data.resumeText, job.data.modelId);
          result = generationResult.result;
          break;

        case 'ANALYZE_GITHUB':
          generationResult = await analyzeGitHub(job.data.githubUsername, job.data.modelId);
          result = generationResult.result;
          break;

        default:
          throw new Error(`Unknown job type: ${job.name}`);
      }

      if (generationResult) {
        resolvedProvider = generationResult.provider || resolvedProvider;
        resolvedModel = generationResult.model || resolvedModel;
      }

      const durationMs = Date.now() - startTime;

      // 3. Mark job as COMPLETED
      let resultPayloadForJob = result;
      const metaForJob = {
        provider: resolvedProvider,
        model: resolvedModel,
        inputs: {
          resumeId: job.data.resumeId || null,
          jobDescription: job.data.jobDescription || null,
          targetRole: job.data.targetRole || null,
          companyName: job.data.companyName || null,
          githubUsername: job.data.githubUsername || null
        }
      };
      if (typeof result === 'object' && result !== null) {
        resultPayloadForJob = { ...result, _meta: metaForJob };
      } else {
        resultPayloadForJob = { text: result, _meta: metaForJob };
      }

      await prisma.aIJob.update({
        where: { id: job.id },
        data: { 
          status: 'COMPLETED', 
          resultPayload: resultPayloadForJob,
          completedAt: new Date() 
        }
      });

      logger.info({ jobId: job.id, durationMs }, 'AI Job Completed Successfully');

      // =====================================================
      // Domain Event Side Effects (fire-and-forget)
      // =====================================================
      const typeInfo = JOB_TYPE_LABELS[job.name] || { label: job.name, event: 'AI_JOB_COMPLETED', icon: '🤖' };

      // Save to history
      const savedOutput = await saveToolOutput({
        userId: job.data.userId,
        aiJobId: job.id,
        jobName: job.name,
        jobData: job.data,
        result,
        provider: resolvedProvider,
        model: resolvedModel
      });

      let notificationUrl = typeInfo.url || `/dashboard`;
      if (savedOutput?.id) {
        notificationUrl += `?outputId=${savedOutput.id}`;
      }

      // Record in Ledger
      await recordGeneration({
        userId: job.data.userId,
        aiJobId: job.id,
        provider: resolvedProvider,
        modelId: resolvedModel,
        generationType: job.name,
        durationMs,
        wasRetry: (job.attemptsMade || 0) > 0,
        wasFallback: false,
        creditsCost: getCreditCost(job.name),
      });

      // Emit Activity Event
      const event = await emitEvent({
        type: typeInfo.event,
        actorId: job.data.userId,
        targetId: job.id,
        targetType: 'AI_JOB',
        metadata: {
          jobType: job.name,
          label: typeInfo.label,
          icon: typeInfo.icon,
          durationMs,
        },
      });

      // Create Notification
      await createNotification({
        userId: job.data.userId,
        title: `${typeInfo.icon} ${typeInfo.label} Complete`,
        message: `Your ${typeInfo.label.toLowerCase()} finished in ${Math.round(durationMs / 1000)}s.`,
        eventId: event?.id || null,
        actionUrl: notificationUrl,
        priority: 'NORMAL',
      });

      // Workflows
      if (job.name === 'PARSE_RESUME') {
        await upsertWorkflow({
          userId: job.data.userId,
          type: 'RESUME_OPTIMIZATION',
          currentStep: 'ANALYSIS_COMPLETE',
          completionPercentage: 30,
          metadata: { aiJobId: job.id, title: job.data.originalName },
        });
      } else if (job.name === 'TAILOR_RESUME') {
        await upsertWorkflow({
          userId: job.data.userId,
          type: 'RESUME_OPTIMIZATION',
          currentStep: 'TAILORING_COMPLETE',
          completionPercentage: 70,
          metadata: { aiJobId: job.id },
        });
      }

      return result;

    } catch (error) {
      const durationMs = Date.now() - startTime;
      logger.error({ jobId: job.id, err: error, durationMs }, 'AI Job Failed');
      
      // Mark job as FAILED
      await prisma.aIJob.update({
        where: { id: job.id },
        data: { 
          status: 'FAILED', 
          errorMessage: error.message,
          completedAt: new Date()
        }
      });

      // Record in ledger
      await recordGeneration({
        userId: job.data.userId,
        aiJobId: job.id,
        provider: resolvedProvider,
        modelId: resolvedModel,
        generationType: job.name,
        durationMs,
        wasRetry: (job.attemptsMade || 0) > 0,
        wasFallback: false,
        creditsCost: getCreditCost(job.name),
      });

      // Emit failure event
      const typeInfo = JOB_TYPE_LABELS[job.name] || { label: job.name, event: 'AI_JOB_FAILED', icon: '❌' };
      await emitEvent({
        type: 'AI_JOB_FAILED',
        actorId: job.data.userId,
        targetId: job.id,
        targetType: 'AI_JOB',
        metadata: { jobType: job.name, error: error.message, durationMs },
      });

      await createNotification({
        userId: job.data.userId,
        title: `❌ ${typeInfo.label} Failed`,
        message: `Your ${typeInfo.label.toLowerCase()} failed: ${error.message.substring(0, 100)}`,
        actionUrl: typeInfo.url || `/dashboard`,
        priority: 'HIGH',
      });
      
      // Refund credits
      await refundCredits(job.data.userId, job.name, `Job failed: ${error.message.substring(0, 100)}`);
      
      throw error;
    }
  });
};
// ============================================================================
// BullMQ Worker Initialization with Quota Guard
// ============================================================================
export let aiWorker = null;

export const initWorker = () => {
  if (isRedisQuotaExceeded()) {
    logger.info('AI Worker running in In-Process Mode (Redis quota exceeded)');
    return null;
  }

  try {
    const connection = createRedisConnection();
    if (!connection) {
      logger.info('AI Worker running in In-Process Mode (Redis offline or quota exceeded)');
      return null;
    }

    aiWorker = new Worker(
      AI_QUEUE_NAME,
      async (job) => processAIJob(job),
      { 
        connection,
        concurrency: 3,
        lockDuration: 120_000,
        stalledInterval: 60_000,
        maxStalledCount: 1,
        drainDelay: 5,
      }
    );

    aiWorker.on('error', (err) => {
      if (err?.message?.includes('max requests limit exceeded')) {
        logger.warn('[AI Worker] Upstash request limit reached. BullMQ worker paused; in-process processor active.');
        aiWorker?.pause(true).catch(() => {});
      } else {
        logger.warn({ err: err?.message }, 'AI Worker Redis notice');
      }
    });

    aiWorker.on('failed', (job, err) => {
      logger.error({ jobId: job?.id, err: err?.message }, 'Worker reported job failure');
    });

    logger.info(`AI BullMQ Worker initialized for queue: ${AI_QUEUE_NAME}`);
    return aiWorker;
  } catch (e) {
    logger.warn({ err: e.message }, 'Could not initialize BullMQ Worker; using in-process processor');
    return null;
  }
};

initWorker();
