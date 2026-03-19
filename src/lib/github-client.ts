import { Octokit } from "@octokit/rest";
import { Cache } from "./cache.js";
import type { CopilotMetricsDay, CopilotSeatsResponse } from "./types.js";

export interface DateChunk {
  since: string;
  until: string;
}

export function splitIntoChunks(since: string, until: string): DateChunk[] {
  const chunks: DateChunk[] = [];
  let current = new Date(since + "T00:00:00Z");
  const end = new Date(until + "T00:00:00Z");

  while (current <= end) {
    const chunkEnd = new Date(current);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + 27); // 28 days inclusive
    const actualEnd = chunkEnd > end ? end : chunkEnd;

    chunks.push({
      since: current.toISOString().split("T")[0],
      until: actualEnd.toISOString().split("T")[0],
    });

    current = new Date(actualEnd);
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return chunks;
}

export class GitHubClient {
  private octokit: Octokit;
  private cache: Cache;

  constructor(token: string, cache: Cache) {
    this.octokit = new Octokit({ auth: token });
    this.cache = cache;
  }

  async fetchMetrics(
    level: "enterprise" | "org" | "team",
    slug: string,
    since: string,
    until: string,
    forceRefresh: boolean,
    apiParams: { identifier: string; teamSlug?: string }
  ): Promise<CopilotMetricsDay[]> {
    const chunks = splitIntoChunks(since, until);
    const allMetrics: CopilotMetricsDay[] = [];

    for (const chunk of chunks) {
      const daysInChunk = this.getDatesInRange(chunk.since, chunk.until);
      const cachedDays: CopilotMetricsDay[] = [];
      const uncachedDates: string[] = [];

      if (!forceRefresh) {
        for (const date of daysInChunk) {
          if (this.cache.shouldRefreshMetric(date)) {
            uncachedDates.push(date);
            continue;
          }
          const cached = await this.cache.readMetric(level, slug, date);
          if (cached) {
            cachedDays.push(cached as CopilotMetricsDay);
          } else {
            uncachedDates.push(date);
          }
        }
      } else {
        uncachedDates.push(...daysInChunk);
      }

      if (uncachedDates.length > 0) {
        try {
          const apiData = await this.callMetricsApi(level, chunk.since, chunk.until, apiParams);
          for (const day of apiData) {
            await this.cache.writeMetric(level, slug, day.date, day);
          }
          allMetrics.push(...cachedDays, ...apiData.filter(d => daysInChunk.includes(d.date)));
        } catch (error) {
          // ネットワークエラー時: キャッシュにあるデータだけでも返す
          if (cachedDays.length > 0) {
            allMetrics.push(...cachedDays);
          } else {
            throw error;
          }
        }
      } else {
        allMetrics.push(...cachedDays);
      }
    }

    return allMetrics.sort((a, b) => a.date.localeCompare(b.date));
  }

  private async callMetricsApi(
    level: "enterprise" | "org" | "team",
    since: string,
    until: string,
    apiParams: { identifier: string; teamSlug?: string }
  ): Promise<CopilotMetricsDay[]> {
    const params: Record<string, string | number> = {
      since: since + "T00:00:00Z",
      until: until + "T23:59:59Z",
      per_page: 100,
    };

    let url: string;
    if (level === "enterprise") {
      url = "GET /enterprises/{enterprise}/copilot/metrics";
      params.enterprise = apiParams.identifier;
    } else if (level === "team" && apiParams.teamSlug) {
      url = "GET /orgs/{org}/team/{team_slug}/copilot/metrics";
      params.org = apiParams.identifier;
      params.team_slug = apiParams.teamSlug;
    } else {
      url = "GET /orgs/{org}/copilot/metrics";
      params.org = apiParams.identifier;
    }

    return await this.requestWithRetry(async () => {
      const response = await this.octokit.request(url, params);
      return response.data as CopilotMetricsDay[];
    });
  }

  async fetchSeats(org: string, forceRefresh: boolean): Promise<CopilotSeatsResponse> {
    if (!forceRefresh) {
      const cached = await this.cache.readSeats(org, 60 * 60 * 1000);
      if (cached) return cached;
    }

    try {
      const allSeats: CopilotSeatsResponse["seats"] = [];
      let page = 1;
      let totalSeats = 0;

      while (true) {
        const data = await this.requestWithRetry(async () => {
          const response = await this.octokit.request("GET /orgs/{org}/copilot/billing/seats", {
            org,
            page,
            per_page: 100,
          });
          return response.data as CopilotSeatsResponse;
        });
        totalSeats = data.total_seats;
        allSeats.push(...data.seats);

        if (allSeats.length >= totalSeats) break;
        page++;
      }

      const result: CopilotSeatsResponse = { total_seats: totalSeats, seats: allSeats };
      await this.cache.writeSeats(org, result);
      return result;
    } catch (error) {
      // ネットワークエラー時はキャッシュからフォールバック
      const fallback = await this.cache.readSeatsWithFallback(org, 0);
      if (fallback) return fallback;
      throw error;
    }
  }

  private async requestWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        const status = error.status ?? error.response?.status;

        if (status === 401 || status === 403) {
          throw new Error(
            `Authentication/authorization error (${status}). ` +
            `Ensure your token has scopes: manage_billing:copilot, read:enterprise, read:org`
          );
        }
        if (status === 404) {
          throw new Error(`Resource not found (404): ${error.message}`);
        }

        if (attempt === maxRetries) throw error;

        if (status === 429) {
          const retryAfter = parseInt(error.response?.headers?.["retry-after"] ?? "60", 10);
          await this.sleep(retryAfter * 1000);
        } else if (status >= 500) {
          await this.sleep(Math.pow(2, attempt) * 1000);
        } else {
          throw error;
        }
      }
    }
    throw new Error("Unreachable");
  }

  private getDatesInRange(since: string, until: string): string[] {
    const dates: string[] = [];
    const current = new Date(since + "T00:00:00Z");
    const end = new Date(until + "T00:00:00Z");
    while (current <= end) {
      dates.push(current.toISOString().split("T")[0]);
      current.setUTCDate(current.getUTCDate() + 1);
    }
    return dates;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
