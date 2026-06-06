import fs from "node:fs";
import path from "node:path";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

function loadEnvFile(fileName: string) {
  const envPath = path.join(process.cwd(), fileName);

  if (!fs.existsSync(envPath)) {
    return;
  }

  const envFile = fs.readFileSync(envPath, "utf8");

  for (const line of envFile.split(/\r?\n/)) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmedLine.indexOf("=");

    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmedLine.slice(0, equalsIndex).trim();
    const rawValue = trimmedLine.slice(equalsIndex + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");

    process.env[key] = value;
  }
}

async function streamToBuffer(body: unknown) {
  if (!body || typeof body !== "object" || !("transformToByteArray" in body)) {
    throw new Error("Downloaded object body is not readable.");
  }

  const bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> })
    .transformToByteArray();

  return Buffer.from(bytes);
}

async function main() {
  loadEnvFile(".env");
  loadEnvFile(".env.local");

  process.env.STORAGE_PROVIDER = "r2";

  const { getStorageConfig, getStoragePublicUrl, s3Client } = await import(
    "@/lib/storage/s3"
  );
  let config: ReturnType<typeof getStorageConfig>;

  try {
    config = getStorageConfig();
  } catch (error) {
    console.error("R2 health check failed: storage is not fully configured.");
    console.error("Required R2 settings:");
    console.error("- R2_ACCESS_KEY_ID or S3_ACCESS_KEY_ID");
    console.error("- R2_SECRET_ACCESS_KEY or S3_SECRET_ACCESS_KEY");
    console.error("- R2_BUCKET_NAME or S3_BUCKET_NAME");
    console.error("- R2_ENDPOINT or R2_ACCOUNT_ID or S3_ENDPOINT");
    console.error("- R2_PUBLIC_URL with a public R2/custom-domain URL");
    console.error("Current non-secret values:", {
      STORAGE_PROVIDER: process.env.STORAGE_PROVIDER,
      R2_ACCOUNT_ID: Boolean(process.env.R2_ACCOUNT_ID),
      R2_ENDPOINT: process.env.R2_ENDPOINT,
      R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
      R2_PUBLIC_URL: process.env.R2_PUBLIC_URL,
      S3_ENDPOINT: process.env.S3_ENDPOINT,
      S3_BUCKET_NAME: process.env.S3_BUCKET_NAME,
      S3_PUBLIC_URL: process.env.S3_PUBLIC_URL,
    });
    console.error(error);
    process.exitCode = 1;
    return;
  }
  const objectKey = `health-check/r2-test-${Date.now()}.wav`;
  const body = Buffer.from(
    "UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=",
    "base64",
  );
  let didUploadTempObject = false;

  console.log("R2 health check starting...");
  console.log(`Provider: ${config.provider}`);
  console.log(`Endpoint: ${config.endpoint}`);
  console.log(`Bucket: ${config.bucketName}`);
  console.log(`Public URL base: ${config.publicUrl}`);

  try {
    const listed = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: config.bucketName,
        MaxKeys: 5,
      }),
    );
    console.log(`List bucket: success (${listed.KeyCount ?? 0} visible keys)`);

    await s3Client.send(
      new PutObjectCommand({
        Bucket: config.bucketName,
        Key: objectKey,
        Body: body,
        ContentType: "audio/wav",
      }),
    );
    didUploadTempObject = true;
    console.log(`Upload temp object: success (${objectKey})`);

    const downloaded = await s3Client.send(
      new GetObjectCommand({
        Bucket: config.bucketName,
        Key: objectKey,
      }),
    );
    const downloadedBuffer = await streamToBuffer(downloaded.Body);

    if (!downloadedBuffer.equals(body)) {
      throw new Error("Downloaded temp object did not match uploaded bytes.");
    }

    console.log("Download temp object: success");

    const publicUrl = getStoragePublicUrl(objectKey);
    const publicResponse = await fetch(publicUrl);

    if (!publicResponse.ok) {
      throw new Error(
        `Public URL check failed: ${publicResponse.status} ${publicResponse.statusText}`,
      );
    }

    const contentType = publicResponse.headers.get("content-type") ?? "";

    if (!contentType.toLowerCase().includes("audio")) {
      throw new Error(`Public URL is not serving audio content: ${contentType}`);
    }

    console.log(`Public audio URL check: success (${publicUrl})`);

    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: config.bucketName,
        Key: objectKey,
      }),
    );
    console.log("Delete temp object: success");
    didUploadTempObject = false;
    console.log("R2 health check passed.");
  } catch (error) {
    console.error("R2 health check failed.");
    console.error(error);

    if (didUploadTempObject) {
      try {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: config.bucketName,
            Key: objectKey,
          }),
        );
        console.error("Cleanup temp object: success");
      } catch (cleanupError) {
        console.error("Cleanup temp object: failed");
        console.error(cleanupError);
      }
    }

    process.exitCode = 1;
  }
}

void main();
