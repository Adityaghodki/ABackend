import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";
import { config } from "../config/env.js";

const CONNECT_OPTIONS = {
  maxPoolSize: 10,
  minPoolSize: 2,
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 10000,
  socketTimeoutMS: 45000,
};

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 2000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const connectDB = async () => {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const connectionInstance = await mongoose.connect(
        `${config.mongodbUrl}/${DB_NAME}`,
        CONNECT_OPTIONS
      );

      console.log(
        `\n MongoDB connected !! DB HOST: ${connectionInstance.connection.host}`
      );

      mongoose.connection.on("disconnected", () => {
        console.warn("MongoDB disconnected. Driver will attempt to reconnect.");
      });
      mongoose.connection.on("error", (error) => {
        console.error("MongoDB runtime error:", error.message);
      });

      return connectionInstance;
    } catch (error) {
      const isLastAttempt = attempt === MAX_RETRIES;
      console.error(
        `MONGODB connection FAILED (attempt ${attempt}/${MAX_RETRIES}): ${error.message}`
      );

      if (isLastAttempt) {
        console.error("MONGODB connection failed after all retries. Exiting.");
        process.exit(1);
      }

      await sleep(RETRY_DELAY_MS * attempt);
    }
  }
};

export default connectDB;
