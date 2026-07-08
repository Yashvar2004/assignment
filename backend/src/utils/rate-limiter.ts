import Redis from 'ioredis';
import { config } from '../config';
import logger from './logger';
import { sleep } from './retry';

/**
 * Token bucket rate limiter using Redis.
 * Respects HubSpot's rate limits: 100 requests per 10 seconds per portal.
 */
export class RateLimiter {
  private redis: Redis;
  private maxRequests: number;
  private windowMs: number;
  private keyPrefix: string;

  constructor(redis: Redis, options?: { maxRequests?: number; windowMs?: number }) {
    this.redis = redis;
    this.maxRequests = options?.maxRequests || config.sync.rateLimitRequests;
    this.windowMs = options?.windowMs || config.sync.rateLimitWindow;
    this.keyPrefix = 'ratelimit:';
  }

  /**
   * Wait until a request can be made within rate limits.
   * Blocks until a slot is available.
   */
  async waitForSlot(portalId: string): Promise<void> {
    const key = `${this.keyPrefix}${portalId}`;

    while (true) {
      const now = Date.now();
      const windowStart = now - this.windowMs;

      // Use Redis pipeline for atomic operations
      const pipeline = this.redis.pipeline();

      // Remove expired entries
      pipeline.zremrangebyscore(key, 0, windowStart);

      // Count current requests in window
      pipeline.zcard(key);

      // Add current request timestamp
      pipeline.zadd(key, now, `${now}:${Math.random()}`);

      // Set expiry on the key
      pipeline.expire(key, Math.ceil(this.windowMs / 1000));

      const results = await pipeline.exec();
      const currentCount = (results?.[1]?.[1] as number) || 0;

      if (currentCount < this.maxRequests) {
        // Slot available, proceed
        return;
      }

      // Need to wait - calculate how long
      const oldestInWindow = await this.redis.zrange(key, 0, 0, 'WITHSCORES');
      if (oldestInWindow.length >= 2) {
        const oldestTimestamp = parseInt(oldestInWindow[1], 10);
        const waitTime = oldestTimestamp + this.windowMs - now + 100; // Add 100ms buffer

        if (waitTime > 0) {
          logger.debug(`Rate limit reached for portal ${portalId}, waiting ${waitTime}ms`);
          await sleep(waitTime);
        }
      } else {
        // Safety fallback
        await sleep(1000);
      }

      // Remove the request we added since we're going to wait and retry
      await this.redis.zremrangebyscore(key, now, now);
    }
  }

  /**
   * Get current request count for a portal
   */
  async getCurrentCount(portalId: string): Promise<number> {
    const key = `${this.keyPrefix}${portalId}`;
    const now = Date.now();
    const windowStart = now - this.windowMs;

    await this.redis.zremrangebyscore(key, 0, windowStart);
    return this.redis.zcard(key);
  }

  /**
   * Reset rate limit state for a portal
   */
  async reset(portalId: string): Promise<void> {
    const key = `${this.keyPrefix}${portalId}`;
    await this.redis.del(key);
  }
}

export default RateLimiter;
