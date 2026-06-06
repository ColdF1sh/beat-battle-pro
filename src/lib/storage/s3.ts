import {
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

type UploadAudioSubmissionParams = {
  battleId: string;
  userId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
};

type StorageConfig = {
  provider: StorageProvider;
  endpoint: string;
  bucketName: string;
  publicUrl: string;
  region: string;
  forcePathStyle: boolean;
};

type StorageProvider = "minio" | "r2";

type UploadStorageObjectParams = {
  objectKey: string;
  mimeType: string;
  buffer: Buffer;
};

export class StorageNotConfiguredError extends Error {
  constructor() {
    super("Storage is not configured.");
    this.name = "StorageNotConfiguredError";
  }
}

function shouldForcePathStyle(endpoint: string | undefined) {
  if (process.env.S3_FORCE_PATH_STYLE) {
    return process.env.S3_FORCE_PATH_STYLE === "true";
  }

  return Boolean(
    endpoint &&
      (endpoint.includes("localhost") ||
        endpoint.includes("127.0.0.1") ||
        endpoint.includes("minio")),
  );
}

function getStorageProvider(): StorageProvider {
  const provider = (process.env.STORAGE_PROVIDER ?? "minio").toLowerCase();

  if (provider === "r2") {
    return "r2";
  }

  return "minio";
}

function getR2Endpoint() {
  if (process.env.R2_ENDPOINT) {
    return process.env.R2_ENDPOINT;
  }

  if (process.env.R2_ACCOUNT_ID) {
    return `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  }

  return process.env.S3_ENDPOINT;
}

function getR2PublicUrl() {
  const publicUrl = process.env.R2_PUBLIC_URL ?? process.env.S3_PUBLIC_URL;

  if (
    publicUrl &&
    !publicUrl.includes("localhost") &&
    !publicUrl.includes("127.0.0.1") &&
    !publicUrl.includes("minio")
  ) {
    return publicUrl;
  }

  return undefined;
}

export function getStorageConfig(): StorageConfig {
  const provider = getStorageProvider();
  const endpoint =
    provider === "r2" ? getR2Endpoint() : process.env.S3_ENDPOINT;
  const accessKeyId =
    provider === "r2"
      ? (process.env.R2_ACCESS_KEY_ID ?? process.env.S3_ACCESS_KEY_ID)
      : process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey =
    provider === "r2"
      ? (process.env.R2_SECRET_ACCESS_KEY ?? process.env.S3_SECRET_ACCESS_KEY)
      : process.env.S3_SECRET_ACCESS_KEY;
  const bucketName =
    provider === "r2"
      ? (process.env.R2_BUCKET_NAME ?? process.env.S3_BUCKET_NAME)
      : process.env.S3_BUCKET_NAME;
  const publicUrl =
    provider === "r2"
      ? getR2PublicUrl()
      : process.env.S3_PUBLIC_URL;
  const region =
    provider === "r2"
      ? (process.env.R2_REGION ?? "auto")
      : (process.env.S3_REGION ?? "auto");
  const forcePathStyle =
    provider === "r2" ? false : shouldForcePathStyle(endpoint);

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName || !publicUrl) {
    throw new StorageNotConfiguredError();
  }

  return {
    provider,
    endpoint,
    bucketName,
    publicUrl: publicUrl.replace(/\/$/, ""),
    region,
    forcePathStyle,
  };
}

function getStorageCredentials() {
  const provider = getStorageProvider();
  const accessKeyId =
    provider === "r2"
      ? (process.env.R2_ACCESS_KEY_ID ?? process.env.S3_ACCESS_KEY_ID)
      : process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey =
    provider === "r2"
      ? (process.env.R2_SECRET_ACCESS_KEY ?? process.env.S3_SECRET_ACCESS_KEY)
      : process.env.S3_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    return undefined;
  }

  return {
    accessKeyId,
    secretAccessKey,
  };
}

const storageConfig = (() => {
  try {
    return getStorageConfig();
  } catch {
    return null;
  }
})();

export const s3Client = new S3Client({
  region: storageConfig?.region ?? process.env.S3_REGION ?? "auto",
  endpoint: storageConfig?.endpoint ?? process.env.S3_ENDPOINT,
  credentials: getStorageCredentials(),
  forcePathStyle: storageConfig?.forcePathStyle ?? shouldForcePathStyle(process.env.S3_ENDPOINT),
  maxAttempts: 1,
});

function sanitizeFileName(fileName: string) {
  const safeName = fileName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return safeName || "submission";
}

export function getStoragePublicUrl(objectKey: string) {
  const { publicUrl } = getStorageConfig();

  return `${publicUrl}/${objectKey}`;
}

export async function uploadStorageObject({
  objectKey,
  mimeType,
  buffer,
}: UploadStorageObjectParams) {
  const { bucketName } = getStorageConfig();

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
      Body: buffer,
      ContentType: mimeType,
    }),
  );

  return {
    fileUrl: getStoragePublicUrl(objectKey),
    objectKey,
  };
}

export async function uploadAudioSubmission({
  battleId,
  userId,
  fileName,
  mimeType,
  buffer,
}: UploadAudioSubmissionParams) {
  const safeFileName = sanitizeFileName(fileName);
  const objectKey = `submissions/${battleId}/${userId}/${Date.now()}-${safeFileName}`;

  return uploadStorageObject({
    objectKey,
    mimeType,
    buffer,
  });
}

export async function testStorageConnection() {
  const { bucketName } = getStorageConfig();

  await s3Client.send(
    new HeadBucketCommand({
      Bucket: bucketName,
    }),
  );
}

let hasLoggedStorageStartup = false;

export async function logStorageStartupStatus() {
  if (hasLoggedStorageStartup) {
    return;
  }

  hasLoggedStorageStartup = true;

  try {
    const config = getStorageConfig();
    let connection: "success" | "failed" = "success";
    let errorMessage: string | undefined;

    try {
      await testStorageConnection();
    } catch (error) {
      connection = "failed";
      errorMessage = error instanceof Error ? error.message : String(error);
    }

    console.info("Storage startup", {
      provider: config.provider,
      endpoint: config.endpoint,
      bucketName: config.bucketName,
      publicUrl: config.publicUrl,
      forcePathStyle: config.forcePathStyle,
      connection,
      error: errorMessage,
    });
  } catch (error) {
    console.warn("Storage startup", {
      provider: process.env.STORAGE_PROVIDER ?? "minio",
      configured: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
