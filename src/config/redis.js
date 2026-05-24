import { Redis } from 'ioredis';
import { env } from './env.js';

// We fallback to localhost:6379 if REDIS_URL is not provided
const redisUrl = env.REDIS_URL || 'redis://localhost:6379';

// Main Redis connection for data/state
export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

// Redis connections for Socket.io Adapter (pub and sub must be separate)
export const pubClient = new Redis(redisUrl);
export const subClient = pubClient.duplicate();

redis.on('connect', () => {
  console.log('✅ Connected to Redis');
});

redis.on('error', (err) => {
  console.error('❌ Redis connection error:', err);
});
