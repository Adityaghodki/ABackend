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
  cookieOptions: {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
  },
};
