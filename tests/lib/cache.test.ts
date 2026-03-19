import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Cache } from "../../src/lib/cache.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("Cache", () => {
  let tmpDir: string;
  let cache: Cache;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cache-test-"));
    cache = new Cache(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes and reads metric data for a date", async () => {
    const data = { date: "2026-01-15", total_active_users: 10 };
    await cache.writeMetric("enterprise", "my-ent", "2026-01-15", data);
    const result = await cache.readMetric("enterprise", "my-ent", "2026-01-15");
    expect(result).toEqual(data);
  });

  it("returns null for missing cache", async () => {
    const result = await cache.readMetric("enterprise", "my-ent", "2026-01-15");
    expect(result).toBeNull();
  });

  it("respects TTL for seats data", async () => {
    const data = { total_seats: 5, seats: [] };
    await cache.writeSeats("my-org", data);
    const fresh = await cache.readSeats("my-org", 3600000);
    expect(fresh).toEqual(data);
  });

  it("returns null for expired seats data", async () => {
    const data = { total_seats: 5, seats: [] };
    await cache.writeSeats("my-org", data);
    // TTL 0 means always expired
    const result = await cache.readSeats("my-org", 0);
    expect(result).toBeNull();
  });

  it("identifies today's metric as needing refresh", () => {
    const today = new Date().toISOString().split("T")[0];
    expect(cache.shouldRefreshMetric(today)).toBe(true);
  });

  it("identifies old metric as not needing refresh", () => {
    expect(cache.shouldRefreshMetric("2025-01-01")).toBe(false);
  });
});
