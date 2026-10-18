import { Router } from "express";
import { getAllVideos } from "../controllers/video.controllers.js";
import { rateLimiter } from "../middlewares/rateLimiter.middleware.js";

const router = Router();

const publicVideoLimiter = rateLimiter({
  windowMs: 60_000,
  maxRequests: 100,
  keyPrefix: "public-videos",
  failClosed: false,
});

router.route("/").get(publicVideoLimiter, getAllVideos);

export default router;
