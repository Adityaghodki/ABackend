import { execSync } from "node:child_process";

let cachedFfmpegPath = null;
let cachedFfprobePath = null;

export const getFfmpegPath = () => {
  if (cachedFfmpegPath) return cachedFfmpegPath;

  if (process.env.FFMPEG_PATH) {
    cachedFfmpegPath = process.env.FFMPEG_PATH;
    return cachedFfmpegPath;
  }

  // 1. Try system PATH
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
    cachedFfmpegPath = "ffmpeg";
    return cachedFfmpegPath;
  } catch (err) {
    // Not on system PATH
  }

  // 2. Try npm installer package
  try {
    // Dynamic require or import if available
    const ffmpegInstaller = awaitImportSync("@ffmpeg-installer/ffmpeg");
    if (ffmpegInstaller?.path) {
      cachedFfmpegPath = ffmpegInstaller.path;
      return cachedFfmpegPath;
    }
  } catch (err) {
    // Installer not available
  }

  throw new Error(
    "FFmpeg executable not found. Please install ffmpeg or set FFMPEG_PATH."
  );
};

export const getFfprobePath = () => {
  if (cachedFfprobePath) return cachedFfprobePath;

  if (process.env.FFPROBE_PATH) {
    cachedFfprobePath = process.env.FFPROBE_PATH;
    return cachedFfprobePath;
  }

  // 1. Try system PATH
  try {
    execSync("ffprobe -version", { stdio: "ignore" });
    cachedFfprobePath = "ffprobe";
    return cachedFfprobePath;
  } catch (err) {
    // Not on system PATH
  }

  // 2. Try npm installer package
  try {
    const ffprobeInstaller = awaitImportSync("@ffprobe-installer/ffprobe");
    if (ffprobeInstaller?.path) {
      cachedFfprobePath = ffprobeInstaller.path;
      return cachedFfprobePath;
    }
  } catch (err) {
    // Installer not available
  }

  throw new Error(
    "ffprobe executable not found. Please install ffprobe or set FFPROBE_PATH."
  );
};

// Helper to synchronously resolve installer module path
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

function awaitImportSync(packageName) {
  try {
    const pkg = require(packageName);
    return pkg?.default || pkg;
  } catch (e) {
    return null;
  }
}

