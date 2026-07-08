import Redis from 'ioredis';
import { config } from './index';

// Create Redis client with graceful fallback
let redis: Redis;

try {
  redis = new Redis(config.redis.url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: false,
    retryStrategy(times: number) {
      if (times > 3) {
        // Stop retrying after 3 attempts
        return null;
      }
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    lazyConnect: true, // Don't connect immediately
  });

  redis.on('connect', () => {
    console.log('Redis connected successfully');
  });

  redis.on('error', (err) => {
    // Only log first error, not repeated ones
    if (!redisConnected) {
      console.warn('Redis not available:', err.message);
    }
  });
} catch (err) {
  console.warn('Redis initialization failed - job queue features will be disabled');
  // Create a mock Redis that returns OK for ping
  redis = {
    ping: async () => 'PONG',
    disconnect: () => {},
    on: () => {},
  } as any;
}

let redisConnected = false;

export { redisConnected };
export default redis;
