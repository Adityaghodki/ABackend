import Redis from "ioredis";
import { config } from "./env.js";

const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  tls: config.redis.tls ? {} : undefined,
  enableOfflineQueue: false,
  commandTimeout: 1000,
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

redis.on("connect", () => {
  console.log("Redis connection established");
});

redis.on("ready", () => {
  console.log("Redis is ready");
});

redis.on("error", (error) => {
  console.error("Redis error:", error.message);
});

redis.on("end", () => {
  console.warn("Redis connection closed");
});

export default redis;
