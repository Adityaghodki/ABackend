import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { BlockBlobClient } from "@azure/storage-blob";
import { startAzurite, stopAzurite } from "./fixtures/azuriteHelper.js";
import { storageService } from "../src/config/storage.js";
import {
  createUploadRequestSchema,
  uploadCompleteSchema,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
} from "../src/validators/video.validators.js";
import { config } from "../src/config/env.js";

test("Day 4: Storage & Direct Upload Test Suite", async (t) => {
  let azuriteInstance = null;

  t.before(async () => {
    // Start local Azurite in-process server on port 10042 for real blob storage integration
    azuriteInstance = await startAzurite(10042, "127.0.0.1");
    storageService.setProvider("azurite");
    await storageService.ensureContainerExists();
  });

  t.after(async () => {
    await stopAzurite();
  });

  await t.test("1. Storage Service initialization and container creation", async () => {
    assert.equal(storageService.provider, "azurite");
    assert.equal(storageService.containerName, "videos");
    assert.ok(storageService.blobServiceClient);
    assert.ok(storageService.containerClient);

    const exists = await storageService.containerClient.exists();
    assert.equal(exists, true, "Container Client must exist in Azurite");
  });

  await t.test("2. Generate short-lived SAS upload URL for client direct upload", async () => {
    const blobKey = `raw/user123/${Date.now()}-test-video.mp4`;
    const sasResult = await storageService.generateUploadSas({
      blobKey,
      contentType: "video/mp4",
      expiresInMinutes: 15,
    });

    assert.equal(sasResult.blobKey, blobKey);
    assert.ok(sasResult.uploadUrl, "uploadUrl must be generated");
    assert.ok(sasResult.uploadUrl.includes("sig="), "uploadUrl must contain SAS signature");
    assert.ok(sasResult.uploadUrl.includes("sp=racw") || sasResult.uploadUrl.includes("sp="));
    assert.ok(sasResult.expiresOn instanceof Date);

    // Ensure SAS token expires in the future
    assert.ok(sasResult.expiresOn.getTime() > Date.now());
  });

  await t.test("3. Direct client block upload to Blob Storage via generated SAS URL", async () => {
    const blobKey = `raw/user123/${Date.now()}-direct-upload.mp4`;
    const sasResult = await storageService.generateUploadSas({
      blobKey,
      contentType: "video/mp4",
      expiresInMinutes: 15,
    });

    // Simulate direct client upload using BlockBlobClient with the SAS URL
    const clientBlob = new BlockBlobClient(sasResult.uploadUrl);
    const dummyVideoContent = Buffer.from("simulated video binary data payload for direct block upload");

    await clientBlob.uploadData(dummyVideoContent, {
      blobHTTPHeaders: { blobContentType: "video/mp4" },
    });

    // Verify blob exists in storage
    const exists = await storageService.blobExists(blobKey);
    assert.equal(exists, true, "Blob must exist in storage after client direct upload");

    // Verify blob properties and size match
    const properties = await storageService.getBlobProperties(blobKey);
    assert.equal(properties.contentLength, dummyVideoContent.length);
    assert.equal(properties.contentType, "video/mp4");
  });

  await t.test("4. Input Validation: Video Upload Request Schema", async () => {
    const schema = createUploadRequestSchema(500 * 1024 * 1024);

    // Valid payload
    const valid = schema.safeParse({
      title: "My Tutorial",
      description: "Learn Node.js backend engineering",
      fileName: "tutorial.mp4",
      fileSize: 10485760, // 10 MB
      mimeType: "video/mp4",
    });
    assert.equal(valid.success, true);

    // Invalid: unsupported MIME type
    const invalidMime = schema.safeParse({
      title: "My Tutorial",
      description: "Learn Node.js backend engineering",
      fileName: "tutorial.exe",
      fileSize: 10485760,
      mimeType: "application/x-msdownload",
    });
    assert.equal(invalidMime.success, false);

    // Invalid: MIME type / extension mismatch
    const mismatch = schema.safeParse({
      title: "My Tutorial",
      description: "Learn Node.js backend engineering",
      fileName: "tutorial.mkv",
      fileSize: 10485760,
      mimeType: "video/mp4",
    });
    assert.equal(mismatch.success, false);

    // Invalid: oversized file
    const oversized = schema.safeParse({
      title: "My Tutorial",
      description: "Learn Node.js backend engineering",
      fileName: "tutorial.mp4",
      fileSize: 600 * 1024 * 1024, // 600 MB > 500 MB limit
      mimeType: "video/mp4",
    });
    assert.equal(oversized.success, false);

    // Invalid: empty/negative file size
    const zeroSize = schema.safeParse({
      title: "My Tutorial",
      description: "Learn Node.js backend engineering",
      fileName: "tutorial.mp4",
      fileSize: 0,
      mimeType: "video/mp4",
    });
    assert.equal(zeroSize.success, false);
  });

  await t.test("5. Input Validation: Video Upload Complete Schema", async () => {
    // Valid 24-char hex ObjectId
    const valid = uploadCompleteSchema.safeParse({
      videoId: "507f1f77bcf86cd799439011",
    });
    assert.equal(valid.success, true);

    // Invalid videoId
    const invalid = uploadCompleteSchema.safeParse({
      videoId: "not-a-valid-id",
    });
    assert.equal(invalid.success, false);
  });

  await t.test("6. Storage streaming upload and download without loading into memory", async () => {
    const tempFile = path.join(os.tmpdir(), `stream-test-${Date.now()}.bin`);
    const downloadedFile = path.join(os.tmpdir(), `stream-download-${Date.now()}.bin`);
    const testBuffer = Buffer.alloc(1024 * 64, 42); // 64 KB
    fs.writeFileSync(tempFile, testBuffer);

    const blobKey = `tests/streaming-${Date.now()}.bin`;

    try {
      // Streaming upload
      await storageService.uploadFileToBlob(tempFile, blobKey, "application/octet-stream");
      const exists = await storageService.blobExists(blobKey);
      assert.equal(exists, true);

      // Streaming download
      await storageService.downloadBlobToFile(blobKey, downloadedFile);
      assert.equal(fs.existsSync(downloadedFile), true);
      assert.equal(fs.statSync(downloadedFile).size, testBuffer.length);
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      if (fs.existsSync(downloadedFile)) fs.unlinkSync(downloadedFile);
      await storageService.deleteBlob(blobKey);
    }
  });

  await t.test("7. Storage Provider Switching & Azure configuration", async () => {
    storageService.setProvider("azure");
    assert.equal(storageService.provider, "azure");
    storageService._init();
    assert.ok(
      storageService.blobServiceClient.url.includes(".blob.core.windows.net"),
      "Azure provider must target blob.core.windows.net endpoint"
    );
    // Switch back to azurite
    storageService.setProvider("azurite");
    storageService._init();
    assert.equal(storageService.provider, "azurite");
  });

  await t.test("8. Expired SAS Token rejection: Blob Storage rejects uploads with expired SAS", async () => {
    const blobKey = `tests/expired-sas-${Date.now()}.mp4`;
    // Generate SAS that expired in the past
    const expiredStarts = new Date(Date.now() - 20 * 60 * 1000);
    const expiredEnds = new Date(Date.now() - 5 * 60 * 1000);

    const {
      BlobSASPermissions,
      SASProtocol,
      generateBlobSASQueryParameters,
    } = await import("@azure/storage-blob");

    const sasValues = {
      containerName: storageService.containerName,
      blobName: blobKey,
      permissions: BlobSASPermissions.parse("racw"),
      startsOn: expiredStarts,
      expiresOn: expiredEnds,
      protocol: SASProtocol.HttpsAndHttp,
      version: "2023-11-03",
    };

    const sasToken = generateBlobSASQueryParameters(
      sasValues,
      storageService.sharedKeyCredential
    ).toString();

    const expiredUrl = `${storageService.containerClient.getBlockBlobClient(blobKey).url}?${sasToken}`;
    const expiredClient = new BlockBlobClient(expiredUrl);

    await assert.rejects(
      async () => {
        await expiredClient.uploadData(Buffer.from("payload with expired token"));
      },
      (err) => {
        assert.ok(
          err.statusCode === 403 ||
            err.message.includes("AuthenticationFailed") ||
            err.message.includes("Signature not valid in the specified time frame"),
          `Expected authentication failure, received ${err.message}`
        );
        return true;
      }
    );
  });
});
