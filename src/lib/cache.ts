import fs from "node:fs/promises";
import path from "node:path";
import type { CacheEntry, CopilotSeatsResponse } from "./types.js";

export class Cache {
  constructor(private readonly baseDir: string) {}

  async writeReport(level: string, slug: string, key: string, data: unknown): Promise<void> {
    const filePath = this.reportPath(level, slug, key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const entry: CacheEntry<unknown> = { data, cached_at: new Date().toISOString() };
    await fs.writeFile(filePath, JSON.stringify(entry, null, 2));
  }

  async readReport(level: string, slug: string, key: string, ttlMs?: number): Promise<unknown | null> {
    const filePath = this.reportPath(level, slug, key);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const entry: CacheEntry<unknown> = JSON.parse(raw);
      if (ttlMs !== undefined) {
        const cachedAt = new Date(entry.cached_at).getTime();
        if (Date.now() - cachedAt > ttlMs) return null;
      }
      return entry.data;
    } catch {
      return null;
    }
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

  async readSeatsWithFallback(org: string): Promise<CopilotSeatsResponse | null> {
    const filePath = this.seatsPath(org);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const entry: CacheEntry<CopilotSeatsResponse> = JSON.parse(raw);
      return entry.data;
    } catch {
      return null;
    }
  }

  private reportPath(level: string, slug: string, key: string): string {
    return path.join(this.baseDir, level, slug, "reports", `${key}.json`);
  }

  private seatsPath(org: string): string {
    return path.join(this.baseDir, "org", org, "seats", "latest.json");
  }
}
