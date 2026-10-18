import { randomUUID } from "node:crypto";
import redis from "../config/redis.js";

const SLIDING_WINDOW_SCRIPT = `
  local key = KEYS[1]
  local now = tonumber(ARGV[1])
  local windowMs = tonumber(ARGV[2])
  local maxRequests = tonumber(ARGV[3])
  local member = ARGV[4]

  redis.call("ZREMRANGEBYSCORE", key, "-inf", now - windowMs)
  redis.call("ZADD", key, now, member)

  local count = redis.call("ZCARD", key)
  local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")

  redis.call("PEXPIRE", key, windowMs)

  return {count, tonumber(oldest[2])}
`;

export const rateLimiter = ({
  windowMs = 60_000,
  maxRequests = 100,
  keyPrefix = "global",
  failClosed = false,
} = {}) => {
  if (
    !Number.isSafeInteger(windowMs) ||
    windowMs <= 0 ||
    !Number.isSafeInteger(maxRequests) ||
    maxRequests <= 0
  ) {
    throw new Error("Invalid rate limiter configuration");
  }

  return async (req, res, next) => {
    const userId = req.user?.id ?? req.user?._id;
    const identity = userId ? `user:${String(userId)}` : `ip:${req.ip}`;

    const key = `rate_limit:${keyPrefix}:${identity}`;
    const now = Date.now();
    const member = `${now}:${randomUUID()}`;

    try {
      const result = await redis.eval(
        SLIDING_WINDOW_SCRIPT,
        1,
        key,
        now,
        windowMs,
        maxRequests,
        member
      );

      const count = Number(result[0]);
      const oldestTimestamp = Number(result[1]);

      res.setHeader("X-RateLimit-Limit", String(maxRequests));
      res.setHeader(
        "X-RateLimit-Remaining",
        String(Math.max(0, maxRequests - count))
      );

      if (count > maxRequests) {
        const retryAfter = Math.max(
          1,
          Math.ceil((oldestTimestamp + windowMs - now) / 1000)
        );

        res.setHeader("Retry-After", String(retryAfter));

        return res.status(429).json({
          success: false,
          message: "Too many requests. Please try again later.",
        });
      }

      return next();
    } catch (error) {
      console.error(`Rate limiter failed (${keyPrefix}):`, error.message);

      if (failClosed) {
        return res.status(503).json({
          success: false,
          message: "Request protection is temporarily unavailable.",
        });
      }

      return next();
    }
  };
};
