import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearRateLimitStore,
  rateLimit,
} from "@/lib/api/rate-limit";

function requestFromIp(ip: string) {
  return {
    headers: {
      "x-forwarded-for": ip,
    },
  };
}

describe("in-memory rate limiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    clearRateLimitStore();
  });

  afterEach(() => {
    clearRateLimitStore();
    vi.useRealTimers();
  });

  it("allows requests before the limit", () => {
    const first = rateLimit(requestFromIp("10.0.0.1"), {
      route: "test",
      windowMs: 1000,
      maxRequests: 2,
    });
    const second = rateLimit(requestFromIp("10.0.0.1"), {
      route: "test",
      windowMs: 1000,
      maxRequests: 2,
    });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(0);
  });

  it("blocks requests after the limit", () => {
    const options = {
      route: "test",
      windowMs: 1000,
      maxRequests: 1,
    };

    expect(rateLimit(requestFromIp("10.0.0.2"), options).allowed).toBe(true);
    expect(rateLimit(requestFromIp("10.0.0.2"), options).allowed).toBe(false);
  });

  it("resets after the window expires", () => {
    const options = {
      route: "test",
      windowMs: 1000,
      maxRequests: 1,
    };

    expect(rateLimit(requestFromIp("10.0.0.3"), options).allowed).toBe(true);
    expect(rateLimit(requestFromIp("10.0.0.3"), options).allowed).toBe(false);

    vi.setSystemTime(new Date("2026-01-01T00:00:01.001Z"));

    expect(rateLimit(requestFromIp("10.0.0.3"), options).allowed).toBe(true);
  });

  it("keeps separate IP and route keys isolated", () => {
    const options = {
      route: "test",
      windowMs: 1000,
      maxRequests: 1,
    };

    expect(rateLimit(requestFromIp("10.0.0.4"), options).allowed).toBe(true);
    expect(rateLimit(requestFromIp("10.0.0.5"), options).allowed).toBe(true);
    expect(
      rateLimit(requestFromIp("10.0.0.4"), {
        ...options,
        route: "other",
      }).allowed,
    ).toBe(true);
  });
});
