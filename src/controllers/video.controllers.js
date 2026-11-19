import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Video } from "../models/video.model.js";
import { getPagination } from "../utils/pagination.js";
import { cacheManager } from "../utils/cache.js";
import { videoService } from "../services/video.service.js";

const PUBLIC_VIDEOS_CACHE_TTL_SECONDS = 60;

const getAllVideos = asyncHandler(async (req, res) => {
  const { page, limit } = getPagination(req.query);
  const cacheKey = `videos:public:${page}:${limit}`;

  let result = await cacheManager.get(cacheKey);

  if (result === null) {
    const aggregate = Video.aggregate([
      { $match: { isPublished: true } },
      { $sort: { createdAt: -1 } },
    ]);

    result = await Video.aggregatePaginate(aggregate, { page, limit });
    await cacheManager.set(cacheKey, result, PUBLIC_VIDEOS_CACHE_TTL_SECONDS);
  }

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Videos fetched successfully"));
});

const requestVideoUpload = asyncHandler(async (req, res) => {
  const payload = req.validatedBody || req.body;
  const userId = req.user?._id;

  const result = await videoService.requestUpload({
    userId,
    title: payload.title,
    description: payload.description,
    fileName: payload.fileName,
    fileSize: payload.fileSize,
    mimeType: payload.mimeType,
  });

  return res
    .status(201)
    .json(new ApiResponse(201, result, "Upload SAS URL generated successfully"));
});

const completeVideoUpload = asyncHandler(async (req, res) => {
  const payload = req.validatedBody || req.body;
  const userId = req.user?._id;

  const result = await videoService.completeUpload({
    videoId: payload.videoId,
    userId,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, result, result.message));
});

const getVideoById = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const video = await videoService.getVideoDetails(videoId);

  return res
    .status(200)
    .json(new ApiResponse(200, video, "Video fetched successfully"));
});

const getVideoStream = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const userId = req.user?._id;

  // expiresInMinutes: allow client to request custom expiry (capped at 120 min)
  const rawExpiry = parseInt(req.query.expiresInMinutes, 10);
  const expiresInMinutes = !isNaN(rawExpiry) && rawExpiry > 0 && rawExpiry <= 120
    ? rawExpiry
    : 60;

  const result = await videoService.getPlaybackUrl({ videoId, userId, expiresInMinutes });

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Playback URL generated successfully"));
});

const getVideoManifest = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const userId = req.user?._id;

  const rawExpiry = parseInt(req.query.expiresInMinutes, 10);
  const expiresInMinutes =
    !isNaN(rawExpiry) && rawExpiry > 0 && rawExpiry <= 120 ? rawExpiry : 60;

  const manifest = await videoService.getSignedManifest({
    videoId,
    userId,
    expiresInMinutes,
  });

  res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  return res.status(200).send(manifest);
});

export {
  getAllVideos,
  requestVideoUpload,
  completeVideoUpload,
  getVideoById,
  getVideoStream,
  getVideoManifest,
};
