import { NextResponse } from "next/server";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  route: string;
  windowMs: number;
  maxRequests: number;
};

type RateLimitRequest = Request | {
  headers?: Record<string, unknown>;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
};

const store = new Map<string, RateLimitEntry>();
let lastCleanupAt = 0;
const CLEANUP_INTERVAL_MS = 60_000;

// MVP/dev-only limiter. In-memory state is not reliable across serverless,
// restarts, or multiple app instances. Replace with Redis/Upstash before
// production scale.
function cleanupExpiredEntries(now: number) {
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) {
    return;
  }

  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }

  lastCleanupAt = now;
}

function getHeader(request: RateLimitRequest, name: string) {
  if (request.headers instanceof Headers) {
    return request.headers.get(name);
  }

  const headers = request.headers;

  if (!headers) {
    return null;
  }

  const value = headers[name] ?? headers[name.toLowerCase()];

  if (Array.isArray(value)) {
    return value[0]?.toString() ?? null;
  }

  return typeof value === "string" ? value : value?.toString() ?? null;
}

export function getClientIp(request: RateLimitRequest) {
  const forwardedFor = getHeader(request, "x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return getHeader(request, "x-real-ip")?.trim() || "unknown";
}

export function rateLimit(
  request: RateLimitRequest,
  { route, windowMs, maxRequests }: RateLimitOptions,
): RateLimitResult {
  const now = Date.now();

  if (process.env.E2E_TEST === "true") {
    return {
      allowed: true,
      remaining: maxRequests,
      resetAt: now + windowMs,
      limit: maxRequests,
    };
  }

  cleanupExpiredEntries(now);

  const ip = getClientIp(request);
  const key = `${ip}:${route}`;
  const currentEntry = store.get(key);
  const entry =
    currentEntry && currentEntry.resetAt > now
      ? currentEntry
      : {
          count: 0,
          resetAt: now + windowMs,
        };

  entry.count += 1;
  store.set(key, entry);

  const remaining = Math.max(0, maxRequests - entry.count);

  return {
    allowed: entry.count <= maxRequests,
    remaining,
    resetAt: entry.resetAt,
    limit: maxRequests,
  };
}

export function createRateLimitHeaders(result: RateLimitResult) {
  return {
    "X-RateLimit-Limit": result.limit.toString(),
    "X-RateLimit-Remaining": result.remaining.toString(),
    "X-RateLimit-Reset": Math.ceil(result.resetAt / 1000).toString(),
  };
}

export function withRateLimitHeaders<T extends NextResponse>(
  response: T,
  result: RateLimitResult,
) {
  const headers = createRateLimitHeaders(result);

  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }

  return response;
}

export function rateLimitResponse(result: RateLimitResult) {
  const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));

  return NextResponse.json(
    {
      error: "Too many requests. Please try again later.",
      retryAfter,
    },
    {
      status: 429,
      headers: {
        ...createRateLimitHeaders(result),
        "Retry-After": retryAfter.toString(),
      },
    },
  );
}

export function clearRateLimitStore() {
  store.clear();
  lastCleanupAt = 0;
}
