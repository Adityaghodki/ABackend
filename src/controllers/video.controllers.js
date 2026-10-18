import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Video } from "../models/video.model.js";
import { getPagination } from "../utils/pagination.js";
import { cacheManager } from "../utils/cache.js";

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

export { getAllVideos };
