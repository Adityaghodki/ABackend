import { config } from "./config/env.js";
import connectDB from "./db/index.js";
import { app } from "./app.js";
import redis from "./config/redis.js";

const shutdown = async (signal) => {
  console.log(`${signal} received. Shutting down...`);

  try {
    await redis.quit();
  } catch (error) {
    console.error("Redis shutdown error:", error.message);
  }

  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

connectDB().then(() => {
  app.listen(config.port, () => {
    console.log(`⚙️ Server is running at port : ${config.port}`);
  });
});
