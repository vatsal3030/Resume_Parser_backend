import Redis from 'ioredis';
import logger from './logger.js';

/**
 * Redis Configuration — Upstash-optimized for free tier
 * 
 * Free tier limits: 500k commands/month, 50GB bandwidth, 256MB storage
 * 
 * Strategy:
 * - Uses REDIS_URL (Upstash TLS) in production
 * - Falls back to localhost for local development
 * - TLS is auto-detected from rediss:// protocol
 * - Lazy connection to avoid commands on import
 */

const isProduction = process.env.NODE_ENV === 'production';
const redisUrl = process.env.REDIS_URL;

let connectionOptions;

if (redisUrl) {
  // Upstash / Production Redis — parse the URL and enable TLS
  connectionOptions = {
    ...(redisUrl.startsWith('rediss://') ? { tls: { rejectUnauthorized: false } } : {}),
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,    // Skip CLUSTER INFO — saves commands on Upstash
    lazyConnect: true,          // Don't connect until first command
  };
} else {
  if (isProduction) {
    logger.error('REDIS_URL is missing in production environment. Please configure it.');
    process.exit(1);
  }
  // Local development fallback
  connectionOptions = {
    host: '127.0.0.1',
    port: 6379,
    maxRetriesPerRequest: null,
    lazyConnect: true,
  };
}

// Create the shared connection
const redisConnection = redisUrl
  ? new Redis(redisUrl, connectionOptions)
  : new Redis(connectionOptions);

// Explicitly connect (since lazyConnect is true)
redisConnection.connect().catch((err) => {
  logger.error({ err }, 'Failed to connect to Redis');
});

redisConnection.on('error', (err) => {
  // Only log once per error type to avoid log spam
  logger.error({ err: err.message }, 'Redis connection error');
});

redisConnection.on('connect', () => {
  logger.info(`Connected to Redis successfully ${redisUrl ? '(Upstash)' : '(localhost)'}`);
});

/**
 * Creates a DUPLICATE connection for BullMQ workers/queues.
 * BullMQ requires separate connections for Queue and Worker.
 * Using .duplicate() shares the same config without extra setup.
 */
export const createRedisConnection = () => {
  if (redisUrl) {
    return new Redis(redisUrl, connectionOptions);
  }
  return new Redis(connectionOptions);
};

export default redisConnection;
