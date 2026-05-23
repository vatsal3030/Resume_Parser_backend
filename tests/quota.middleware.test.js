import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma
vi.mock('../src/config/db.js', () => ({
  default: {
    aIGeneration: {
      count: vi.fn(),
    },
    aIJob: {
      count: vi.fn(),
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

vi.mock('../src/config/config.js', () => ({
  config: {
    limits: {
      maxGenerationsPerDay: 5,
      maxConcurrentJobs: 1,
    }
  }
}));

import prisma from '../src/config/db.js';
import { enforceQuota } from '../src/middlewares/quota.middleware.js';

describe('Quota Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    vi.clearAllMocks();
    req = { user: { id: 'user-1' } };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    next = vi.fn();
  });

  it('should call next() when user is within quota', async () => {
    prisma.aIGeneration.count.mockResolvedValue(2); // Below limit of 5
    prisma.aIJob.count.mockResolvedValue(0); // No active jobs

    await enforceQuota(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should return 429 when daily generation limit is exceeded', async () => {
    prisma.aIGeneration.count.mockResolvedValue(5); // At the limit

    await enforceQuota(req, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 429 when concurrent job limit is exceeded', async () => {
    prisma.aIGeneration.count.mockResolvedValue(1); // Below daily limit
    prisma.aIJob.count.mockResolvedValue(1); // At concurrent limit

    await enforceQuota(req, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when no user is present', async () => {
    req.user = null;

    await enforceQuota(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 500 on database error', async () => {
    prisma.aIGeneration.count.mockRejectedValue(new Error('DB down'));

    await enforceQuota(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });
});
