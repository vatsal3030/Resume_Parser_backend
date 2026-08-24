import Redis from 'ioredis';
import logger from './logger.js';

/**
 * Resilient Redis Configuration with Auto In-Memory Fallback
 * 
 * Protects against:
 * 1. Upstash Free Tier Command Limit Exceeded (500k commands/month)
 * 2. Network dropouts / TLS disconnections
 * 3. Cache read/write exceptions crashing API endpoints
 */

const isProduction = process.env.NODE_ENV === 'production';
const redisUrl = process.env.REDIS_URL;

// State flags
let isQuotaExceeded = false;
let isConnected = false;
let loggedLimitWarning = false;

// In-Memory Fallback Cache (LRU-like with TTL)
const memoryCache = new Map();
const MAX_MEMORY_ITEMS = 1000;

export const isRedisQuotaExceeded = () => isQuotaExceeded;
export const isRedisAvailable = () => isConnected && !isQuotaExceeded;

let connectionOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
  enableOfflineQueue: false, // Fail immediately instead of queuing commands when Redis is down
  reconnectOnError: (err) => {
    if (err?.message?.includes('max requests limit exceeded')) {
      isQuotaExceeded = true;
      return false; // Do NOT attempt reconnection if quota is exceeded
    }
    return true;
  }
};

if (redisUrl) {
  connectionOptions = {
    ...connectionOptions,
    ...(redisUrl.startsWith('rediss://') ? { tls: { rejectUnauthorized: false } } : {}),
  };
} else {
  connectionOptions = {
    ...connectionOptions,
    host: '127.0.0.1',
    port: 6379,
  };
}

// Shared Redis client for caching
let redisClient = null;

try {
  redisClient = redisUrl
    ? new Redis(redisUrl, connectionOptions)
    : new Redis(connectionOptions);

  redisClient.on('connect', () => {
    isConnected = true;
    logger.info(`[Redis] Connected successfully ${redisUrl ? '(Upstash)' : '(localhost)'}`);
  });

  redisClient.on('ready', () => {
    isConnected = true;
  });

  redisClient.on('close', () => {
    isConnected = false;
  });

  redisClient.on('error', (err) => {
    if (err?.message?.includes('max requests limit exceeded')) {
      isQuotaExceeded = true;
      isConnected = false;
      if (!loggedLimitWarning) {
        logger.warn('[Redis] Upstash 500k monthly request limit reached. Gracefully switching to In-Memory Cache and In-Process Job Processing. (Zero downtime)');
        loggedLimitWarning = true;
      }
    } else {
      logger.warn({ err: err?.message }, '[Redis] Connection warning (using safe fallback)');
    }
  });

  // Attempt initial connect
  redisClient.connect().catch((err) => {
    if (err?.message?.includes('max requests limit exceeded')) {
      isQuotaExceeded = true;
    }
    logger.warn({ err: err.message }, '[Redis] Initial connect failed, using memory fallback');
  });

} catch (e) {
  logger.error({ err: e.message }, '[Redis] Failed to initialize client');
}

const bullMQConnectionOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
  retryStrategy: (times) => {
    if (isQuotaExceeded) return null;
    return Math.min(times * 500, 2000);
  },
  reconnectOnError: (err) => {
    if (err?.message?.includes('max requests limit exceeded')) {
      isQuotaExceeded = true;
      return false;
    }
    return true;
  },
  ...(redisUrl && redisUrl.startsWith('rediss://') ? { tls: { rejectUnauthorized: false } } : {}),
};

/**
 * Creates a duplicate connection for BullMQ
 */
export const createRedisConnection = () => {
  if (isQuotaExceeded) {
    return null;
  }
  try {
    return redisUrl
      ? new Redis(redisUrl, bullMQConnectionOptions)
      : new Redis(bullMQConnectionOptions);
  } catch (err) {
    logger.warn({ err: err.message }, '[Redis] Could not duplicate Redis connection');
    return null;
  }
};

/**
 * Safe Cache GET: Reads from Redis if healthy, falls back to in-memory Map
 */
export const safeCacheGet = async (key) => {
  if (isRedisAvailable() && redisClient?.status === 'ready') {
    try {
      const data = await redisClient.get(key);
      if (data) return data;
    } catch (err) {
      if (err?.message?.includes('max requests limit exceeded')) {
        isQuotaExceeded = true;
      }
    }
  }

  // Memory fallback
  const item = memoryCache.get(key);
  if (item) {
    if (Date.now() < item.expiresAt) {
      return item.value;
    }
    memoryCache.delete(key);
  }
  return null;
};

/**
 * Safe Cache SET: Writes to in-memory Map AND Redis (if healthy)
 */
export const safeCacheSet = async (key, value, ttlSeconds = 60) => {
  // Always update in-memory cache
  if (memoryCache.size >= MAX_MEMORY_ITEMS) {
    const oldestKey = memoryCache.keys().next().value;
    memoryCache.delete(oldestKey);
  }
  memoryCache.set(key, { 
    value, 
    expiresAt: Date.now() + (ttlSeconds * 1000) 
  });

  if (isRedisAvailable() && redisClient?.status === 'ready') {
    try {
      await redisClient.set(key, value, 'EX', ttlSeconds);
    } catch (err) {
      if (err?.message?.includes('max requests limit exceeded')) {
        isQuotaExceeded = true;
      }
    }
  }
};

/**
 * Safe Cache DEL: Deletes from in-memory Map and Redis
 */
export const safeCacheDel = async (key) => {
  memoryCache.delete(key);
  if (isRedisAvailable() && redisClient?.status === 'ready') {
    try {
      await redisClient.del(key);
    } catch (err) {
      if (err?.message?.includes('max requests limit exceeded')) {
        isQuotaExceeded = true;
      }
    }
  }
};

export default redisClient;
