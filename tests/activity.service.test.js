import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma before importing the service
vi.mock('../src/config/db.js', () => ({
  default: {
    activityEvent: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
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
import { emitEvent, getRecentActivity } from '../src/services/activity.service.js';

describe('ActivityService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('emitEvent', () => {
    it('should create an activity event successfully', async () => {
      const mockEvent = { id: 'evt-1', type: 'RESUME_UPLOADED', actorId: 'user-1' };
      prisma.activityEvent.create.mockResolvedValue(mockEvent);
      prisma.activityEvent.findFirst.mockResolvedValue(null); // No duplicate

      const result = await emitEvent({
        type: 'RESUME_UPLOADED',
        actorId: 'user-1',
        targetId: 'doc-1',
        targetType: 'RESUME',
      });

      expect(result).toEqual(mockEvent);
      expect(prisma.activityEvent.create).toHaveBeenCalledOnce();
    });

    it('should return existing event if duplicate detected (idempotency)', async () => {
      const existingEvent = { id: 'evt-existing', type: 'RESUME_UPLOADED', actorId: 'user-1' };
      prisma.activityEvent.findFirst.mockResolvedValue(existingEvent);

      const result = await emitEvent({
        type: 'RESUME_UPLOADED',
        actorId: 'user-1',
        targetId: 'doc-1',
        targetType: 'RESUME',
      });

      expect(result).toEqual(existingEvent);
      expect(prisma.activityEvent.create).not.toHaveBeenCalled();
    });

    it('should skip idempotency check when no targetId is provided', async () => {
      const mockEvent = { id: 'evt-2', type: 'USER_SIGNED_UP', actorId: 'user-2' };
      prisma.activityEvent.create.mockResolvedValue(mockEvent);

      const result = await emitEvent({
        type: 'USER_SIGNED_UP',
        actorId: 'user-2',
      });

      expect(result).toEqual(mockEvent);
      expect(prisma.activityEvent.findFirst).not.toHaveBeenCalled();
      expect(prisma.activityEvent.create).toHaveBeenCalledOnce();
    });

    it('should return null and not throw on database error', async () => {
      prisma.activityEvent.findFirst.mockRejectedValue(new Error('DB connection lost'));

      const result = await emitEvent({
        type: 'RESUME_UPLOADED',
        actorId: 'user-1',
        targetId: 'doc-1',
      });

      expect(result).toBeNull();
    });
  });

  describe('getRecentActivity', () => {
    it('should return recent events ordered by createdAt desc', async () => {
      const mockEvents = [
        { id: 'e1', type: 'A', createdAt: new Date() },
        { id: 'e2', type: 'B', createdAt: new Date() },
      ];
      prisma.activityEvent.findMany.mockResolvedValue(mockEvents);

      const result = await getRecentActivity('user-1', 10);

      expect(result).toEqual(mockEvents);
      expect(prisma.activityEvent.findMany).toHaveBeenCalledWith({
        where: { actorId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
    });

    it('should return empty array on error', async () => {
      prisma.activityEvent.findMany.mockRejectedValue(new Error('timeout'));

      const result = await getRecentActivity('user-1');

      expect(result).toEqual([]);
    });
  });
});
