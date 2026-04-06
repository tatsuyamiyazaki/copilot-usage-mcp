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

  it("writes and reads report data for a date", async () => {
    const data = { download_links: [], report_day: "2026-01-15", content: [] };
    await cache.writeReport("enterprise", "my-ent/aggregate", "2026-01-15", data);
    const result = await cache.readReport("enterprise", "my-ent/aggregate", "2026-01-15");
    expect(result).toEqual(data);
  });

  it("returns null for missing cache", async () => {
    const result = await cache.readReport("enterprise", "my-ent/aggregate", "2026-01-15");
    expect(result).toBeNull();
  });

  it("respects TTL for report data", async () => {
    const data = { download_links: [], report_start_day: "2026-01-01", report_end_day: "2026-01-28", content: [] };
    await cache.writeReport("enterprise", "my-ent/aggregate", "latest", data);
    const fresh = await cache.readReport("enterprise", "my-ent/aggregate", "latest", 12 * 60 * 60 * 1000);
    expect(fresh).toEqual(data);
  });

  it("returns null for expired report data", async () => {
    const data = { download_links: [], report_start_day: "2026-01-01", report_end_day: "2026-01-28", content: [] };
    await cache.writeReport("enterprise", "my-ent/aggregate", "latest", data);
    const result = await cache.readReport("enterprise", "my-ent/aggregate", "latest", 0);
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
    const result = await cache.readSeats("my-org", 0);
    expect(result).toBeNull();
  });
});
