import { Queue } from "bullmq";
import { config } from "../config/env.js";
import { redisConnectionOptions } from "../config/redis.js";

let _videoQueue = null;

/**
 * Lazy-initialised queue — created only on first use.
 * This prevents crashing the API process on startup when Redis is unavailable.
 */
const getVideoQueue = () => {
  if (!_videoQueue) {
    _videoQueue = new Queue(config.queue.videoQueueName, {
      connection: redisConnectionOptions,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 3000,
        },
        removeOnComplete: {
          count: 500,
        },
        removeOnFail: {
          count: 1000,
        },
      },
    });
  }
  return _videoQueue;
};

// Keep this export for direct access in tests / worker
export const videoQueue = new Queue(config.queue.videoQueueName, {
  connection: redisConnectionOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 3000,
    },
    removeOnComplete: {
      count: 500,
    },
    removeOnFail: {
      count: 1000,
    },
  },
});

/**
 * Check if a processing job already exists for a video.
 */
export const getExistingProcessingJob = async (videoId) => {
  const jobId = `video-process-${videoId}`;
  try {
    const queue = getVideoQueue();
    const existingJob = await queue.getJob(jobId);
    if (existingJob) {
      const state = await existingJob.getState();
      if (["waiting", "active", "delayed"].includes(state)) {
        return existingJob;
      }
    }
    return null;
  } catch (err) {
    return null;
  }
};

/**
 * Enqueue a video processing job.
 * Throws on Redis error so callers can accurately reflect enqueue status
 * in the database and HTTP response.
 */
export const addVideoProcessingJob = async ({ videoId, blobKey, userId }) => {
  const jobId = `video-process-${videoId}`;

  const queue = getVideoQueue();

  const existingJob = await queue.getJob(jobId);
  if (existingJob) {
    const state = await existingJob.getState();
    if (["waiting", "active", "delayed"].includes(state)) {
      console.log(
        `Job for video ${videoId} is already in state "${state}". Skipping duplicate enqueue.`
      );
      return existingJob;
    }
  }

  const job = await queue.add(
    "process-video",
    {
      videoId,
      blobKey,
      userId,
      enqueuedAt: new Date().toISOString(),
    },
    {
      jobId,
    }
  );

  console.log(`Enqueued video processing job [${job.id}] for videoId: ${videoId}`);
  return job;
};

export const closeVideoQueue = async () => {
  try {
    if (_videoQueue) await _videoQueue.close();
    await videoQueue.close();
  } catch (e) {
    // Ignore close errors
  }
};

