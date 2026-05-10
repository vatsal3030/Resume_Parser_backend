import { Worker } from 'bullmq';
import { createRedisConnection } from '../config/redis.js';
import logger from '../config/logger.js';
import prisma from '../config/db.js';
import { AI_QUEUE_NAME } from '../queues/ai.queue.js';
import { 
  extractDetailsFromPDF, 
  tailorResume, 
  generateCoverLetter, 
  generateMockInterview,
  generateRoadmap,
  generatePortfolio,
  analyzeGitHub
} from '../services/ai.service.js';

logger.info(`Starting AI Worker for queue: ${AI_QUEUE_NAME}`);

/**
 * AI Worker — Upstash Free Tier Optimized
 * 
 * Key optimizations to reduce Redis command usage:
 * 
 * 1. concurrency: 1           → Process one job at a time (fewer parallel Redis reads)
 * 2. lockDuration: 120000     → 2 min lock (AI calls are slow; avoids stale-retry storms)
 * 3. stalledInterval: 120000  → Check stalled jobs every 2 min (default is 30s = lots of commands)
 * 4. drainDelay: 10           → 10s pause when queue is empty (default 5s; saves ~260k polls/month)
 * 5. maxStalledCount: 1       → Mark stalled after 1 check, not 2 (faster cleanup)
 * 
 * Command savings estimate:
 *   - stalledInterval 30s→120s:  ~87k commands/month saved
 *   - drainDelay 5s→10s:         ~130k commands/month saved
 *   - Total: ~217k commands saved (43% of free tier budget)
 */
export const aiWorker = new Worker(
  AI_QUEUE_NAME,
  async (job) => {
    logger.info({ jobId: job.id, name: job.name }, 'Processing AI Job');
    
    // 1. Update job status to PROCESSING in DB
    await prisma.aIJob.update({
      where: { id: job.id },
      data: { status: 'PROCESSING', startedAt: new Date() }
    });

    try {
      let result;

      // 2. Route the job based on name/type
      switch (job.name) {
        case 'PARSE_RESUME':
          result = await extractDetailsFromPDF(job.data.resumeText, job.data.modelId);
          
          // Save the parsed Document
          await prisma.document.create({
            data: {
              userId: job.data.userId,
              type: 'RESUME',
              title: job.data.originalName,
              content: result,
              atsScore: result.atsScore,
              jobFitScore: result.jobFitScore
            }
          });
          break;

        case 'TAILOR_RESUME':
          result = await tailorResume(job.data.resumeText, job.data.jobDescription, job.data.modelId);
          break;

        case 'GENERATE_COVER_LETTER':
          result = await generateCoverLetter(job.data.resumeText, job.data.jobDescription, job.data.modelId);
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
          result = await generateMockInterview(job.data.resumeText, job.data.targetRole, job.data.modelId);
          break;

        case 'GENERATE_ROADMAP':
          result = await generateRoadmap(job.data.resumeText, job.data.targetRole, job.data.modelId);
          break;

        case 'GENERATE_PORTFOLIO':
          result = await generatePortfolio(job.data.resumeText, job.data.modelId);
          break;

        case 'ANALYZE_GITHUB':
          result = await analyzeGitHub(job.data.githubUsername, job.data.modelId);
          break;

        default:
          throw new Error(`Unknown job type: ${job.name}`);
      }

      // 3. Mark job as COMPLETED
      await prisma.aIJob.update({
        where: { id: job.id },
        data: { 
          status: 'COMPLETED', 
          resultPayload: result,
          completedAt: new Date() 
        }
      });

      logger.info({ jobId: job.id }, 'AI Job Completed Successfully');
      return result;

    } catch (error) {
      logger.error({ jobId: job.id, err: error }, 'AI Job Failed');
      
      // 4. Mark job as FAILED
      await prisma.aIJob.update({
        where: { id: job.id },
        data: { 
          status: 'FAILED', 
          errorMessage: error.message,
          completedAt: new Date()
        }
      });
      
      throw error; // Let BullMQ handle retries if applicable
    }
  },
  { 
    connection: createRedisConnection(),
    
    // === UPSTASH FREE TIER OPTIMIZATIONS ===
    concurrency: 1,               // 1 job at a time (AI calls are slow anyway)
    lockDuration: 120_000,        // 2 min lock (AI generation takes 10-30s)
    stalledInterval: 120_000,     // Check stalled every 2 min (default: 30s)
    maxStalledCount: 1,           // Fail stalled jobs after 1 check
    drainDelay: 10,               // 10s pause when queue empty (default: 5s)
  }
);

aiWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'Worker reported failure');
});
