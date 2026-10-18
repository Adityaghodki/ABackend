import redis from "../config/redis.js";

const SCAN_COUNT = 100;
const UNLINK_BATCH_SIZE = 100;

export const cacheManager = {
  async get(key) {
    try {
      const raw = await redis.get(key);

      if (raw === null || raw === undefined) {
        return null;
      }

      return JSON.parse(raw);
    } catch (error) {
      console.error(`Cache read failed (${key}):`, error.message);
      return null;
    }
  },

  async set(key, value, ttlSeconds) {
    try {
      if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) {
        throw new Error(`Invalid TTL: expected a positive integer, received "${ttlSeconds}"`);
      }

      await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
      return true;
    } catch (error) {
      console.error(`Cache write failed (${key}):`, error.message);
      return false;
    }
  },

  async invalidate(pattern) {
    if (typeof pattern !== "string" || pattern.length === 0) {
      console.error("Cache invalidation skipped: pattern must be a non-empty string");
      return 0;
    }

    let deleted = 0;
    const batch = [];

    const flushBatch = async () => {
      if (batch.length === 0) return;

      const keys = batch.splice(0, batch.length);

      try {
        deleted += await redis.unlink(...keys);
      } catch (error) {
        console.error(`Cache invalidation batch failed (${pattern}):`, error.message);
      }
    };

    try {
      const stream = redis.scanStream({ match: pattern, count: SCAN_COUNT });

      for await (const keys of stream) {
        batch.push(...keys);

        if (batch.length >= UNLINK_BATCH_SIZE) {
          await flushBatch();
        }
      }

      await flushBatch();
    } catch (error) {
      console.error(`Cache invalidation failed (${pattern}):`, error.message);
    }

    return deleted;
  },
};
