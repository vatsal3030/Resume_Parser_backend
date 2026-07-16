import logger from '../config/logger.js';

/**
 * DSA Tracker Service
 * Fetches competitive programming stats from LeetCode, Codeforces, GeeksForGeeks, and CodeChef.
 * Uses public APIs and scraping where needed, with caching.
 */

// In-memory cache (15-minute TTL)
const cache = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
  // Prune old entries
  if (cache.size > 200) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts);
    for (let i = 0; i < 50; i++) cache.delete(oldest[i][0]);
  }
}

/**
 * Fetch LeetCode stats via public GraphQL endpoint.
 */
export async function fetchLeetCodeStats(username) {
  if (!username) return null;
  const cacheKey = `leetcode:${username}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    // Try the unofficial stats API first (simpler)
    const statsRes = await fetch(`https://leetcode-stats-api.herokuapp.com/${username}`, {
      signal: AbortSignal.timeout(10000)
    });
    
    if (statsRes.ok) {
      const data = await statsRes.json();
      if (data.status === 'success' || data.totalSolved !== undefined) {
        const result = {
          platform: 'LeetCode',
          username,
          totalSolved: data.totalSolved || 0,
          easySolved: data.easySolved || 0,
          mediumSolved: data.mediumSolved || 0,
          hardSolved: data.hardSolved || 0,
          totalQuestions: data.totalQuestions || 0,
          acceptanceRate: data.acceptanceRate || 0,
          ranking: data.ranking || 0,
          contributionPoints: data.contributionPoints || 0,
          reputation: data.reputation || 0,
          streak: null, // Not available from this API
          available: true
        };
        setCache(cacheKey, result);
        return result;
      }
    }

    // Fallback: Try LeetCode's GraphQL directly
    const graphqlRes = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query getUserProfile($username: String!) {
            matchedUser(username: $username) {
              username
              submitStats: submitStatsGlobal {
                acSubmissionNum {
                  difficulty
                  count
                }
              }
              profile {
                ranking
                reputation
              }
            }
          }
        `,
        variables: { username }
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (graphqlRes.ok) {
      const { data } = await graphqlRes.json();
      const user = data?.matchedUser;
      if (user) {
        const stats = user.submitStats?.acSubmissionNum || [];
        const findDiff = (d) => stats.find(s => s.difficulty === d)?.count || 0;
        const result = {
          platform: 'LeetCode',
          username,
          totalSolved: findDiff('All'),
          easySolved: findDiff('Easy'),
          mediumSolved: findDiff('Medium'),
          hardSolved: findDiff('Hard'),
          totalQuestions: null,
          acceptanceRate: null,
          ranking: user.profile?.ranking || 0,
          reputation: user.profile?.reputation || 0,
          streak: null,
          available: true
        };
        setCache(cacheKey, result);
        return result;
      }
    }

    return { platform: 'LeetCode', username, available: false, error: 'User not found' };
  } catch (error) {
    logger.warn({ err: error, username }, 'Failed to fetch LeetCode stats');
    return { platform: 'LeetCode', username, available: false, error: error.message };
  }
}

/**
 * Fetch Codeforces stats via official API.
 */
export async function fetchCodeforcesStats(handle) {
  if (!handle) return null;
  const cacheKey = `codeforces:${handle}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const [infoRes, ratingRes, statusRes] = await Promise.allSettled([
      fetch(`https://codeforces.com/api/user.info?handles=${handle}`, { signal: AbortSignal.timeout(10000) }),
      fetch(`https://codeforces.com/api/user.rating?handle=${handle}`, { signal: AbortSignal.timeout(10000) }),
      fetch(`https://codeforces.com/api/user.status?handle=${handle}&from=1&count=10000`, { signal: AbortSignal.timeout(15000) })
    ]);

    let userInfo = null;
    let ratingHistory = [];
    let totalSolved = 0;

    if (infoRes.status === 'fulfilled' && infoRes.value.ok) {
      const data = await infoRes.value.json();
      if (data.status === 'OK' && data.result?.length > 0) {
        userInfo = data.result[0];
      }
    }

    if (ratingRes.status === 'fulfilled' && ratingRes.value.ok) {
      const data = await ratingRes.value.json();
      if (data.status === 'OK') {
        ratingHistory = data.result || [];
      }
    }

    // Count unique accepted problems from submissions
    if (statusRes.status === 'fulfilled' && statusRes.value.ok) {
      const data = await statusRes.value.json();
      if (data.status === 'OK' && data.result) {
        const solvedSet = new Set();
        for (const sub of data.result) {
          if (sub.verdict === 'OK' && sub.problem) {
            solvedSet.add(`${sub.problem.contestId}-${sub.problem.index}`);
          }
        }
        totalSolved = solvedSet.size;
      }
    }

    if (!userInfo) {
      return { platform: 'Codeforces', username: handle, available: false, error: 'User not found' };
    }

    const result = {
      platform: 'Codeforces',
      username: handle,
      totalSolved,
      rating: userInfo.rating || 0,
      maxRating: userInfo.maxRating || 0,
      rank: userInfo.rank || 'unrated',
      maxRank: userInfo.maxRank || 'unrated',
      contribution: userInfo.contribution || 0,
      friendOfCount: userInfo.friendOfCount || 0,
      avatar: userInfo.avatar || null,
      contestCount: ratingHistory.length,
      ratingHistory: ratingHistory.slice(-20).map(r => ({
        contestName: r.contestName,
        rank: r.rank,
        oldRating: r.oldRating,
        newRating: r.newRating,
        date: new Date(r.ratingUpdateTimeSeconds * 1000).toISOString()
      })),
      available: true
    };

    setCache(cacheKey, result);
    return result;
  } catch (error) {
    logger.warn({ err: error, handle }, 'Failed to fetch Codeforces stats');
    return { platform: 'Codeforces', username: handle, available: false, error: error.message };
  }
}

/**
 * Fetch GeeksForGeeks stats by scraping the public profile API.
 */
export async function fetchGFGStats(username) {
  if (!username) return null;
  const cacheKey = `gfg:${username}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    let success = false;
    let result = null;

    // Try primary API first
    try {
      const res = await fetch(`https://geeks-for-geeks-stats-api.vercel.app/?userName=${username}`, {
        signal: AbortSignal.timeout(6000)
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.totalProblemsSolved !== undefined) {
          result = {
            platform: 'GeeksForGeeks',
            username,
            totalSolved: data.totalProblemsSolved || 0,
            easySolved: data.Easy || 0,
            mediumSolved: data.Medium || 0,
            hardSolved: data.Hard || 0,
            score: data.codingScore || 0,
            monthlyScore: data.currentStreak || 0,
            instituteRank: data.instituteRank || null,
            available: true
          };
          success = true;
        }
      }
    } catch (e) {
      logger.warn({ err: e, username }, 'Primary GFG stats API failed, attempting fallback card API');
    }

    // Fallback API if primary failed or returned invalid data
    if (!success) {
      try {
        const resFallback = await fetch(`https://gfgstatscard.vercel.app/${username}?raw=true`, {
          signal: AbortSignal.timeout(8000)
        });

        if (resFallback.ok) {
          const data = await resFallback.json();
          if (data && data.total_problems_solved !== undefined) {
            const total_solved = data.total_problems_solved || 0;
            const school = data.School || 0;
            const basic = data.Basic || 0;
            const easy = data.Easy || 0;
            const medium = data.Medium || 0;
            const hard = data.Hard || 0;
            const score = data.total_score || 0;
            const monthlyScore = data.pod_solved_current_streak || 0;

            result = {
              platform: 'GeeksForGeeks',
              username,
              totalSolved: total_solved,
              easySolved: easy + basic + school,
              mediumSolved: medium,
              hardSolved: hard,
              score: score,
              monthlyScore: monthlyScore,
              instituteRank: null,
              available: true
            };
            success = true;
          }
        }
      } catch (fallbackError) {
        logger.warn({ err: fallbackError, username }, 'Fallback GFG stats API also failed');
      }
    }

    if (success && result) {
      setCache(cacheKey, result);
      return result;
    }

    return { platform: 'GeeksForGeeks', username, available: false, error: 'User not found' };
  } catch (error) {
    logger.warn({ err: error, username }, 'Failed to fetch GFG stats');
    return { platform: 'GeeksForGeeks', username, available: false, error: error.message };
  }
}

/**
 * Fetch CodeChef stats via public API.
 */
export async function fetchCodeChefStats(username) {
  if (!username) return null;
  const cacheKey = `codechef:${username}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(`https://codechef-api.vercel.app/handle/${username}`, {
      signal: AbortSignal.timeout(10000)
    });

    if (res.ok) {
      const data = await res.json();
      if (data && !data.error) {
        const result = {
          platform: 'CodeChef',
          username,
          totalSolved: data.currentRating ? null : 0,
          rating: data.currentRating || 0,
          maxRating: data.highestRating || 0,
          stars: data.stars || '★',
          globalRank: data.globalRank || null,
          countryRank: data.countryRank || null,
          available: true
        };
        // Try to get problems solved from fully_solved count
        if (data.heatMap) {
          let count = 0;
          for (const entry of data.heatMap) {
            count += entry.value || 0;
          }
          result.totalSolved = count;
        }
        setCache(cacheKey, result);
        return result;
      }
    }

    return { platform: 'CodeChef', username, available: false, error: 'User not found' };
  } catch (error) {
    logger.warn({ err: error, username }, 'Failed to fetch CodeChef stats');
    return { platform: 'CodeChef', username, available: false, error: error.message };
  }
}

/**
 * Fetch HackerRank basic profile info.
 */
export async function fetchHackerRankStats(username) {
  if (!username) return null;
  const cacheKey = `hackerrank:${username}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(`https://www.hackerrank.com/rest/hackers/${username}/scores_elo`, {
      signal: AbortSignal.timeout(8000),
      headers: { 'Accept': 'application/json' }
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        const result = {
          platform: 'HackerRank',
          username,
          totalSolved: null,
          badges: data.map(d => ({ name: d.name, score: d.score })),
          available: true
        };
        setCache(cacheKey, result);
        return result;
      }
    }

    return { platform: 'HackerRank', username, available: false, error: 'User not found' };
  } catch (error) {
    logger.warn({ err: error, username }, 'Failed to fetch HackerRank stats');
    return { platform: 'HackerRank', username, available: false, error: error.message };
  }
}

/**
 * Fetch all platform stats in parallel.
 */
export async function fetchAllDSAStats(usernames) {
  const { leetcode, codeforces, gfg, codechef, hackerrank } = usernames;

  const results = await Promise.allSettled([
    leetcode ? fetchLeetCodeStats(leetcode) : null,
    codeforces ? fetchCodeforcesStats(codeforces) : null,
    gfg ? fetchGFGStats(gfg) : null,
    codechef ? fetchCodeChefStats(codechef) : null,
    hackerrank ? fetchHackerRankStats(hackerrank) : null,
  ]);

  const platforms = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) platforms.push(r.value);
  }

  // Calculate aggregated stats
  const totalSolved = platforms.reduce((sum, p) => sum + (p.totalSolved || 0), 0);
  const platformCount = platforms.filter(p => p.available).length;

  return {
    platforms,
    aggregated: {
      totalSolved,
      platformCount,
      activePlatforms: platforms.filter(p => p.available).map(p => p.platform),
    }
  };
}
