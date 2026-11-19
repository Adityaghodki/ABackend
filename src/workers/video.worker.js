import { Worker } from "bullmq";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "../config/env.js";
import { redisConnectionOptions } from "../config/redis.js";
import { storageService } from "../config/storage.js";
import { Video, VIDEO_STATUS } from "../models/video.model.js";
import { getFfmpegPath, getFfprobePath } from "../utils/mediaTools.js";
import connectDB from "../db/index.js";

const execFileAsync = promisify(execFile);

/**
 * Execute ffprobe to validate media and extract metadata
 */
export const probeMedia = async (filePath) => {
  const ffprobePath = getFfprobePath();
  const args = [
    "-v",
    "error",
    "-show_entries",
    "format=duration,size,bit_rate:stream=codec_type,codec_name,width,height,duration",
    "-of",
    "json",
    filePath,
  ];

  const { stdout } = await execFileAsync(ffprobePath, args);
  const metadata = JSON.parse(stdout);

  const streams = metadata.streams || [];
  const videoStream = streams.find((s) => s.codec_type === "video");

  if (!videoStream) {
    throw new Error("Invalid media: File contains no valid video stream");
  }

  const rawDuration =
    metadata.format?.duration || videoStream.duration || 0;
  const duration = Math.max(1, Math.round(Number(rawDuration)));

  return {
    duration,
    width: videoStream.width,
    height: videoStream.height,
    codec: videoStream.codec_name,
    format: metadata.format?.format_name,
  };
};

/**
 * Generate a thumbnail JPG using ffmpeg
 */
export const generateThumbnail = async (inputPath, outputPath, duration) => {
  const ffmpegPath = getFfmpegPath();
  // Seek to 10% of video or 1 second in, capped at 10s
  const seekTime = Math.min(Math.max(1, Math.floor(duration * 0.1)), 10);

  const args = [
    "-y",
    "-ss",
    String(seekTime),
    "-i",
    inputPath,
    "-vframes",
    "1",
    "-q:v",
    "2",
    "-vf",
    "scale=640:-1",
    outputPath,
  ];

  await execFileAsync(ffmpegPath, args);

  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
    throw new Error("Thumbnail generation failed: Output file missing or empty");
  }
};

/**
 * Generate HLS master playlist and .ts segments using ffmpeg
 */
export const generateHls = async (inputPath, outputDir) => {
  const ffmpegPath = getFfmpegPath();
  const playlistPath = path.join(outputDir, "master.m3u8");
  const segmentPattern = path.join(outputDir, "segment_%03d.ts");

  const args = [
    "-y",
    "-i",
    inputPath,
    "-preset",
    "veryfast",
    "-g",
    "48",
    "-sc_threshold",
    "0",
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?", // Audio is optional
    "-c:v",
    "libx264",
    "-crf",
    "23",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ac",
    "2",
    "-f",
    "hls",
    "-hls_time",
    "6",
    "-hls_playlist_type",
    "vod",
    "-hls_segment_filename",
    segmentPattern,
    playlistPath,
  ];

  await execFileAsync(ffmpegPath, args);

  if (!fs.existsSync(playlistPath) || fs.statSync(playlistPath).size === 0) {
    throw new Error("HLS generation failed: master.m3u8 was not generated");
  }

  const generatedFiles = fs.readdirSync(outputDir);
  const segments = generatedFiles.filter((f) => f.endsWith(".ts"));

  if (segments.length === 0) {
    throw new Error("HLS generation failed: No .ts segment files created");
  }

  return {
    playlistPath,
    segments,
    allFiles: generatedFiles,
  };
};

/**
 * Core job processing workflow
 */
export const processVideoJob = async (job) => {
  const { videoId, blobKey, userId } = job.data;
  console.log(`[Worker] Started processing video ${videoId} (job ${job.id})`);

  const video = await Video.findById(videoId);
  if (!video) {
    throw new Error(`Video with id ${videoId} not found in database`);
  }

  // Ensure state is processing
  if (video.status !== VIDEO_STATUS.PROCESSING) {
    video.status = VIDEO_STATUS.PROCESSING;
    await video.save();
  }

  // Isolated temporary directory for this job
  const tempDir = path.join(
    os.tmpdir(),
    "backend_video_worker",
    `job-${job.id}-${Date.now()}`
  );
  fs.mkdirSync(tempDir, { recursive: true });

  const hlsDir = path.join(tempDir, "hls");
  fs.mkdirSync(hlsDir, { recursive: true });

  try {
    // 1. Download original blob via stream to avoid high memory usage
    const ext = path.extname(blobKey) || ".mp4";
    const localOriginalPath = path.join(tempDir, `original${ext}`);
    console.log(`[Worker] Downloading blob ${blobKey} to ${localOriginalPath}...`);
    await storageService.downloadBlobToFile(blobKey, localOriginalPath);

    if (!fs.existsSync(localOriginalPath) || fs.statSync(localOriginalPath).size === 0) {
      throw new Error("Downloaded original video file is empty or missing");
    }

    // 2. Validate media with ffprobe
    console.log(`[Worker] Running ffprobe validation on ${localOriginalPath}...`);
    const mediaInfo = await probeMedia(localOriginalPath);
    console.log(
      `[Worker] Video validated: duration=${mediaInfo.duration}s, resolution=${mediaInfo.width}x${mediaInfo.height}, codec=${mediaInfo.codec}`
    );

    // 3. Generate thumbnail
    const thumbnailPath = path.join(tempDir, "thumbnail.jpg");
    console.log(`[Worker] Generating thumbnail at ${thumbnailPath}...`);
    await generateThumbnail(localOriginalPath, thumbnailPath, mediaInfo.duration);

    // 4. Generate HLS playlist and segments
    console.log(`[Worker] Generating HLS segments at ${hlsDir}...`);
    const hlsResult = await generateHls(localOriginalPath, hlsDir);
    console.log(
      `[Worker] HLS generated: ${hlsResult.segments.length} segments and master.m3u8`
    );

    // 5. Upload derivatives to Storage
    const derivativeBase = `derivatives/${video.owner || userId}/${video._id}`;
    const destinationThumbnailKey = `${derivativeBase}/thumbnail.jpg`;
    const destinationHlsMasterKey = `${derivativeBase}/hls/master.m3u8`;

    console.log(`[Worker] Uploading thumbnail to ${destinationThumbnailKey}...`);
    await storageService.uploadFileToBlob(
      thumbnailPath,
      destinationThumbnailKey,
      "image/jpeg"
    );

    console.log(`[Worker] Uploading HLS files to ${derivativeBase}/hls/...`);
    for (const file of hlsResult.allFiles) {
      const filePath = path.join(hlsDir, file);
      const fileBlobKey = `${derivativeBase}/hls/${file}`;
      const contentType = file.endsWith(".m3u8")
        ? "application/vnd.apple.mpegurl"
        : "video/MP2T";

      await storageService.uploadFileToBlob(filePath, fileBlobKey, contentType);
    }

    // 6. Verify derivative existence in storage
    const thumbExists = await storageService.blobExists(destinationThumbnailKey);
    const hlsExists = await storageService.blobExists(destinationHlsMasterKey);

    if (!thumbExists || !hlsExists) {
      throw new Error("Derivative storage verification failed: uploaded files missing");
    }

    // 7. Update MongoDB and mark processed
    video.thumbnailKey = destinationThumbnailKey;
    video.thumbnail = destinationThumbnailKey;
    video.hlsKey = destinationHlsMasterKey;
    video.videoFile = destinationHlsMasterKey;
    video.duration = mediaInfo.duration;
    video.status = VIDEO_STATUS.PROCESSED;
    video.isPublished = true;
    video.failureReason = "";
    await video.save();

    console.log(`[Worker] Video ${videoId} successfully processed!`);
    return {
      videoId,
      status: VIDEO_STATUS.PROCESSED,
      duration: mediaInfo.duration,
      thumbnailKey: destinationThumbnailKey,
      hlsKey: destinationHlsMasterKey,
    };
  } finally {
    // 8. Clean up all temporary files on success AND failure
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        console.log(`[Worker] Cleaned up temporary directory: ${tempDir}`);
      }
    } catch (cleanupError) {
      console.warn(
        `[Worker] Failed to clean temp dir ${tempDir}:`,
        cleanupError.message
      );
    }
  }
};

/**
 * Handle worker failure status updates
 */
export const handleWorkerFailure = async (job, error) => {
  if (!job?.data?.videoId) return;

  const maxAttempts = job.opts?.attempts || 3;
  const isFinalAttempt = job.attemptsMade >= maxAttempts;

  console.error(
    `[Worker] Job ${job.id} for video ${job.data.videoId} failed (attempt ${job.attemptsMade}/${maxAttempts}): ${error.message}`
  );

  if (isFinalAttempt) {
    try {
      const video = await Video.findById(job.data.videoId);
      if (video) {
        video.status = VIDEO_STATUS.FAILED;
        video.failureReason = error.message;
        await video.save();
        console.log(
          `[Worker] Marked video ${video._id} as ${VIDEO_STATUS.FAILED} after ${job.attemptsMade} failed attempts`
        );
      }
    } catch (dbError) {
      console.error(
        `[Worker] Failed to mark video status as failed in database:`,
        dbError.message
      );
    }
  }
};

/**
 * Create and export BullMQ Worker instance
 */
export const createVideoWorker = () => {
  const worker = new Worker(config.queue.videoQueueName, processVideoJob, {
    connection: redisConnectionOptions,
    concurrency: config.queue.concurrency,
  });

  worker.on("completed", (job) => {
    console.log(`[Worker] Job ${job.id} completed successfully`);
  });

  worker.on("failed", (job, err) => {
    handleWorkerFailure(job, err);
  });

  worker.on("error", (err) => {
    console.error("[Worker] Worker level error:", err.message);
  });

  return worker;
};

/**
 * Standalone entry point
 */
export const startWorker = async () => {
  console.log("Starting independent Video Processing Worker...");
  await connectDB();
  const worker = createVideoWorker();
  console.log(
    `Video Worker is listening for jobs on queue "${config.queue.videoQueueName}" with concurrency ${config.queue.concurrency}`
  );

  const shutdown = async (signal) => {
    console.log(`[Worker] Received ${signal}. Closing worker...`);
    try {
      await worker.close();
    } catch (err) {
      console.error("[Worker] Error closing worker:", err.message);
    }
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  return worker;
};

// If run directly from CLI
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, "$1"))
) {
  startWorker().catch((err) => {
    console.error("Worker fatal startup error:", err);
    process.exit(1);
  });
}

