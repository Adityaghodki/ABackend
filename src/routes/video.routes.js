import { Router } from "express";
import {
  getAllVideos,
  requestVideoUpload,
  completeVideoUpload,
  getVideoById,
  getVideoStream,
  getVideoManifest,
} from "../controllers/video.controllers.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.js";
import {
  createUploadRequestSchema,
  uploadCompleteSchema,
} from "../validators/video.validators.js";
import { rateLimiter } from "../middlewares/rateLimiter.middleware.js";
import { config } from "../config/env.js";

const router = Router();

const publicVideoLimiter = rateLimiter({
  windowMs: 60_000,
  maxRequests: 100,
  keyPrefix: "public-videos",
  failClosed: false,
});

const uploadRequestLimiter = rateLimiter({
  windowMs: 60_000,
  maxRequests: 20,
  keyPrefix: "video-upload-request",
  failClosed: true,
});

const uploadCompleteLimiter = rateLimiter({
  windowMs: 60_000,
  maxRequests: 30,
  keyPrefix: "video-upload-complete",
  failClosed: true,
});

const streamLimiter = rateLimiter({
  windowMs: 60_000,
  maxRequests: 60,
  keyPrefix: "video-stream",
  failClosed: false, // Allow playback even if Redis is down
});

const uploadRequestSchema = createUploadRequestSchema(
  config.storage.maxUploadSizeBytes
);

// Public route
router.route("/").get(publicVideoLimiter, getAllVideos);

// Secure routes for upload lifecycle
router
  .route("/upload/request")
  .post(
    verifyJWT,
    uploadRequestLimiter,
    validate(uploadRequestSchema),
    requestVideoUpload
  );

router
  .route("/upload/complete")
  .post(
    verifyJWT,
    uploadCompleteLimiter,
    validate(uploadCompleteSchema),
    completeVideoUpload
  );

// HLS playback endpoint — returns short-lived read SAS URL for master.m3u8
// Auth required: only authenticated users can get playback URLs
router
  .route("/:videoId/stream")
  .get(verifyJWT, streamLimiter, getVideoStream);

// HLS dynamic signed manifest endpoint — returns master.m3u8 with signed segments
router
  .route("/:videoId/manifest.m3u8")
  .get(verifyJWT, streamLimiter, getVideoManifest);

// Video detail lookup (public)
router.route("/:videoId").get(getVideoById);

export default router;
