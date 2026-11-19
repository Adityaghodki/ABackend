import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { getFfmpegPath } from "../../src/utils/mediaTools.js";

const execFileAsync = promisify(execFile);

export const createSampleVideo = async (durationSec = 2) => {
  const ffmpeg = getFfmpegPath();
  const tempPath = path.join(
    os.tmpdir(),
    `sample-${Date.now()}-${Math.random().toString(36).substring(7)}.mp4`
  );

  const args = [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `testsrc=duration=${durationSec}:size=320x240:rate=24`,
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=1000:duration=${durationSec}`,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    tempPath,
  ];

  await execFileAsync(ffmpeg, args);
  return tempPath;
};

