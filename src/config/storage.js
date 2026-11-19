import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  BlobSASPermissions,
  SASProtocol,
  generateBlobSASQueryParameters,
} from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import { config } from "./env.js";
import fs from "node:fs";
import { pipeline } from "node:stream/promises";

class StorageService {
  constructor(options = {}) {
    this.provider = options.provider || config.storage.provider;
    this.containerName = options.containerName || config.storage.containerName;
    this.accountName = options.accountName || config.storage.accountName;
    this.blobServiceClient = null;
    this.containerClient = null;
    this.sharedKeyCredential = null;
    this._initialized = false;
  }

  setProvider(providerName) {
    this.provider = providerName.toLowerCase();
    this.blobServiceClient = null;
    this.containerClient = null;
    this.sharedKeyCredential = null;
    this._initialized = false;
  }

  _init() {
    if (this._initialized) return;

    if (this.provider === "azure") {
      if (!this.accountName) {
        throw new Error(
          "AZURE_STORAGE_ACCOUNT_NAME is required when STORAGE_PROVIDER=azure"
        );
      }
      const credential = new DefaultAzureCredential();
      const serviceUrl = `https://${this.accountName}.blob.core.windows.net`;
      this.blobServiceClient = new BlobServiceClient(serviceUrl, credential);
    } else {
      // Local Azurite provider - uses Azurite default well-known account
      const accountName = process.env.AZURITE_ACCOUNT_NAME || "devstoreaccount1";
      const accountKey =
        process.env.AZURITE_ACCOUNT_KEY ||
        "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==";

      this.sharedKeyCredential = new StorageSharedKeyCredential(
        accountName,
        accountKey
      );

      const azuritePort = process.env.AZURITE_PORT || config.storage.azuritePort || 10000;
      const azuriteHost = process.env.AZURITE_HOST || config.storage.azuriteHost || "127.0.0.1";

      const endpoint =
        config.storage.connectionString ||
        `http://${azuriteHost}:${azuritePort}/${accountName}`;

      if (config.storage.connectionString) {
        this.blobServiceClient = BlobServiceClient.fromConnectionString(
          config.storage.connectionString
        );
      } else {
        this.blobServiceClient = new BlobServiceClient(
          endpoint,
          this.sharedKeyCredential
        );
      }
    }

    this.containerClient = this.blobServiceClient.getContainerClient(
      this.containerName
    );
    this._initialized = true;
  }

  async ensureContainerExists() {
    this._init();
    try {
      await this.containerClient.createIfNotExists();
    } catch (error) {
      console.warn(
        `Failed to ensure container ${this.containerName} exists:`,
        error.message
      );
    }
  }

  async generateUploadSas({ blobKey, contentType, expiresInMinutes = 15 }) {
    this._init();

    const blockBlobClient = this.containerClient.getBlockBlobClient(blobKey);

    const startsOn = new Date();
    startsOn.setMinutes(startsOn.getMinutes() - 5); // Clock skew protection

    const expiresOn = new Date();
    expiresOn.setMinutes(expiresOn.getMinutes() + expiresInMinutes);

    const permissions = BlobSASPermissions.parse("racw"); // read, add, create, write

    let sasToken = "";

    if (this.provider === "azure") {
      // User Delegation SAS for real Azure (HTTPS-only, scoped, short-lived)
      const userDelegationKey =
        await this.blobServiceClient.getUserDelegationKey(startsOn, expiresOn);

      const sasValues = {
        containerName: this.containerName,
        blobName: blobKey,
        permissions,
        startsOn,
        expiresOn,
        protocol: SASProtocol.Https,
        contentType: contentType || undefined,
      };

      sasToken = generateBlobSASQueryParameters(
        sasValues,
        userDelegationKey,
        this.accountName
      ).toString();
    } else {
      // Azurite Shared Key SAS
      const sasValues = {
        containerName: this.containerName,
        blobName: blobKey,
        permissions,
        startsOn,
        expiresOn,
        protocol: SASProtocol.HttpsAndHttp,
        version: "2023-11-03",
      };

      sasToken = generateBlobSASQueryParameters(
        sasValues,
        this.sharedKeyCredential
      ).toString();
    }

    const uploadUrl = `${blockBlobClient.url}?${sasToken}`;

    return {
      blobKey,
      uploadUrl,
      expiresOn,
      provider: this.provider,
      containerName: this.containerName,
    };
  }

  async generateReadSas({ blobKey, expiresInMinutes = 60 }) {
    this._init();

    const blockBlobClient = this.containerClient.getBlockBlobClient(blobKey);

    const startsOn = new Date();
    startsOn.setMinutes(startsOn.getMinutes() - 5);

    const expiresOn = new Date();
    expiresOn.setMinutes(expiresOn.getMinutes() + expiresInMinutes);

    const permissions = BlobSASPermissions.parse("r");

    let sasToken = "";

    if (this.provider === "azure") {
      const userDelegationKey =
        await this.blobServiceClient.getUserDelegationKey(startsOn, expiresOn);

      sasToken = generateBlobSASQueryParameters(
        {
          containerName: this.containerName,
          blobName: blobKey,
          permissions,
          startsOn,
          expiresOn,
          protocol: SASProtocol.Https,
        },
        userDelegationKey,
        this.accountName
      ).toString();
    } else {
      sasToken = generateBlobSASQueryParameters(
        {
          containerName: this.containerName,
          blobName: blobKey,
          permissions,
          startsOn,
          expiresOn,
          protocol: SASProtocol.HttpsAndHttp,
          version: "2023-11-03",
        },
        this.sharedKeyCredential
      ).toString();
    }

    return `${blockBlobClient.url}?${sasToken}`;
  }

  async generateContainerReadSas({ expiresInMinutes = 60 }) {
    this._init();

    const startsOn = new Date();
    startsOn.setMinutes(startsOn.getMinutes() - 5);

    const expiresOn = new Date();
    expiresOn.setMinutes(expiresOn.getMinutes() + expiresInMinutes);

    const permissions = BlobSASPermissions.parse("r");

    let sasToken = "";

    if (this.provider === "azure") {
      const userDelegationKey =
        await this.blobServiceClient.getUserDelegationKey(startsOn, expiresOn);

      sasToken = generateBlobSASQueryParameters(
        {
          containerName: this.containerName,
          permissions,
          startsOn,
          expiresOn,
          protocol: SASProtocol.Https,
        },
        userDelegationKey,
        this.accountName
      ).toString();
    } else {
      sasToken = generateBlobSASQueryParameters(
        {
          containerName: this.containerName,
          permissions,
          startsOn,
          expiresOn,
          protocol: SASProtocol.HttpsAndHttp,
          version: "2023-11-03",
        },
        this.sharedKeyCredential
      ).toString();
    }

    return {
      sasToken,
      containerUrl: this.containerClient.url,
      expiresOn,
    };
  }

  async downloadBlobToBuffer(blobKey) {
    this._init();
    const blobClient = this.containerClient.getBlobClient(blobKey);
    const downloadResponse = await blobClient.download();
    const chunks = [];
    for await (const chunk of downloadResponse.readableStreamBody) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async listBlobsByPrefix(prefix) {
    this._init();
    const blobs = [];
    for await (const blob of this.containerClient.listBlobsFlat({ prefix })) {
      blobs.push(blob.name);
    }
    return blobs;
  }

  async getBlobProperties(blobKey) {
    this._init();
    const blobClient = this.containerClient.getBlobClient(blobKey);
    const properties = await blobClient.getProperties();
    return {
      contentLength: properties.contentLength,
      contentType: properties.contentType,
      etag: properties.etag,
      lastModified: properties.lastModified,
      metadata: properties.metadata,
    };
  }

  async blobExists(blobKey) {
    this._init();
    const blobClient = this.containerClient.getBlobClient(blobKey);
    return await blobClient.exists();
  }

  async downloadBlobToFile(blobKey, destinationPath) {
    this._init();
    const blobClient = this.containerClient.getBlobClient(blobKey);
    const downloadResponse = await blobClient.download();

    const fileWriteStream = fs.createWriteStream(destinationPath);
    await pipeline(downloadResponse.readableStreamBody, fileWriteStream);
    return destinationPath;
  }

  async uploadFileToBlob(localFilePath, blobKey, contentType) {
    this._init();
    const blockBlobClient = this.containerClient.getBlockBlobClient(blobKey);
    const fileReadStream = fs.createReadStream(localFilePath);

    const blobOptions = {
      blobHTTPHeaders: {
        blobContentType: contentType || "application/octet-stream",
      },
    };

    await blockBlobClient.uploadStream(
      fileReadStream,
      4 * 1024 * 1024, // 4MB buffer size
      5, // max concurrency
      blobOptions
    );

    return {
      blobKey,
      url: blockBlobClient.url,
    };
  }

  async deleteBlob(blobKey) {
    this._init();
    const blobClient = this.containerClient.getBlobClient(blobKey);
    return await blobClient.deleteIfExists();
  }
}

export const storageService = new StorageService();
export default storageService;
