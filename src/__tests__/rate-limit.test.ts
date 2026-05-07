import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit, getClientIp } from "../lib/rate-limit";

describe("rateLimit (sliding window)", () => {
  // Use a unique key per test so the in-memory bucket doesn't bleed.
  let key = "";
  beforeEach(() => {
    key = `test-${Math.random().toString(36).slice(2)}`;
  });

  it("allows up to max in window, then denies", () => {
    for (let i = 0; i < 5; i++) {
      expect(rateLimit(key, 60_000, 5).allowed).toBe(true);
    }
    expect(rateLimit(key, 60_000, 5).allowed).toBe(false);
  });

  it("reports remaining count", () => {
    expect(rateLimit(key, 60_000, 3).remaining).toBe(2);
    expect(rateLimit(key, 60_000, 3).remaining).toBe(1);
    expect(rateLimit(key, 60_000, 3).remaining).toBe(0);
    const blocked = rateLimit(key, 60_000, 3);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterMs).toBeGreaterThanOrEqual(0);
  });

  it("treats different keys independently", () => {
    expect(rateLimit(`${key}:a`, 60_000, 1).allowed).toBe(true);
    expect(rateLimit(`${key}:b`, 60_000, 1).allowed).toBe(true);
    expect(rateLimit(`${key}:a`, 60_000, 1).allowed).toBe(false);
    expect(rateLimit(`${key}:b`, 60_000, 1).allowed).toBe(false);
  });
});

describe("getClientIp", () => {
  it("prefers X-Forwarded-For first hop", () => {
    const req = new Request("http://x", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to X-Real-IP", () => {
    const req = new Request("http://x", { headers: { "x-real-ip": "9.9.9.9" } });
    expect(getClientIp(req)).toBe("9.9.9.9");
  });

  it("returns 'unknown' when no headers are present", () => {
    const req = new Request("http://x");
    expect(getClientIp(req)).toBe("unknown");
  });
});
