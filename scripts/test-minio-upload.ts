import fs from "node:fs";
import path from "node:path";

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), ".env");

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

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function main() {
  loadLocalEnv();

  const { uploadAudioSubmission } = await import("@/lib/storage/s3");
  const timestamp = Date.now();
  const result = await uploadAudioSubmission({
    battleId: "dev-minio-test",
    userId: "local",
    fileName: `minio-test-${timestamp}.wav`,
    mimeType: "audio/wav",
    buffer: Buffer.from(
      "UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=",
      "base64",
    ),
  });

  console.log("Uploaded test file to S3-compatible storage.");
  console.log(`Object key: ${result.objectKey}`);
  console.log(`Public URL: ${result.fileUrl}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
