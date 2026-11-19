/**
 * Day 6 Tests: HLS Playback Authorization, Manifest & Segment Verification,
 * and Queue Failure & Idempotency Resilience
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import mongoose from "mongoose";
import { startAzurite, stopAzurite } from "./fixtures/azuriteHelper.js";
import { createSampleVideo } from "./fixtures/sampleVideo.js";
import { storageService } from "../src/config/storage.js";
import { Video, VIDEO_STATUS } from "../src/models/video.model.js";
import { videoService } from "../src/services/video.service.js";
import { processVideoJob } from "../src/workers/video.worker.js";
import { closeVideoQueue } from "../src/queues/video.queue.js";
import connectDB from "../src/db/index.js";
import redis from "../src/config/redis.js";

const fetchHttp = (urlString) =>
  new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const req = http.get(
      {
        host: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(8000, () => {
      req.destroy();
      reject(new Error(`Timeout fetching ${urlString}`));
    });
  });

test("Day 6: HLS Playback & Queue Resilience Test Suite", async (t) => {
  let sampleVideoPath = null;
  const ownerUserId = new mongoose.Types.ObjectId();
  const strangerUserId = new mongoose.Types.ObjectId();

  t.before(async () => {
    try {
      redis.disconnect();
    } catch (e) {}

    await Promise.all([startAzurite(10042, "127.0.0.1"), connectDB()]);

    storageService.setProvider("azurite");
    await storageService.ensureContainerExists();

    sampleVideoPath = await createSampleVideo(2);
    assert.ok(fs.existsSync(sampleVideoPath), "Sample video must be generated");
  });

  t.after(async () => {
    if (sampleVideoPath && fs.existsSync(sampleVideoPath)) {
      try {
        fs.unlinkSync(sampleVideoPath);
      } catch (e) {}
    }
    await stopAzurite();
    await closeVideoQueue();
    await mongoose.connection.close();
  });

  await t.test(
    "1. End-to-End Playback: Master playlist and referenced HLS segments are accessible via SAS",
    async () => {
      // A. Upload raw video
      const blobKey = `raw/${ownerUserId}/${Date.now()}-e2e-playback.mp4`;
      await storageService.uploadFileToBlob(sampleVideoPath, blobKey, "video/mp4");

      // B. Create video record
      const video = await Video.create({
        title: "E2E Streamable Video",
        description: "Testing manifest and segment download via container SAS",
        owner: ownerUserId,
        blobKey,
        fileSize: fs.statSync(sampleVideoPath).size,
        mimeType: "video/mp4",
        status: VIDEO_STATUS.UPLOADING,
        isPublished: true,
      });

      // C. Process video through worker (generates HLS and thumbnail)
      const mockJob = {
        id: `e2e-job-${video._id}`,
        data: {
          videoId: video._id.toString(),
          blobKey: video.blobKey,
          userId: ownerUserId.toString(),
        },
      };
      await processVideoJob(mockJob);

      // Verify video is processed
      const processedVideo = await Video.findById(video._id);
      assert.equal(processedVideo.status, VIDEO_STATUS.PROCESSED);
      assert.ok(processedVideo.hlsKey.endsWith("master.m3u8"));

      // D. Call getPlaybackUrl
      const playback = await videoService.getPlaybackUrl({
        videoId: video._id.toString(),
        userId: ownerUserId.toString(),
        expiresInMinutes: 45,
      });

      assert.equal(playback.status, VIDEO_STATUS.PROCESSED);
      assert.ok(playback.masterPlaylistUrl.includes("sig="));
      assert.ok(playback.masterPlaylistUrl.includes("sr=c"));
      assert.ok(playback.containerSasToken);
      assert.ok(playback.segmentUrls.length > 0, "Discovered segments array must not be empty");

      // E. Download master.m3u8 via masterPlaylistUrl
      const playlistRes = await fetchHttp(playback.masterPlaylistUrl);
      assert.equal(
        playlistRes.statusCode,
        200,
        "Master playlist must be downloaded with status 200"
      );
      const playlistContent = playlistRes.body.toString("utf8");
      assert.ok(
        playlistContent.includes("#EXTM3U"),
        "Playlist must have #EXTM3U header"
      );
      assert.ok(
        playlistContent.includes(".ts"),
        "Playlist must reference at least one .ts segment"
      );

      // F. Parse segment name from playlist and download the actual referenced segment
      const segmentLines = playlistContent
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.endsWith(".ts"));
      assert.ok(
        segmentLines.length > 0,
        "Must find at least one segment file in master playlist"
      );

      const firstSegmentName = segmentLines[0];
      const segmentUrl = `${storageService.containerClient.url}/${playback.hlsDir}/${firstSegmentName}?${playback.containerSasToken}`;

      const segmentRes = await fetchHttp(segmentUrl);
      assert.equal(
        segmentRes.statusCode,
        200,
        `Segment ${firstSegmentName} must be accessible via SAS with status 200`
      );
      assert.ok(
        segmentRes.body.length > 100,
        "Segment binary payload must be greater than 100 bytes"
      );

      // G. Test dynamic signed manifest endpoint (each line has SAS)
      const signedManifest = await videoService.getSignedManifest({
        videoId: video._id.toString(),
        userId: ownerUserId.toString(),
      });
      assert.ok(signedManifest.includes("master.m3u8") || signedManifest.includes(".ts?"));
      assert.ok(
        signedManifest.includes(firstSegmentName),
        "Signed manifest must include the segment"
      );
      assert.ok(
        signedManifest.includes("sig="),
        "Signed manifest must include SAS signature on segment URLs"
      );

      // H. Verify thumbnail is accessible
      assert.ok(playback.thumbnailUrl);
      const thumbRes = await fetchHttp(playback.thumbnailUrl);
      assert.equal(thumbRes.statusCode, 200, "Thumbnail must be readable via SAS");
      assert.ok(thumbRes.body.length > 0);

      // Cleanup
      await Video.findByIdAndDelete(video._id);
      await storageService.deleteBlob(blobKey);
    }
  );

  await t.test(
    "2. Playback Authorization: Private video denies non-owner with 403",
    async () => {
      const privateVideo = await Video.create({
        title: "Secret Private Video",
        description: "Only owner should see this",
        owner: ownerUserId,
        blobKey: `raw/${ownerUserId}/${Date.now()}-private.mp4`,
        hlsKey: `derivatives/${ownerUserId}/priv/hls/master.m3u8`,
        status: VIDEO_STATUS.PROCESSED,
        isPublished: false, // PRIVATE
      });

      try {
        // Non-owner attempt -> must throw 403 Forbidden
        await assert.rejects(
          () =>
            videoService.getPlaybackUrl({
              videoId: privateVideo._id.toString(),
              userId: strangerUserId.toString(),
            }),
          (err) => {
            assert.equal(err.statusCode, 403);
            assert.ok(err.message.includes("Forbidden"));
            return true;
          }
        );

        // Owner attempt -> must succeed
        const ownerPlayback = await videoService.getPlaybackUrl({
          videoId: privateVideo._id.toString(),
          userId: ownerUserId.toString(),
        });
        assert.ok(ownerPlayback.masterPlaylistUrl);
      } finally {
        await Video.findByIdAndDelete(privateVideo._id);
      }
    }
  );

  await t.test(
    "3. Playback State Guard: 409 when video is not processed, 404 when not found",
    async () => {
      const uploadingVideo = await Video.create({
        title: "Still Uploading",
        description: "Not yet processed",
        owner: ownerUserId,
        blobKey: `raw/${ownerUserId}/${Date.now()}-not-ready.mp4`,
        status: VIDEO_STATUS.UPLOADING,
      });

      try {
        await assert.rejects(
          () =>
            videoService.getPlaybackUrl({
              videoId: uploadingVideo._id.toString(),
              userId: ownerUserId.toString(),
            }),
          (err) => {
            assert.equal(err.statusCode, 409);
            assert.ok(err.message.includes("not ready"));
            return true;
          }
        );

        const fakeId = new mongoose.Types.ObjectId().toString();
        await assert.rejects(
          () => videoService.getPlaybackUrl({ videoId: fakeId }),
          (err) => {
            assert.equal(err.statusCode, 404);
            return true;
          }
        );
      } finally {
        await Video.findByIdAndDelete(uploadingVideo._id);
      }
    }
  );

  await t.test(
    "4. Queue Failure Resilience: completeUpload records error and throws 503 when Redis is unavailable",
    async () => {
      // Upload sample video to Azurite
      const blobKey = `raw/${ownerUserId}/${Date.now()}-queue-fail.mp4`;
      await storageService.uploadFileToBlob(sampleVideoPath, blobKey, "video/mp4");

      const video = await Video.create({
        title: "Redis Down Resilience Test",
        description: "Queue failure should not swallow error or stick status in processing",
        owner: ownerUserId,
        blobKey,
        fileSize: fs.statSync(sampleVideoPath).size,
        mimeType: "video/mp4",
        status: VIDEO_STATUS.UPLOADING,
      });

      try {
        // Complete upload when Redis is disconnected:
        // Must throw 503 and set failureReason on the video
        await assert.rejects(
          () =>
            videoService.completeUpload({
              videoId: video._id.toString(),
              userId: ownerUserId.toString(),
              _enqueueFn: () =>
                Promise.reject(
                  new Error("connect ECONNREFUSED 127.0.0.1:6379")
                ),
            }),
          (err) => {
            assert.equal(err.statusCode, 503);
            assert.ok(err.message.includes("queue is unavailable"));
            return true;
          }
        );

        // Verify video record is NOT stuck in processing
        const updated = await Video.findById(video._id);
        assert.equal(
          updated.status,
          VIDEO_STATUS.UPLOADING,
          "Video must remain in uploading status if queue failed"
        );
        assert.ok(
          updated.failureReason.includes("Enqueue failed"),
          "Failure reason must be recorded in database"
        );
      } finally {
        await Video.findByIdAndDelete(video._id);
        await storageService.deleteBlob(blobKey);
      }
    }
  );

  await t.test(
    "5. Idempotency: completeUpload on already processed video returns immediately without re-enqueuing",
    async () => {
      const processedVideo = await Video.create({
        title: "Already Processed Video",
        description: "Idempotent completion check",
        owner: ownerUserId,
        blobKey: `raw/${ownerUserId}/${Date.now()}-already-done.mp4`,
        status: VIDEO_STATUS.PROCESSED,
        duration: 120,
        thumbnailKey: "derivatives/test/thumb.jpg",
        hlsKey: "derivatives/test/hls/master.m3u8",
      });

      try {
        const result = await videoService.completeUpload({
          videoId: processedVideo._id.toString(),
          userId: ownerUserId.toString(),
        });

        assert.equal(result.isIdempotent, true);
        assert.equal(result.status, VIDEO_STATUS.PROCESSED);
        assert.ok(result.message.includes("already processed"));
      } finally {
        await Video.findByIdAndDelete(processedVideo._id);
      }
    }
  );

  await t.test(
    "6. Express Routes: Both /stream and /manifest.m3u8 routes are registered",
    async () => {
      const { default: router } = await import("../src/routes/video.routes.js");
      const routes = router.stack
        .filter((layer) => layer.route && layer.route.path)
        .map((l) => l.route.path);

      assert.ok(routes.includes("/:videoId/stream"), "/:videoId/stream route must be registered");
      assert.ok(
        routes.includes("/:videoId/manifest.m3u8"),
        "/:videoId/manifest.m3u8 route must be registered"
      );
    }
  );
});
