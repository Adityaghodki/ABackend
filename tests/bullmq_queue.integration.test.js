/**
 * BullMQ Live Queue Integration Test
 *
 * Verifies live BullMQ enqueue -> worker dequeue -> processing -> completion
 * when a real Redis instance is running.
 *
 * If Redis is not running, this test cleanly detects it and marks the test
 * as BLOCKED / SKIPPED with exact instructions on how to start Redis.
 */

import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import fs from "node:fs";
import mongoose from "mongoose";
import { config } from "../src/config/env.js";
import { startAzurite, stopAzurite } from "./fixtures/azuriteHelper.js";
import { createSampleVideo } from "./fixtures/sampleVideo.js";
import { storageService } from "../src/config/storage.js";
import { Video, VIDEO_STATUS } from "../src/models/video.model.js";
import {
  addVideoProcessingJob,
  closeVideoQueue,
} from "../src/queues/video.queue.js";
import { createVideoWorker } from "../src/workers/video.worker.js";
import connectDB from "../src/db/index.js";
import redis from "../src/config/redis.js";

const isRedisAvailable = (host = "127.0.0.1", port = 6379) =>
  new Promise((resolve) => {
    const s = new net.Socket();
    s.setTimeout(500);
    s.on("connect", () => {
      s.destroy();
      resolve(true);
    });
    s.on("error", () => resolve(false));
    s.on("timeout", () => {
      s.destroy();
      resolve(false);
    });
    s.connect(port, host);
  });

test("BullMQ Live Queue & Worker Integration", async (t) => {
  const redisUp = await isRedisAvailable(
    config.redis.host,
    config.redis.port
  );

  if (!redisUp) {
    t.skip(
      `BLOCKED: Redis is not running on ${config.redis.host}:${config.redis.port}. ` +
        `Start Redis with: docker compose up -d redis (or docker run -d -p 6379:6379 redis:7-alpine) to run this test.`
    );
    return;
  }

  let sampleVideoPath = null;
  let worker = null;
  const testUserId = new mongoose.Types.ObjectId();

  t.before(async () => {
    await Promise.all([startAzurite(10042, "127.0.0.1"), connectDB()]);

    storageService.setProvider("azurite");
    await storageService.ensureContainerExists();

    sampleVideoPath = await createSampleVideo(2);
    assert.ok(fs.existsSync(sampleVideoPath), "Sample video must be generated");

    // Start live BullMQ worker
    worker = createVideoWorker();
  });

  t.after(async () => {
    if (worker) {
      await worker.close();
    }
    await closeVideoQueue();
    redis.disconnect();
    if (sampleVideoPath && fs.existsSync(sampleVideoPath)) {
      try {
        fs.unlinkSync(sampleVideoPath);
      } catch (e) {}
    }
    await stopAzurite();
    await mongoose.connection.close();
  });

  await t.test(
    "Live Queue: Enqueue job -> BullMQ Worker processes -> MongoDB marked PROCESSED",
    async () => {
      // 1. Upload sample video to Azurite
      const blobKey = `raw/${testUserId}/${Date.now()}-live-queue.mp4`;
      await storageService.uploadFileToBlob(
        sampleVideoPath,
        blobKey,
        "video/mp4"
      );

      // 2. Create MongoDB video record in 'uploading' status
      const video = await Video.create({
        title: "Live BullMQ Test Video",
        description: "Testing live queue consumption by BullMQ worker",
        owner: testUserId,
        blobKey,
        fileSize: fs.statSync(sampleVideoPath).size,
        mimeType: "video/mp4",
        status: VIDEO_STATUS.UPLOADING,
      });

      // 3. Enqueue job into BullMQ
      const job = await addVideoProcessingJob({
        videoId: video._id.toString(),
        blobKey: video.blobKey,
        userId: testUserId.toString(),
      });
      assert.ok(job, "Job must be created in BullMQ");
      assert.ok(job.id, "Job must have an ID");

      // 4. Poll MongoDB until worker finishes processing
      let processed = false;
      const start = Date.now();
      while (Date.now() - start < 45000) {
        const current = await Video.findById(video._id);
        if (current && current.status === VIDEO_STATUS.PROCESSED) {
          processed = true;
          assert.ok(current.hlsKey, "hlsKey must be set");
          assert.ok(current.thumbnailKey, "thumbnailKey must be set");
          assert.ok(current.duration >= 1, "duration must be set");
          break;
        }
        if (current && current.status === VIDEO_STATUS.FAILED) {
          throw new Error(
            `Worker marked job as failed: ${current.failureReason}`
          );
        }
        await new Promise((r) => setTimeout(r, 1000));
      }

      assert.equal(
        processed,
        true,
        "Video must transition to PROCESSED state within timeout"
      );

      // Clean up test data
      await Video.findByIdAndDelete(video._id);
      await storageService.deleteBlob(blobKey);
    }
  );
});
