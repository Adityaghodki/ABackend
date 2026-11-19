import dotenv from "dotenv";

dotenv.config({
  path: "./.env",
});

const requiredEnvVars = [
  "MONGODB_URL",
  "ACCESS_TOKEN_SECRET",
  "ACCESS_TOKEN_EXPIRY",
  "REFRESH_TOKEN_SECRET",
  "REFRESH_TOKEN_EXPIRY",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "CORS_ORIGIN",
];

const missing = requiredEnvVars.filter((name) => !process.env[name]?.trim());

if (missing.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missing.join(", ")}`
  );
}

const isProduction = process.env.NODE_ENV === "production";

const parseIntegerInRange = (raw, fallback, name, min, max) => {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(
      `Invalid environment variable ${name}: expected an integer between ${min} and ${max}, received "${raw}"`
    );
  }

  return value;
};

const parseBoolean = (raw, fallback, name) => {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  if (raw === "true") return true;
  if (raw === "false") return false;

  throw new Error(
    `Invalid environment variable ${name}: expected "true" or "false", received "${raw}"`
  );
};

export const config = {
  port: process.env.PORT || 8000,
  mongodbUrl: process.env.MONGODB_URL,
  corsOrigin: process.env.CORS_ORIGIN,
  isProduction,
  accessTokenSecret: process.env.ACCESS_TOKEN_SECRET,
  accessTokenExpiry: process.env.ACCESS_TOKEN_EXPIRY,
  refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET,
  refreshTokenExpiry: process.env.REFRESH_TOKEN_EXPIRY,
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
  redis: {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: parseIntegerInRange(process.env.REDIS_PORT, 6379, "REDIS_PORT", 1, 65535),
    password: process.env.REDIS_PASSWORD || undefined,
    tls: parseBoolean(process.env.REDIS_TLS, false, "REDIS_TLS"),
  },
  storage: {
    provider: (process.env.STORAGE_PROVIDER || "azurite").toLowerCase(),
    accountName: process.env.AZURE_STORAGE_ACCOUNT_NAME || "devstoreaccount1",
    accountKey:
      process.env.AZURE_STORAGE_ACCOUNT_KEY ||
      "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==",
    containerName: process.env.AZURE_STORAGE_CONTAINER_NAME || "videos",
    azuriteHost: process.env.AZURITE_HOST || "127.0.0.1",
    azuritePort: parseIntegerInRange(process.env.AZURITE_PORT, 10000, "AZURITE_PORT", 1, 65535),
    connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING || undefined,
    maxUploadSizeBytes: parseIntegerInRange(
      process.env.MAX_VIDEO_UPLOAD_SIZE_BYTES,
      500 * 1024 * 1024,
      "MAX_VIDEO_UPLOAD_SIZE_BYTES",
      1024,
      5 * 1024 * 1024 * 1024
    ),
    sasExpiryMinutes: parseIntegerInRange(
      process.env.SAS_EXPIRY_MINUTES,
      15,
      "SAS_EXPIRY_MINUTES",
      1,
      1440
    ),
  },
  queue: {
    videoQueueName: process.env.VIDEO_QUEUE_NAME || "video-processing",
    concurrency: parseIntegerInRange(process.env.WORKER_CONCURRENCY, 2, "WORKER_CONCURRENCY", 1, 10),
  },
  cookieOptions: {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
  },
};
