const localAudioPrefixes = ["/demo-audio/", "/uploads/"];
const warnedAudioUrls = new Set<string>();

export function isLocalAudioUrl(url: string | null | undefined) {
  if (!url) {
    return false;
  }

  const normalized = url.toLowerCase();

  return (
    localAudioPrefixes.some((prefix) => normalized.startsWith(prefix)) ||
    normalized.includes("localhost") ||
    normalized.includes("127.0.0.1")
  );
}

export function isRemoteLikeDeployment() {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.APP_ENV === "test-server" ||
    Boolean(process.env.VERCEL || process.env.RENDER || process.env.RAILWAY_ENVIRONMENT)
  );
}

export function shouldRequireRemoteAudioUrl() {
  return (
    process.env.STORAGE_PROVIDER === "r2" ||
    isRemoteLikeDeployment()
  ) && process.env.ENABLE_LOCAL_DEMO_AUDIO !== "true";
}

export function isPublicR2Url(url: string | null | undefined) {
  if (!url) {
    return false;
  }

  const publicUrl = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");

  return Boolean(publicUrl && url.startsWith(`${publicUrl}/`));
}

export function requireRemoteAudioUrlInProduction(
  url: string | null | undefined,
  context: string,
) {
  if (!url || !shouldRequireRemoteAudioUrl() || !isLocalAudioUrl(url)) {
    return true;
  }

  const warningKey = `${context}:${url}`;

  if (!warnedAudioUrls.has(warningKey)) {
    warnedAudioUrls.add(warningKey);
    console.warn("Remote/R2 deployment attempted to use local audio URL.", {
      context,
      url,
      storageProvider: process.env.STORAGE_PROVIDER,
      vercel: Boolean(process.env.VERCEL),
    });
  }

  return false;
}
