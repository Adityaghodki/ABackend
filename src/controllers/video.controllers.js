import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Video } from "../models/video.model.js";
import { getPagination } from "../utils/pagination.js";

const getAllVideos = asyncHandler(async (req, res) => {
  const { page, limit } = getPagination(req.query);

  const aggregate = Video.aggregate([
    { $match: { isPublished: true } },
    { $sort: { createdAt: -1 } },
  ]);

  const result = await Video.aggregatePaginate(aggregate, { page, limit });

  return res
    .status(200)
    .json(new ApiResponse(200, result, "Videos fetched successfully"));
});

export { getAllVideos };
