import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { startAzurite, stopAzurite } from "./fixtures/azuriteHelper.js";
import { createSampleVideo } from "./fixtures/sampleVideo.js";
import { storageService } from "../src/config/storage.js";
import {
  getFfmpegPath,
  getFfprobePath,
} from "../src/utils/mediaTools.js";
import {
  probeMedia,
  generateThumbnail,
  generateHls,
  processVideoJob,
  handleWorkerFailure,
} from "../src/workers/video.worker.js";
import { closeVideoQueue } from "../src/queues/video.queue.js";
import { Video, VIDEO_STATUS } from "../src/models/video.model.js";
import connectDB from "../src/db/index.js";
import redis from "../src/config/redis.js";
import mongoose from "mongoose";

test("Day 5: Video Processing Workflow & Worker Suite", async (t) => {
  let sampleVideoPath = null;
  let testUserId = new mongoose.Types.ObjectId();

  t.before(async () => {
    // Disconnect default redis client to prevent reconnect retry loops during isolated worker testing
    try {
      redis.disconnect();
    } catch (e) {}

    // 1+2. Start Azurite and connect to MongoDB Atlas in parallel (both are slow cold-starts)
    await Promise.all([
      startAzurite(10042, "127.0.0.1"),
      connectDB(),
    ]);

    // 3. Set Azurite storage provider and ensure container exists
    storageService.setProvider("azurite");
    await storageService.ensureContainerExists();

    // 4. Generate a real sample test video using ffmpeg
    sampleVideoPath = await createSampleVideo(3);
    assert.ok(fs.existsSync(sampleVideoPath), "Sample video must be generated");
  });

  t.after(async () => {
    // Clean up sample video and stop azurite
    if (sampleVideoPath && fs.existsSync(sampleVideoPath)) {
      try {
        fs.unlinkSync(sampleVideoPath);
      } catch (e) {}
    }
    await stopAzurite();
    await closeVideoQueue();
    await mongoose.connection.close();
  });

  await t.test("1. Media tools executable resolution", async () => {
    const ffmpegPath = getFfmpegPath();
    const ffprobePath = getFfprobePath();

    assert.ok(ffmpegPath, "ffmpeg path must be resolved");
    assert.ok(ffprobePath, "ffprobe path must be resolved");
  });

  await t.test("2. Media probing with ffprobe on valid video", async () => {
    const mediaInfo = await probeMedia(sampleVideoPath);

    assert.ok(mediaInfo.duration >= 2, `Duration should be ~3s, received ${mediaInfo.duration}`);
    assert.equal(mediaInfo.width, 320);
    assert.equal(mediaInfo.height, 240);
    assert.equal(mediaInfo.codec, "h264");
  });

  await t.test("3. Media probing rejection on non-video file", async () => {
    const dummyTextFile = path.join(os.tmpdir(), `dummy-${Date.now()}.txt`);
    fs.writeFileSync(dummyTextFile, "This is not a video file");

    try {
      await assert.rejects(
        async () => {
          await probeMedia(dummyTextFile);
        },
        /invalid media|no valid video stream|invalid data|no such file|error/i
      );
    } finally {
      if (fs.existsSync(dummyTextFile)) fs.unlinkSync(dummyTextFile);
    }
  });

  await t.test("4. Thumbnail generation via FFmpeg", async () => {
    const thumbPath = path.join(os.tmpdir(), `test-thumb-${Date.now()}.jpg`);

    try {
      await generateThumbnail(sampleVideoPath, thumbPath, 3);
      assert.ok(fs.existsSync(thumbPath), "Thumbnail file must exist");
      const stat = fs.statSync(thumbPath);
      assert.ok(stat.size > 0, "Thumbnail size must be greater than 0");
    } finally {
      if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
    }
  });

  await t.test("5. HLS master playlist and segment generation via FFmpeg", async () => {
    const hlsDir = path.join(os.tmpdir(), `test-hls-${Date.now()}`);
    fs.mkdirSync(hlsDir, { recursive: true });

    try {
      const hlsResult = await generateHls(sampleVideoPath, hlsDir);
      assert.ok(fs.existsSync(hlsResult.playlistPath), "master.m3u8 must exist");
      assert.ok(hlsResult.segments.length > 0, "At least one .ts segment must exist");

      // Verify playlist contains segment references
      const playlistContent = fs.readFileSync(hlsResult.playlistPath, "utf8");
      assert.ok(playlistContent.includes("#EXTM3U"));
      assert.ok(playlistContent.includes(".ts"));
    } finally {
      if (fs.existsSync(hlsDir)) {
        fs.rmSync(hlsDir, { recursive: true, force: true });
      }
    }
  });

  await t.test("6. End-to-End Worker Processing Workflow with Azurite and MongoDB", async () => {
    // A. Upload sample video to Azurite under raw/
    const blobKey = `raw/${testUserId}/${Date.now()}-sample.mp4`;
    await storageService.uploadFileToBlob(sampleVideoPath, blobKey, "video/mp4");
    assert.equal(await storageService.blobExists(blobKey), true);

    // B. Create initial MongoDB Video record in 'uploading' status
    const video = await Video.create({
      title: "Integration Test Video",
      description: "Testing end to end video processing pipeline",
      owner: testUserId,
      blobKey,
      fileSize: fs.statSync(sampleVideoPath).size,
      mimeType: "video/mp4",
      status: VIDEO_STATUS.UPLOADING,
    });
    assert.equal(video.status, VIDEO_STATUS.UPLOADING);

    // C. Execute Worker Job Processing
    const mockJob = {
      id: `test-job-${video._id}`,
      data: {
        videoId: video._id.toString(),
        blobKey: video.blobKey,
        userId: testUserId.toString(),
      },
    };

    const result = await processVideoJob(mockJob);
    assert.equal(result.status, VIDEO_STATUS.PROCESSED);
    assert.ok(result.duration >= 2);
    assert.ok(result.thumbnailKey);
    assert.ok(result.hlsKey);

    // D. Verify MongoDB status transition and saved keys
    const updatedVideo = await Video.findById(video._id);
    assert.equal(updatedVideo.status, VIDEO_STATUS.PROCESSED);
    assert.equal(updatedVideo.duration, result.duration);
    assert.equal(updatedVideo.thumbnailKey, result.thumbnailKey);
    assert.equal(updatedVideo.hlsKey, result.hlsKey);
    assert.equal(updatedVideo.isPublished, true);

    // E. Verify derivatives exist in Azurite
    const thumbExists = await storageService.blobExists(updatedVideo.thumbnailKey);
    const hlsExists = await storageService.blobExists(updatedVideo.hlsKey);
    assert.equal(thumbExists, true, "Thumbnail must exist in storage");
    assert.equal(hlsExists, true, "HLS master playlist must exist in storage");

    // Clean up test video record from DB and blob
    await Video.findByIdAndDelete(video._id);
    await storageService.deleteBlob(blobKey);
    await storageService.deleteBlob(updatedVideo.thumbnailKey);
    await storageService.deleteBlob(updatedVideo.hlsKey);
  });

  await t.test("7. Worker Failure & Retry Status Handling", async () => {
    const failedVideo = await Video.create({
      title: "Corrupt Video Test",
      description: "Should fail processing cleanly",
      owner: testUserId,
      blobKey: `raw/${testUserId}/non-existent-blob.mp4`,
      status: VIDEO_STATUS.PROCESSING,
    });

    const mockFailedJob = {
      id: `fail-job-${failedVideo._id}`,
      data: {
        videoId: failedVideo._id.toString(),
        blobKey: failedVideo.blobKey,
      },
      attemptsMade: 3,
      opts: { attempts: 3 },
    };

    const simulatedError = new Error("Blob download failed: blob not found");
    await handleWorkerFailure(mockFailedJob, simulatedError);

    const reloaded = await Video.findById(failedVideo._id);
    assert.equal(reloaded.status, VIDEO_STATUS.FAILED);
    assert.equal(reloaded.failureReason, simulatedError.message);

    await Video.findByIdAndDelete(failedVideo._id);
  });
});
