import prisma from '../config/db.js';
import logger from '../config/logger.js';

/**
 * History Controller
 * Centralized CRUD for tool_outputs (AI generation history).
 */

// Tool type display names
const TOOL_LABELS = {
  PARSE_RESUME: 'Resume Analysis',
  TAILOR_RESUME: 'Resume Tailoring',
  GENERATE_COVER_LETTER: 'Cover Letter',
  GENERATE_MOCK_INTERVIEW: 'Mock Interview',
  GENERATE_ROADMAP: 'Career Roadmap',
  GENERATE_PORTFOLIO: 'Portfolio',
  ANALYZE_GITHUB: 'GitHub Analysis',
};

/**
 * GET /history
 * List all tool outputs for the current user (paginated, filterable).
 * Query params: ?tool_type=COVER_LETTER&page=1&limit=20&pinned=true
 */
export const listHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      tool_type,
      pinned,
      page = 1,
      limit = 20,
      search,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where = { userId, deletedAt: null };
    if (tool_type) where.toolType = tool_type;
    if (pinned === 'true') where.isPinned = true;
    if (search) {
      where.title = { contains: search, mode: 'insensitive' };
    }

    const [items, total] = await Promise.all([
      prisma.toolOutput.findMany({
        where,
        orderBy: [
          { isPinned: 'desc' },
          { createdAt: 'desc' },
        ],
        skip,
        take: limitNum,
        select: {
          id: true,
          toolType: true,
          title: true,
          inputSummary: true,
          isPinned: true,
          createdAt: true,
          updatedAt: true,
          // Exclude outputPayload from list (it can be large)
        },
      }),
      prisma.toolOutput.count({ where }),
    ]);

    res.json({
      items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to list history');
    res.status(500).json({ error: 'Failed to fetch history' });
  }
};

/**
 * GET /history/:id
 * Get single tool output with full payload.
 */
export const getHistoryItem = async (req, res) => {
  try {
    const targetId = req.params.id;
    const item = await prisma.toolOutput.findFirst({
      where: {
        OR: [
          { id: targetId },
          { aiJobId: targetId }
        ],
        userId: req.user.id,
        deletedAt: null,
      },
    });

    if (!item) {
      return res.status(404).json({ error: 'History item not found' });
    }

    res.json(item);
  } catch (error) {
    logger.error({ err: error }, 'Failed to get history item');
    res.status(500).json({ error: 'Failed to fetch history item' });
  }
};

/**
 * PUT /history/:id
 * Update title or pin status.
 */
export const updateHistoryItem = async (req, res) => {
  try {
    const targetId = req.params.id;
    const { title, isPinned, outputPayload } = req.body;
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (isPinned !== undefined) updateData.isPinned = isPinned;
    if (outputPayload !== undefined) updateData.outputPayload = outputPayload;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const item = await prisma.toolOutput.updateMany({
      where: {
        OR: [
          { id: targetId },
          { aiJobId: targetId }
        ],
        userId: req.user.id,
        deletedAt: null,
      },
      data: updateData,
    });

    if (item.count === 0) {
      return res.status(404).json({ error: 'History item not found' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Failed to update history item');
    res.status(500).json({ error: 'Failed to update history item' });
  }
};

/**
 * DELETE /history/:id
 * Soft delete (sets deleted_at timestamp).
 */
export const deleteHistoryItem = async (req, res) => {
  try {
    const targetId = req.params.id;
    const result = await prisma.toolOutput.updateMany({
      where: {
        OR: [
          { id: targetId },
          { aiJobId: targetId }
        ],
        userId: req.user.id,
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    });

    if (result.count === 0) {
      return res.status(404).json({ error: 'History item not found' });
    }

    res.json({ success: true, message: 'Moved to trash' });
  } catch (error) {
    logger.error({ err: error }, 'Failed to delete history item');
    res.status(500).json({ error: 'Failed to delete history item' });
  }
};

/**
 * POST /history/:id/restore
 * Restore from trash.
 */
export const restoreHistoryItem = async (req, res) => {
  try {
    const targetId = req.params.id;
    const result = await prisma.toolOutput.updateMany({
      where: {
        OR: [
          { id: targetId },
          { aiJobId: targetId }
        ],
        userId: req.user.id,
        deletedAt: { not: null },
      },
      data: { deletedAt: null },
    });

    if (result.count === 0) {
      return res.status(404).json({ error: 'Trashed item not found' });
    }

    res.json({ success: true, message: 'Restored from trash' });
  } catch (error) {
    logger.error({ err: error }, 'Failed to restore history item');
    res.status(500).json({ error: 'Failed to restore history item' });
  }
};

/**
 * GET /history/trash
 * List all trashed items (across all tool types) for the current user.
 */
export const listTrash = async (req, res) => {
  try {
    const userId = req.user.id;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const items = await prisma.toolOutput.findMany({
      where: {
        userId,
        deletedAt: { not: null, gte: thirtyDaysAgo },
      },
      orderBy: { deletedAt: 'desc' },
      select: {
        id: true,
        toolType: true,
        title: true,
        isPinned: true,
        deletedAt: true,
        createdAt: true,
      },
    });

    // Add days remaining until permanent deletion
    const enriched = items.map(item => {
      const deletedDate = new Date(item.deletedAt);
      const expiresAt = new Date(deletedDate);
      expiresAt.setDate(expiresAt.getDate() + 30);
      const daysRemaining = Math.max(0, Math.ceil((expiresAt - new Date()) / (1000 * 60 * 60 * 24)));
      return { ...item, daysRemaining, expiresAt };
    });

    res.json({ items: enriched });
  } catch (error) {
    logger.error({ err: error }, 'Failed to list trash');
    res.status(500).json({ error: 'Failed to fetch trash' });
  }
};

/**
 * DELETE /history/:id/permanent
 * Permanently delete (only if soft-deleted > 30 days ago OR by explicit request).
 */
export const permanentDeleteItem = async (req, res) => {
  try {
    const targetId = req.params.id;
    // First verify it's trashed and owned by user
    const item = await prisma.toolOutput.findFirst({
      where: {
        OR: [
          { id: targetId },
          { aiJobId: targetId }
        ],
        userId: req.user.id,
        deletedAt: { not: null },
      },
    });

    if (!item) {
      return res.status(404).json({ error: 'Trashed item not found' });
    }

    // Hard delete
    await prisma.toolOutput.deleteMany({
      where: {
        id: item.id,
        userId: req.user.id
      }
    });

    res.json({ success: true, message: 'Permanently deleted' });
  } catch (error) {
    logger.error({ err: error }, 'Failed to permanently delete item');
    res.status(500).json({ error: 'Failed to permanently delete' });
  }
};

/**
 * DELETE /history/trash/empty
 * Empty entire trash for user.
 */
export const emptyTrash = async (req, res) => {
  try {
    const result = await prisma.$executeRaw`
      DELETE FROM tool_outputs 
      WHERE user_id = ${req.user.id} 
      AND deleted_at IS NOT NULL
    `;

    res.json({ success: true, message: `Permanently deleted ${result} items` });
  } catch (error) {
    logger.error({ err: error }, 'Failed to empty trash');
    res.status(500).json({ error: 'Failed to empty trash' });
  }
};

/**
 * DELETE /history/clear
 * Bulk soft delete all non-pinned tool outputs for a given toolType.
 * Query params: ?tool_type=COVER_LETTER
 */
export const clearHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { tool_type } = req.query;

    if (!tool_type) {
      return res.status(400).json({ error: 'tool_type query parameter is required' });
    }

    const result = await prisma.toolOutput.updateMany({
      where: {
        userId,
        toolType: tool_type,
        isPinned: false,
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    });

    res.json({ success: true, message: `Soft-deleted ${result.count} history items`, count: result.count });
  } catch (error) {
    logger.error({ err: error, tool_type }, 'Failed to clear history');
    res.status(500).json({ error: 'Failed to clear history' });
  }
};
