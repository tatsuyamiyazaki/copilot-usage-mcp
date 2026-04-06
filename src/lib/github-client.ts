import { Octokit } from "@octokit/rest";
import { Cache } from "./cache.js";
import type {
  UsageReport1DayResponse,
  UsageReport28DayResponse,
  UsageReportResult,
  UsageReportRangeResult,
  DayResult,
  CopilotSeatsResponse,
} from "./types.js";

const API_VERSION = "2026-03-10";

// 1-day TTL: 昨日のレポートは24時間でリフレッシュ
const TTL_YESTERDAY_MS = 24 * 60 * 60 * 1000;
// 28-day/latest TTL: 12時間（1日1回更新される）
const TTL_LATEST_MS = 12 * 60 * 60 * 1000;

export class GitHubClient {
  private octokit: Octokit;
  private cache: Cache;

  constructor(token: string, cache: Cache) {
    this.octokit = new Octokit({ auth: token });
    this.cache = cache;
  }

  /**
   * エンタープライズのメトリクスレポートを取得する。
   * day が指定された場合は 1-day エンドポイント、未指定の場合は 28-day/latest エンドポイントを使用。
   * reportKind: "aggregate" = 集計メトリクス / "users" = ユーザーレベルメトリクス
   */
  async fetchEnterpriseReport(
    enterprise: string,
    reportKind: "aggregate" | "users",
    day?: string,
    forceRefresh = false
  ): Promise<UsageReportResult> {
    const cacheSlug = `${enterprise}/${reportKind}`;
    const cacheKey = day ?? "latest";
    const ttlMs = day
      ? (this.isYesterday(day) ? TTL_YESTERDAY_MS : undefined)
      : TTL_LATEST_MS;

    if (!forceRefresh && !(day && this.isTodayOrFuture(day))) {
      const cached = await this.cache.readReport("enterprise", cacheSlug, cacheKey, ttlMs);
      if (cached) return cached as UsageReportResult;
    }

    const endpoint = this.buildEnterpriseEndpoint(reportKind, !!day);
    const params: Record<string, string> = { enterprise };
    if (day) params.day = day;

    const apiResponse = await this.callMetricsApi(endpoint, params);
    const content = await this.downloadReportContent(apiResponse.download_links);
    const result: UsageReportResult = { ...apiResponse, content };

    if (!day || !this.isTodayOrFuture(day)) {
      await this.cache.writeReport("enterprise", cacheSlug, cacheKey, result);
    }

    return result;
  }

  /**
   * Organization のメトリクスレポートを取得する。
   * day が指定された場合は 1-day エンドポイント、未指定の場合は 28-day/latest エンドポイントを使用。
   * reportKind: "aggregate" = 集計メトリクス / "users" = ユーザーレベルメトリクス
   */
  async fetchOrgReport(
    org: string,
    reportKind: "aggregate" | "users",
    day?: string,
    forceRefresh = false
  ): Promise<UsageReportResult> {
    const cacheSlug = `${org}/${reportKind}`;
    const cacheKey = day ?? "latest";
    const ttlMs = day
      ? (this.isYesterday(day) ? TTL_YESTERDAY_MS : undefined)
      : TTL_LATEST_MS;

    if (!forceRefresh && !(day && this.isTodayOrFuture(day))) {
      const cached = await this.cache.readReport("org", cacheSlug, cacheKey, ttlMs);
      if (cached) return cached as UsageReportResult;
    }

    const endpoint = this.buildOrgEndpoint(reportKind, !!day);
    const params: Record<string, string> = { org };
    if (day) params.day = day;

    const apiResponse = await this.callMetricsApi(endpoint, params);
    const content = await this.downloadReportContent(apiResponse.download_links);
    const result: UsageReportResult = { ...apiResponse, content };

    if (!day || !this.isTodayOrFuture(day)) {
      await this.cache.writeReport("org", cacheSlug, cacheKey, result);
    }

    return result;
  }

  /**
   * 日付範囲を指定して1日単位のレポートを並列取得する。
   * 各日について 1-day エンドポイントを呼び出し、結果をまとめて返す。
   */
  async fetchReportRange(
    level: "enterprise" | "org",
    identifier: string,
    reportKind: "aggregate" | "users",
    since: string,
    until: string,
    forceRefresh = false
  ): Promise<UsageReportRangeResult> {
    const dates = this.getDatesInRange(since, until);

    const settled = await Promise.allSettled(
      dates.map(date =>
        level === "enterprise"
          ? this.fetchEnterpriseReport(identifier, reportKind, date, forceRefresh)
          : this.fetchOrgReport(identifier, reportKind, date, forceRefresh)
      )
    );

    const results: DayResult[] = settled.map((r, i) =>
      r.status === "fulfilled"
        ? r.value
        : { report_day: dates[i], error: r.reason instanceof Error ? r.reason.message : String(r.reason) }
    );

    return { since, until, results };
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
            headers: { "X-GitHub-Api-Version": API_VERSION },
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
      const fallback = await this.cache.readSeatsWithFallback(org);
      if (fallback) return fallback;
      throw error;
    }
  }

  private buildEnterpriseEndpoint(reportKind: "aggregate" | "users", isOneDay: boolean): string {
    if (reportKind === "aggregate") {
      return isOneDay
        ? "GET /enterprises/{enterprise}/copilot/metrics/reports/enterprise-1-day"
        : "GET /enterprises/{enterprise}/copilot/metrics/reports/enterprise-28-day/latest";
    }
    return isOneDay
      ? "GET /enterprises/{enterprise}/copilot/metrics/reports/users-1-day"
      : "GET /enterprises/{enterprise}/copilot/metrics/reports/users-28-day/latest";
  }

  private buildOrgEndpoint(reportKind: "aggregate" | "users", isOneDay: boolean): string {
    if (reportKind === "aggregate") {
      return isOneDay
        ? "GET /orgs/{org}/copilot/metrics/reports/organization-1-day"
        : "GET /orgs/{org}/copilot/metrics/reports/organization-28-day/latest";
    }
    return isOneDay
      ? "GET /orgs/{org}/copilot/metrics/reports/users-1-day"
      : "GET /orgs/{org}/copilot/metrics/reports/users-28-day/latest";
  }

  private async callMetricsApi(
    endpoint: string,
    params: Record<string, string>
  ): Promise<UsageReport1DayResponse | UsageReport28DayResponse> {
    return this.requestWithRetry(async () => {
      const response = await this.octokit.request(endpoint, {
        ...params,
        headers: { "X-GitHub-Api-Version": API_VERSION },
      });
      // 204 No Content: データなし
      if (!response.data) {
        const isOneDay = "day" in params;
        if (isOneDay) {
          return { download_links: [], report_day: params.day } as UsageReport1DayResponse;
        }
        return { download_links: [], report_start_day: "", report_end_day: "" } as UsageReport28DayResponse;
      }
      return response.data as UsageReport1DayResponse | UsageReport28DayResponse;
    });
  }

  private async downloadReportContent(links: string[]): Promise<unknown[]> {
    const results: unknown[] = [];
    for (const link of links) {
      try {
        const response = await fetch(link);
        if (!response.ok) {
          results.push({ error: `HTTP ${response.status}: ${response.statusText}`, url: link });
          continue;
        }
        const text = await response.text();
        try {
          results.push(JSON.parse(text));
        } catch {
          results.push(text);
        }
      } catch (error) {
        results.push({ error: error instanceof Error ? error.message : String(error), url: link });
      }
    }
    return results;
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

  private isTodayOrFuture(date: string): boolean {
    const today = new Date().toISOString().split("T")[0];
    return date >= today;
  }

  private isYesterday(date: string): boolean {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    return date === yesterday.toISOString().split("T")[0];
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
            `Ensure your token has the required scopes: manage_billing:copilot, read:enterprise, read:org`
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

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
