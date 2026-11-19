import { randomUUID } from "node:crypto";
import path from "node:path";
import { Video, VIDEO_STATUS } from "../models/video.model.js";
import { storageService } from "../config/storage.js";
import {
  addVideoProcessingJob,
  getExistingProcessingJob,
} from "../queues/video.queue.js";
import { ApiError } from "../utils/ApiError.js";
import { config } from "../config/env.js";

class VideoService {
  async requestUpload({ userId, title, description, fileName, fileSize, mimeType }) {
    if (!userId) {
      throw new ApiError(401, "User authentication is required");
    }

    if (fileSize > config.storage.maxUploadSizeBytes) {
      throw new ApiError(
        400,
        `File size exceeds maximum allowed upload size of ${Math.round(
          config.storage.maxUploadSizeBytes / (1024 * 1024)
        )} MB`
      );
    }

    // Ensure container exists prior to upload
    await storageService.ensureContainerExists();

    // Generate unique server-side blob key
    const sanitizedFileName = fileName
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .toLowerCase();
    const blobKey = `raw/${userId}/${Date.now()}-${randomUUID()}-${sanitizedFileName}`;

    // Create MongoDB record in 'uploading' status
    const video = await Video.create({
      title,
      description,
      owner: userId,
      blobKey,
      originalFileName: fileName,
      fileSize,
      mimeType,
      status: VIDEO_STATUS.UPLOADING,
      isPublished: false,
    });

    // Generate short-lived SAS upload URL
    const sasData = await storageService.generateUploadSas({
      blobKey,
      contentType: mimeType,
      expiresInMinutes: config.storage.sasExpiryMinutes,
    });

    return {
      videoId: video._id,
      blobKey: video.blobKey,
      uploadUrl: sasData.uploadUrl,
      expiresOn: sasData.expiresOn,
      status: video.status,
      containerName: sasData.containerName,
      maxFileSizeBytes: config.storage.maxUploadSizeBytes,
    };
  }

  async completeUpload({ videoId, userId, _enqueueFn = addVideoProcessingJob }) {
    const video = await Video.findById(videoId);

    if (!video) {
      throw new ApiError(404, "Video not found");
    }

    // Enforce ownership
    if (video.owner.toString() !== userId.toString()) {
      throw new ApiError(403, "Forbidden: You do not have permission to complete upload for this video");
    }

    // Idempotency: if already processed, return cleanly
    if (video.status === VIDEO_STATUS.PROCESSED) {
      return {
        videoId: video._id,
        blobKey: video.blobKey,
        status: video.status,
        duration: video.duration,
        thumbnailKey: video.thumbnailKey,
        hlsKey: video.hlsKey,
        isIdempotent: true,
        message: `Video is already ${video.status}`,
      };
    }

    // If already in PROCESSING, check if a job is actively running/waiting in the queue
    if (video.status === VIDEO_STATUS.PROCESSING) {
      const existingJob = await getExistingProcessingJob(video._id.toString());
      if (existingJob) {
        return {
          videoId: video._id,
          blobKey: video.blobKey,
          status: video.status,
          duration: video.duration,
          thumbnailKey: video.thumbnailKey,
          hlsKey: video.hlsKey,
          jobId: existingJob.id,
          isIdempotent: true,
          message: `Video is already ${video.status} in processing queue`,
        };
      }
      // If marked as PROCESSING but no queue job exists, continue to re-verify and re-enqueue
    }

    // Verify blob existence in storage
    const exists = await storageService.blobExists(video.blobKey);
    if (!exists) {
      throw new ApiError(
        400,
        "Blob not found in storage. Please ensure direct block upload completed successfully before finalizing."
      );
    }

    // Verify actual size and properties
    const properties = await storageService.getBlobProperties(video.blobKey);
    if (!properties.contentLength || properties.contentLength === 0) {
      throw new ApiError(400, "Uploaded video blob is empty (0 bytes)");
    }

    if (properties.contentLength > config.storage.maxUploadSizeBytes) {
      throw new ApiError(
        400,
        `Uploaded blob size (${properties.contentLength} bytes) exceeds maximum allowed size (${config.storage.maxUploadSizeBytes} bytes)`
      );
    }

    // Update metadata from storage
    video.fileSize = properties.contentLength;
    if (properties.contentType) {
      video.mimeType = properties.contentType;
    }

    // Attempt enqueue — do NOT swallow errors or leave video stuck
    let job;
    try {
      job = await _enqueueFn({
        videoId: video._id.toString(),
        blobKey: video.blobKey,
        userId: userId.toString(),
      });

      video.status = VIDEO_STATUS.PROCESSING;
      video.failureReason = "";
      await video.save();
    } catch (queueError) {
      video.failureReason = `Enqueue failed: ${queueError.message}`;
      await video.save();

      throw new ApiError(
        503,
        `Video blob verified, but background processing queue is unavailable: ${queueError.message}. Please retry completion.`
      );
    }

    return {
      videoId: video._id,
      blobKey: video.blobKey,
      status: video.status,
      fileSize: video.fileSize,
      jobId: job?.id || `video-process-${video._id}`,
      isIdempotent: false,
      message: "Video upload verified and queued for background processing",
    };
  }

  async getVideoDetails(videoId) {
    const video = await Video.findById(videoId).populate("owner", "username fullName avatar");
    if (!video) {
      throw new ApiError(404, "Video not found");
    }
    return video;
  }

  /**
   * Authorize playback access.
   */
  _authorizePlayback(video, userId) {
    const isOwner =
      userId && video.owner && video.owner.toString() === userId.toString();
    if (!video.isPublished && !isOwner) {
      throw new ApiError(
        403,
        "Forbidden: This video is private and only accessible by the owner"
      );
    }
  }

  /**
   * Generate short-lived read access for HLS playback.
   * Ensures BOTH master playlist and all referenced segments are securely accessible.
   */
  async getPlaybackUrl({ videoId, userId, expiresInMinutes = 60 }) {
    const video = await Video.findById(videoId);
    if (!video) {
      throw new ApiError(404, "Video not found");
    }

    if (video.status !== VIDEO_STATUS.PROCESSED) {
      throw new ApiError(
        409,
        `Video is not ready for playback. Current status: ${video.status}`
      );
    }

    if (!video.hlsKey) {
      throw new ApiError(500, "HLS key is missing for processed video");
    }

    this._authorizePlayback(video, userId);

    // 1. Generate Container Read SAS (covers master playlist AND all relative .ts segments)
    const { sasToken, containerUrl } =
      await storageService.generateContainerReadSas({
        expiresInMinutes,
      });

    const masterPlaylistUrl = `${containerUrl}/${video.hlsKey}?${sasToken}`;
    const hlsDir = video.hlsKey.replace(/\/master\.m3u8$/, "");

    // 2. Discover and build pre-signed segment URLs for clients that require explicit absolute URLs
    let segmentUrls = [];
    try {
      const segmentBlobs = await storageService.listBlobsByPrefix(hlsDir);
      segmentUrls = segmentBlobs
        .filter((blobKey) => blobKey.endsWith(".ts"))
        .map((blobKey) => ({
          name: path.basename(blobKey),
          blobKey,
          url: `${containerUrl}/${blobKey}?${sasToken}`,
        }));
    } catch (e) {
      console.warn("Failed to list segments for explicit URLs:", e.message);
    }

    // 3. Generate thumbnail read URL
    let thumbnailUrl = null;
    if (video.thumbnailKey) {
      thumbnailUrl = `${containerUrl}/${video.thumbnailKey}?${sasToken}`;
    }

    return {
      videoId: video._id,
      status: video.status,
      title: video.title,
      duration: video.duration,
      hlsKey: video.hlsKey,
      hlsDir,
      masterPlaylistUrl,
      manifestUrl: `/api/v1/videos/${video._id}/manifest.m3u8`,
      containerSasToken: sasToken,
      segmentUrls,
      thumbnailUrl,
      expiresInMinutes,
    };
  }

  /**
   * Return the HLS master playlist with each segment reference pre-signed with SAS.
   */
  async getSignedManifest({ videoId, userId, expiresInMinutes = 60 }) {
    const video = await Video.findById(videoId);
    if (!video) {
      throw new ApiError(404, "Video not found");
    }

    if (video.status !== VIDEO_STATUS.PROCESSED || !video.hlsKey) {
      throw new ApiError(
        409,
        `Video is not ready for playback. Current status: ${video.status}`
      );
    }

    this._authorizePlayback(video, userId);

    const { sasToken } = await storageService.generateContainerReadSas({
      expiresInMinutes,
    });

    const rawManifestBuffer = await storageService.downloadBlobToBuffer(
      video.hlsKey
    );
    const rawManifest = rawManifestBuffer.toString("utf8");

    // Rewrite relative segment lines to include SAS token
    const rewritten = rawManifest
      .split("\n")
      .map((line) => {
        const trimmed = line.trim();
        if (trimmed.length > 0 && !trimmed.startsWith("#") && trimmed.endsWith(".ts")) {
          return `${trimmed}?${sasToken}`;
        }
        return line;
      })
      .join("\n");

    return rewritten;
  }
}

export const videoService = new VideoService();
export default videoService;

