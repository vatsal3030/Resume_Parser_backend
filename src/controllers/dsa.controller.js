import { fetchLeetCodeStats, fetchCodeforcesStats, fetchGFGStats, fetchAllDSAStats } from '../services/dsa.service.js';
import prisma from '../config/db.js';
import logger from '../config/logger.js';

/**
 * GET /api/dsa/stats
 * Fetch DSA stats for all saved platform usernames.
 * Query: ?leetcode=xxx&codeforces=xxx&gfg=xxx (overrides saved usernames)
 */
export const getDSAStats = async (req, res) => {
  try {
    const { leetcode, codeforces, gfg } = req.query;
    
    // If query params provided, fetch those directly
    if (leetcode || codeforces || gfg) {
      const stats = await fetchAllDSAStats({ leetcode, codeforces, gfg });
      return res.json(stats);
    }

    // Otherwise, load saved usernames from user profile
    const profile = await prisma.profile.findUnique({
      where: { userId: req.user.id }
    });

    const dsaUsernames = profile?.dsaPlatforms || {};
    if (!dsaUsernames.leetcode && !dsaUsernames.codeforces && !dsaUsernames.gfg) {
      return res.json({ platforms: [], aggregated: { totalSolved: 0, platformCount: 0, activePlatforms: [] } });
    }

    const stats = await fetchAllDSAStats(dsaUsernames);
    res.json(stats);
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch DSA stats');
    res.status(500).json({ error: 'Failed to fetch DSA stats' });
  }
};

/**
 * PUT /api/dsa/usernames
 * Save platform usernames to user profile.
 */
export const saveDSAUsernames = async (req, res) => {
  try {
    const { leetcode, codeforces, gfg } = req.body;

    await prisma.profile.upsert({
      where: { userId: req.user.id },
      update: {
        dsaPlatforms: { leetcode: leetcode || null, codeforces: codeforces || null, gfg: gfg || null }
      },
      create: {
        userId: req.user.id,
        dsaPlatforms: { leetcode: leetcode || null, codeforces: codeforces || null, gfg: gfg || null }
      }
    });

    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Failed to save DSA usernames');
    res.status(500).json({ error: 'Failed to save DSA usernames' });
  }
};

/**
 * GET /api/dsa/platform/:platform/:username
 * Fetch stats for a single platform (for live preview).
 */
export const getSinglePlatformStats = async (req, res) => {
  try {
    const { platform, username } = req.params;
    
    let stats;
    switch (platform.toLowerCase()) {
      case 'leetcode':
        stats = await fetchLeetCodeStats(username);
        break;
      case 'codeforces':
        stats = await fetchCodeforcesStats(username);
        break;
      case 'gfg':
      case 'geeksforgeeks':
        stats = await fetchGFGStats(username);
        break;
      default:
        return res.status(400).json({ error: `Unknown platform: ${platform}` });
    }

    res.json(stats);
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch platform stats');
    res.status(500).json({ error: 'Failed to fetch platform stats' });
  }
};
