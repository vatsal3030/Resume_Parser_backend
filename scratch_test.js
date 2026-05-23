import Redis from 'ioredis';

const redisUrl = '"rediss://default:gQAAAAAAAWX5AAIgcDE2NDMxOGI4YmE5MzI0ZGI1YTEyMWVjOTg1ZTc1ODYwYg@diverse-tadpole-91641.upstash.io:6379"';

try {
  const redis = new Redis(redisUrl, { lazyConnect: true });
  redis.connect().catch(e => console.error("Connect error:", e.message));
} catch (e) {
  console.error("Init error:", e.message);
}
