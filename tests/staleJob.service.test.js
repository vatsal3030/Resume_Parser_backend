import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/config/db.js', () => ({
  default: {
    aIJob: {
      updateMany: vi.fn(),
    }
  }
}));

vi.mock('../src/config/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}));

import prisma from '../src/config/db.js';
import { cleanupStaleJobs } from '../src/services/staleJob.service.js';

describe('StaleJobService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should mark stale PROCESSING and PENDING jobs as FAILED', async () => {
    prisma.aIJob.updateMany
      .mockResolvedValueOnce({ count: 2 })  // stale processing
      .mockResolvedValueOnce({ count: 1 }); // stale pending

    const result = await cleanupStaleJobs();

    expect(result.recovered).toBe(3);
    expect(result.processing).toBe(2);
    expect(result.pending).toBe(1);
    expect(prisma.aIJob.updateMany).toHaveBeenCalledTimes(2);
  });

  it('should return 0 recovered when no stale jobs exist', async () => {
    prisma.aIJob.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 });

    const result = await cleanupStaleJobs();

    expect(result.recovered).toBe(0);
  });

  it('should handle database errors gracefully', async () => {
    prisma.aIJob.updateMany.mockRejectedValue(new Error('DB down'));

    const result = await cleanupStaleJobs();

    expect(result.recovered).toBe(0);
  });
});
