/**
 * azuriteHelper.js — In-process Azurite server using BlobServerFactory.
 *
 * Uses Azurite's BlobServerFactory directly so:
 * 1. --skipApiVersionCheck and --loose are respected via patched process.argv.
 * 2. It runs in the current Node.js process (bypassing child process sandbox restrictions).
 * 3. It can be cleanly started with server.start() and stopped with server.close().
 */
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import net from "node:net";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../..");

let _azuriteServer = null;
let _tempDir = null;

const checkPort = (port, host = "127.0.0.1") =>
  new Promise((resolve) => {
    const s = new net.Socket();
    s.setTimeout(300);
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

export const startAzurite = async (port = 10042, host = "127.0.0.1") => {
  process.env.AZURITE_PORT = String(port);
  process.env.AZURITE_HOST = host;

  if (await checkPort(port, host)) {
    console.log(`[Azurite] Reusing existing server on ${host}:${port}`);
    return { port, dir: _tempDir };
  }

  _tempDir = path.join(os.tmpdir(), `azurite-inproc-${Date.now()}`);
  fs.mkdirSync(_tempDir, { recursive: true });

  // Patch process.argv so BlobEnvironment picks up the flags
  process.argv = [
    process.execPath,
    "azurite-blob",
    "--blobHost",
    host,
    "--blobPort",
    String(port),
    "--skipApiVersionCheck",
    "--loose",
    "--silent",
    "-l",
    _tempDir,
  ];

  const factoryPath = path.join(
    PROJECT_ROOT,
    "node_modules/azurite/dist/src/blob/BlobServerFactory.js"
  );
  const factoryUrl = pathToFileURL(factoryPath).href;
  const { BlobServerFactory } = await import(factoryUrl);

  const factory = new BlobServerFactory();
  _azuriteServer = await factory.createServer();
  await _azuriteServer.start();

  // Wait until port is ready
  const start = Date.now();
  while (Date.now() - start < 10000) {
    if (await checkPort(port, host)) {
      console.log(`[Azurite] In-process server listening on ${host}:${port}`);
      return { port, dir: _tempDir };
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  throw new Error(`Azurite failed to start on port ${port} within timeout`);
};

export const stopAzurite = async () => {
  if (_azuriteServer) {
    try {
      await _azuriteServer.close();
      console.log("[Azurite] In-process server closed successfully");
    } catch (e) {
      console.warn("[Azurite] Error closing server:", e.message);
    }
    _azuriteServer = null;
  }

  if (_tempDir && fs.existsSync(_tempDir)) {
    try {
      fs.rmSync(_tempDir, { recursive: true, force: true });
    } catch (e) {}
    _tempDir = null;
  }
};
