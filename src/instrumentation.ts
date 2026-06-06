export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") {
    return;
  }

  const { logStorageStartupStatus } = await import("@/lib/storage/s3");

  await logStorageStartupStatus();
}
