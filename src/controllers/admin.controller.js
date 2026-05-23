import prisma from '../config/db.js';
import logger from '../config/logger.js';
import { cleanupStaleJobs } from '../services/staleJob.service.js';

/**
 * Full platform observability metrics.
 * Requires ADMIN role (enforced at the router level).
 */
export const getPlatformMetrics = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Run in parallel for speed
    const [
      jobsToday,
      generationsToday,
      providerBreakdown,
      newUsers,
      totalUsers,
      activeWorkflows,
      unreadNotifications,
      recentFailedJobs,
      staleCleanup
    ] = await Promise.all([
      // 1. Job Statistics by status
      prisma.aIJob.groupBy({
        by: ['status'],
        where: { createdAt: { gte: today } },
        _count: { id: true }
      }),

      // 2. Token Usage & Cost aggregates
      prisma.aIGeneration.aggregate({
        where: { createdAt: { gte: today } },
        _sum: { tokensPrompt: true, tokensCompletion: true, estimatedCostUsd: true },
        _avg: { durationMs: true },
        _count: { id: true }
      }),

      // 3. Provider breakdown
      prisma.aIGeneration.groupBy({
        by: ['provider'],
        where: { createdAt: { gte: today } },
        _count: { id: true },
        _sum: { estimatedCostUsd: true }
      }),

      // 4. User growth
      prisma.user.count({ where: { createdAt: { gte: today } } }),

      // 5. Total users
      prisma.user.count(),

      // 6. Active workflows
      prisma.workflow.count({ where: { status: 'IN_PROGRESS' } }),

      // 7. Unread notifications (platform-wide)
      prisma.notification.count({ where: { isRead: false } }),

      // 8. Recent failed jobs (last 10)
      prisma.aIJob.findMany({
        where: { status: 'FAILED', createdAt: { gte: today } },
        select: { id: true, type: true, errorMessage: true, createdAt: true, userId: true },
        orderBy: { createdAt: 'desc' },
        take: 10
      }),

      // 9. Clean up stale jobs as a side effect
      cleanupStaleJobs()
    ]);

    // Parse job stats
    const jobStats = { COMPLETED: 0, FAILED: 0, PENDING: 0, PROCESSING: 0 };
    jobsToday.forEach(j => { jobStats[j.status] = j._count.id; });

    // Parse provider breakdown
    const providers = {};
    providerBreakdown.forEach(p => {
      providers[p.provider] = {
        count: p._count.id,
        costUsd: parseFloat(p._sum.estimatedCostUsd || 0)
      };
    });

    res.status(200).json({
      timestamp: new Date().toISOString(),
      metrics: {
        jobs: {
          ...jobStats,
          total: Object.values(jobStats).reduce((a, b) => a + b, 0),
          failureRate: jobStats.COMPLETED + jobStats.FAILED > 0
            ? ((jobStats.FAILED / (jobStats.COMPLETED + jobStats.FAILED)) * 100).toFixed(1) + '%'
            : '0%'
        },
        tokens: {
          prompt: generationsToday._sum.tokensPrompt || 0,
          completion: generationsToday._sum.tokensCompletion || 0,
          totalGenerations: generationsToday._count.id || 0,
          costUsd: parseFloat(generationsToday._sum.estimatedCostUsd || 0).toFixed(4),
          avgLatencyMs: Math.round(generationsToday._avg.durationMs || 0)
        },
        providers,
        users: {
          newSignupsToday: newUsers,
          totalUsers
        },
        workflows: {
          activeCount: activeWorkflows
        },
        notifications: {
          unreadCount: unreadNotifications
        },
        recentFailures: recentFailedJobs,
        staleJobsRecovered: staleCleanup.recovered
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch platform metrics');
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
};
