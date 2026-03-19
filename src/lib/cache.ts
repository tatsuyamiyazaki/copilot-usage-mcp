import fs from "node:fs/promises";
import path from "node:path";
import type { CacheEntry, CopilotSeatsResponse } from "./types.js";

export class Cache {
  constructor(private readonly baseDir: string) {}

  async writeMetric(level: string, slug: string, date: string, data: unknown): Promise<void> {
    const filePath = this.metricPath(level, slug, date);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const entry: CacheEntry<unknown> = { data, cached_at: new Date().toISOString() };
    await fs.writeFile(filePath, JSON.stringify(entry, null, 2));
  }

  async readMetric(level: string, slug: string, date: string): Promise<unknown | null> {
    const filePath = this.metricPath(level, slug, date);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const entry: CacheEntry<unknown> = JSON.parse(raw);

      // 直近1日以内のデータは TTL 24時間
      if (this.isYesterday(date)) {
        const cachedAt = new Date(entry.cached_at).getTime();
        if (Date.now() - cachedAt > 24 * 60 * 60 * 1000) return null;
      }

      return entry.data;
    } catch {
      return null;
    }
  }

  shouldRefreshMetric(date: string): boolean {
    const today = new Date().toISOString().split("T")[0];
    return date >= today;
  }

  async writeSeats(org: string, data: CopilotSeatsResponse): Promise<void> {
    const filePath = this.seatsPath(org);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const entry: CacheEntry<CopilotSeatsResponse> = { data, cached_at: new Date().toISOString() };
    await fs.writeFile(filePath, JSON.stringify(entry, null, 2));
  }

  async readSeats(org: string, ttlMs: number): Promise<CopilotSeatsResponse | null> {
    const filePath = this.seatsPath(org);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const entry: CacheEntry<CopilotSeatsResponse> = JSON.parse(raw);
      const cachedAt = new Date(entry.cached_at).getTime();
      if (Date.now() - cachedAt > ttlMs) return null;
      return entry.data;
    } catch {
      return null;
    }
  }

  async readSeatsWithFallback(org: string, ttlMs: number): Promise<CopilotSeatsResponse | null> {
    const filePath = this.seatsPath(org);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const entry: CacheEntry<CopilotSeatsResponse> = JSON.parse(raw);
      return entry.data; // TTL 無視でフォールバック
    } catch {
      return null;
    }
  }

  private isYesterday(date: string): boolean {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    return date === yesterday.toISOString().split("T")[0];
  }

  private metricPath(level: string, slug: string, date: string): string {
    return path.join(this.baseDir, level, slug, "metrics", `${date}.json`);
  }

  private seatsPath(org: string): string {
    return path.join(this.baseDir, "org", org, "seats", "latest.json");
  }
}
