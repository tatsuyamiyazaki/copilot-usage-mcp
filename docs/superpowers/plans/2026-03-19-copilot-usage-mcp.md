# GitHub Copilot Usage MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GitHub Enterprise Cloud の Copilot 利用状況を取得する MCP サーバーを Node.js + TypeScript で構築する

**Architecture:** stdio トランスポートの MCP サーバー。5つのツールを提供し、GitHub Copilot Metrics API と Billing API を呼び出す。28日超の期間は自動分割し、ローカルJSONファイルにキャッシュする。

**Tech Stack:** Node.js, TypeScript, @modelcontextprotocol/sdk, @octokit/rest, zod

**Spec:** `docs/superpowers/specs/2026-03-19-copilot-usage-mcp-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json` | 依存関係・スクリプト定義 |
| `tsconfig.json` | TypeScript 設定 |
| `.gitignore` | cache/, node_modules/, dist/, .env |
| `.env.example` | 環境変数テンプレート |
| `src/index.ts` | MCP サーバー起動、ツール登録 |
| `src/lib/types.ts` | 型定義（API レスポンス、キャッシュ） |
| `src/lib/cache.ts` | キャッシュ読み書き（日別JSON、TTL判定） |
| `src/lib/github-client.ts` | Octokit ラッパー、28日分割、リトライ |
| `src/lib/validation.ts` | 入力バリデーション（日付形式、範囲チェック） |
| `src/tools/enterprise.ts` | get_copilot_metrics_for_enterprise ツール |
| `src/tools/org.ts` | get_copilot_metrics_for_org ツール |
| `src/tools/team.ts` | get_copilot_metrics_for_team ツール |
| `src/tools/seats.ts` | get_copilot_seat_assignments ツール |
| `src/tools/summary.ts` | get_copilot_usage_summary ツール |
| `tests/lib/cache.test.ts` | キャッシュのユニットテスト |
| `tests/lib/github-client.test.ts` | GitHub クライアントのユニットテスト |
| `tests/lib/validation.test.ts` | バリデーションのユニットテスト |

---

### Task 1: プロジェクト初期化

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: npm init と依存関係インストール**

```bash
cd C:/Users/t_miyazaki/Dev/mcp/copilot-usage
npm init -y
npm install @modelcontextprotocol/sdk zod @octokit/rest dotenv
npm install -D typescript @types/node vitest
```

- [ ] **Step 2: tsconfig.json を作成**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: package.json にスクリプトと type: module を追加**

`package.json` に以下を追加:
```json
{
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 4: .gitignore を作成**

```
node_modules/
dist/
cache/
.env
```

- [ ] **Step 5: .env.example を作成**

```
GITHUB_TOKEN=ghp_xxxx
GITHUB_ENTERPRISE=my-enterprise
GITHUB_ORG=my-org
CACHE_DIR=./cache
```

- [ ] **Step 6: コミット**

```bash
git add package.json package-lock.json tsconfig.json .gitignore .env.example
git commit -m "chore: initialize project with dependencies"
```

---

### Task 2: 型定義 (`src/lib/types.ts`)

**Files:**
- Create: `src/lib/types.ts`

- [ ] **Step 1: 型定義ファイルを作成**

```typescript
// GitHub Copilot Metrics API のレスポンス型

export interface CopilotMetricsDay {
  date: string;
  total_active_users: number;
  total_engaged_users: number;
  copilot_ide_code_completions: CopilotIdeCodeCompletions | null;
  copilot_ide_chat: CopilotIdeChat | null;
  copilot_dotcom_chat: CopilotDotcomChat | null;
  copilot_dotcom_pull_requests: CopilotDotcomPullRequests | null;
}

export interface CopilotIdeCodeCompletions {
  active_users: number;
  engaged_users: number;
  languages: CopilotLanguageMetric[];
  editors: CopilotEditorMetric[];
  models: CopilotModelMetric[];
}

export interface CopilotIdeChat {
  active_users: number;
  engaged_users: number;
  editors: CopilotEditorMetric[];
  models: CopilotModelMetric[];
}

export interface CopilotDotcomChat {
  active_users: number;
  engaged_users: number;
  models: CopilotModelMetric[];
}

export interface CopilotDotcomPullRequests {
  active_users: number;
  engaged_users: number;
  repositories: CopilotRepositoryMetric[];
}

export interface CopilotLanguageMetric {
  name: string;
  total_engaged_users: number;
  total_code_suggestions?: number;
  total_code_acceptances?: number;
  total_code_lines_suggested?: number;
  total_code_lines_accepted?: number;
}

export interface CopilotEditorMetric {
  name: string;
  total_engaged_users: number;
  total_code_suggestions?: number;
  total_code_acceptances?: number;
}

export interface CopilotModelMetric {
  name: string;
  total_engaged_users: number;
  total_code_suggestions?: number;
  total_code_acceptances?: number;
}

export interface CopilotRepositoryMetric {
  name: string;
  total_engaged_users: number;
  total_pr_descriptions_generated?: number;
  total_pr_summaries_generated?: number;
}

// Seats API
export interface CopilotSeatsResponse {
  total_seats: number;
  seats: CopilotSeat[];
}

export interface CopilotSeat {
  assignee: {
    login: string;
    id: number;
    avatar_url: string;
    type: string;
  };
  organization?: {
    login: string;
    id: number;
  };
  assigning_team?: {
    name: string;
    slug: string;
  } | null;
  pending_cancellation_date: string | null;
  last_activity_at: string | null;
  last_activity_editor: string | null;
  created_at: string;
  plan_type: string;
}

// Cache
export interface CacheEntry<T> {
  data: T;
  cached_at: string; // ISO 8601
}

// Summary
export interface UsageSummary {
  enterprise: CopilotMetricsDay[] | { error: string };
  org: CopilotMetricsDay[] | { error: string };
  seats: CopilotSeatsResponse | { error: string };
  team?: CopilotMetricsDay[] | { error: string };
}
```

- [ ] **Step 2: コミット**

```bash
git add src/lib/types.ts
git commit -m "feat: add type definitions for Copilot API responses and cache"
```

---

### Task 3: バリデーション (`src/lib/validation.ts`)

**Files:**
- Create: `src/lib/validation.ts`
- Create: `tests/lib/validation.test.ts`

- [ ] **Step 1: テストを作成**

```typescript
import { describe, it, expect } from "vitest";
import { validateDateRange, validateDateFormat, validateTeamSlug } from "../../src/lib/validation.js";

describe("validateDateFormat", () => {
  it("accepts valid YYYY-MM-DD", () => {
    expect(validateDateFormat("2026-01-15")).toBe(true);
  });

  it("rejects invalid format", () => {
    expect(validateDateFormat("2026/01/15")).toBe(false);
    expect(validateDateFormat("not-a-date")).toBe(false);
    expect(validateDateFormat("2026-13-01")).toBe(false);
    expect(validateDateFormat("2026-01-32")).toBe(false);
  });
});

describe("validateDateRange", () => {
  it("accepts since before until", () => {
    expect(() => validateDateRange("2026-01-01", "2026-01-31")).not.toThrow();
  });

  it("throws when since is after until", () => {
    expect(() => validateDateRange("2026-02-01", "2026-01-01")).toThrow();
  });
});

describe("validateTeamSlug", () => {
  it("accepts valid slug", () => {
    expect(() => validateTeamSlug("my-team")).not.toThrow();
  });

  it("throws on empty string", () => {
    expect(() => validateTeamSlug("")).toThrow();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npx vitest run tests/lib/validation.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 3: バリデーション実装**

```typescript
export function validateDateFormat(date: string): boolean {
  const regex = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  if (!regex.test(date)) return false;
  const parsed = new Date(date + "T00:00:00Z");
  return !isNaN(parsed.getTime());
}

export function validateDateRange(since: string, until: string): void {
  if (!validateDateFormat(since)) {
    throw new Error(`Invalid date format for 'since': ${since}. Use YYYY-MM-DD.`);
  }
  if (!validateDateFormat(until)) {
    throw new Error(`Invalid date format for 'until': ${until}. Use YYYY-MM-DD.`);
  }
  if (since > until) {
    throw new Error(`'since' (${since}) must not be after 'until' (${until}).`);
  }
}

export function validateTeamSlug(slug: string): void {
  if (!slug || slug.trim().length === 0) {
    throw new Error("'team_slug' is required and cannot be empty.");
  }
}
```

- [ ] **Step 4: テスト通過を確認**

```bash
npx vitest run tests/lib/validation.test.ts
```

Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/lib/validation.ts tests/lib/validation.test.ts
git commit -m "feat: add input validation for dates and team slug"
```

---

### Task 4: キャッシュ (`src/lib/cache.ts`)

**Files:**
- Create: `src/lib/cache.ts`
- Create: `tests/lib/cache.test.ts`

- [ ] **Step 1: テストを作成**

```typescript
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
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npx vitest run tests/lib/cache.test.ts
```

Expected: FAIL

- [ ] **Step 3: キャッシュ実装**

```typescript
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
```

- [ ] **Step 4: テスト通過を確認**

```bash
npx vitest run tests/lib/cache.test.ts
```

Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/lib/cache.ts tests/lib/cache.test.ts
git commit -m "feat: add file-based cache with TTL support"
```

---

### Task 5: GitHub クライアント (`src/lib/github-client.ts`)

**Files:**
- Create: `src/lib/github-client.ts`
- Create: `tests/lib/github-client.test.ts`

- [ ] **Step 1: 28日チャンク分割ロジックのテストを作成**

```typescript
import { describe, it, expect } from "vitest";
import { splitIntoChunks } from "../../src/lib/github-client.js";

describe("splitIntoChunks", () => {
  it("returns single chunk for <= 28 days", () => {
    const chunks = splitIntoChunks("2026-01-01", "2026-01-28");
    expect(chunks).toEqual([{ since: "2026-01-01", until: "2026-01-28" }]);
  });

  it("splits into multiple chunks for > 28 days", () => {
    const chunks = splitIntoChunks("2026-01-01", "2026-03-01");
    expect(chunks.length).toBe(3);
    expect(chunks[0]).toEqual({ since: "2026-01-01", until: "2026-01-28" });
    expect(chunks[1]).toEqual({ since: "2026-01-29", until: "2026-02-25" });
    expect(chunks[2]).toEqual({ since: "2026-02-26", until: "2026-03-01" });
  });

  it("handles exact 28-day boundary", () => {
    const chunks = splitIntoChunks("2026-01-01", "2026-01-28");
    expect(chunks).toHaveLength(1);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npx vitest run tests/lib/github-client.test.ts
```

Expected: FAIL

- [ ] **Step 3: GitHub クライアント実装**

```typescript
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
```

- [ ] **Step 4: テスト通過を確認**

```bash
npx vitest run tests/lib/github-client.test.ts
```

Expected: PASS (splitIntoChunks のテストのみ)

- [ ] **Step 5: コミット**

```bash
git add src/lib/github-client.ts tests/lib/github-client.test.ts
git commit -m "feat: add GitHub client with 28-day chunking and retry logic"
```

---

### Task 6: ツール実装 — Enterprise (`src/tools/enterprise.ts`)

**Files:**
- Create: `src/tools/enterprise.ts`

- [ ] **Step 1: Enterprise ツール実装**

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GitHubClient } from "../lib/github-client.js";
import { validateDateRange } from "../lib/validation.js";

export function registerEnterpriseTool(server: McpServer, client: GitHubClient, defaultEnterprise: string) {
  server.tool(
    "get_copilot_metrics_for_enterprise",
    "Get daily Copilot usage metrics for the entire GitHub Enterprise (code completions, chat usage, active users, language/editor breakdown)",
    {
      enterprise: z.string().optional().describe("Enterprise slug (defaults to GITHUB_ENTERPRISE env var)"),
      since: z.string().optional().describe("Start date in YYYY-MM-DD format (defaults to 28 days ago)"),
      until: z.string().optional().describe("End date in YYYY-MM-DD format (defaults to today)"),
      force_refresh: z.boolean().optional().describe("Ignore cache and fetch fresh data"),
    },
    async ({ enterprise, since, until, force_refresh }) => {
      try {
        const ent = enterprise ?? defaultEnterprise;
        if (!ent) {
          return { content: [{ type: "text", text: "Enterprise slug is required. Set GITHUB_ENTERPRISE or pass 'enterprise' parameter." }], isError: true };
        }

        const today = new Date().toISOString().split("T")[0];
        const defaultSince = new Date();
        defaultSince.setUTCDate(defaultSince.getUTCDate() - 28);
        const s = since ?? defaultSince.toISOString().split("T")[0];
        const u = until ?? today;

        validateDateRange(s, u);

        const metrics = await client.fetchMetrics("enterprise", ent, s, u, force_refresh ?? false, { identifier: ent });

        return { content: [{ type: "text", text: JSON.stringify(metrics, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );
}
```

- [ ] **Step 2: コミット**

```bash
git add src/tools/enterprise.ts
git commit -m "feat: add enterprise metrics tool"
```

---

### Task 7: ツール実装 — Org (`src/tools/org.ts`)

**Files:**
- Create: `src/tools/org.ts`

- [ ] **Step 1: Org ツール実装**

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GitHubClient } from "../lib/github-client.js";
import { validateDateRange } from "../lib/validation.js";

export function registerOrgTool(server: McpServer, client: GitHubClient, defaultOrg: string) {
  server.tool(
    "get_copilot_metrics_for_org",
    "Get daily Copilot usage metrics for a GitHub Organization (code completions, chat usage, active users, language/editor breakdown)",
    {
      org: z.string().optional().describe("Organization name (defaults to GITHUB_ORG env var)"),
      since: z.string().optional().describe("Start date in YYYY-MM-DD format (defaults to 28 days ago)"),
      until: z.string().optional().describe("End date in YYYY-MM-DD format (defaults to today)"),
      force_refresh: z.boolean().optional().describe("Ignore cache and fetch fresh data"),
    },
    async ({ org, since, until, force_refresh }) => {
      try {
        const o = org ?? defaultOrg;
        if (!o) {
          return { content: [{ type: "text", text: "Organization name is required. Set GITHUB_ORG or pass 'org' parameter." }], isError: true };
        }

        const today = new Date().toISOString().split("T")[0];
        const defaultSince = new Date();
        defaultSince.setUTCDate(defaultSince.getUTCDate() - 28);
        const s = since ?? defaultSince.toISOString().split("T")[0];
        const u = until ?? today;

        validateDateRange(s, u);

        const metrics = await client.fetchMetrics("org", o, s, u, force_refresh ?? false, { identifier: o });

        return { content: [{ type: "text", text: JSON.stringify(metrics, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );
}
```

- [ ] **Step 2: コミット**

```bash
git add src/tools/org.ts
git commit -m "feat: add org metrics tool"
```

---

### Task 8: ツール実装 — Team (`src/tools/team.ts`)

**Files:**
- Create: `src/tools/team.ts`

- [ ] **Step 1: Team ツール実装**

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GitHubClient } from "../lib/github-client.js";
import { validateDateRange, validateTeamSlug } from "../lib/validation.js";

export function registerTeamTool(server: McpServer, client: GitHubClient, defaultOrg: string) {
  server.tool(
    "get_copilot_metrics_for_team",
    "Get daily Copilot usage metrics for a specific team within an Organization",
    {
      org: z.string().optional().describe("Organization name (defaults to GITHUB_ORG env var)"),
      team_slug: z.string().describe("Team slug (required)"),
      since: z.string().optional().describe("Start date in YYYY-MM-DD format (defaults to 28 days ago)"),
      until: z.string().optional().describe("End date in YYYY-MM-DD format (defaults to today)"),
      force_refresh: z.boolean().optional().describe("Ignore cache and fetch fresh data"),
    },
    async ({ org, team_slug, since, until, force_refresh }) => {
      try {
        const o = org ?? defaultOrg;
        if (!o) {
          return { content: [{ type: "text", text: "Organization name is required. Set GITHUB_ORG or pass 'org' parameter." }], isError: true };
        }
        validateTeamSlug(team_slug);

        const today = new Date().toISOString().split("T")[0];
        const defaultSince = new Date();
        defaultSince.setUTCDate(defaultSince.getUTCDate() - 28);
        const s = since ?? defaultSince.toISOString().split("T")[0];
        const u = until ?? today;

        validateDateRange(s, u);

        const cacheSlug = `${o}/${team_slug}`;
        const metrics = await client.fetchMetrics("team", cacheSlug, s, u, force_refresh ?? false, { identifier: o, teamSlug: team_slug });

        return { content: [{ type: "text", text: JSON.stringify(metrics, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );
}
```

- [ ] **Step 2: コミット**

```bash
git add src/tools/team.ts
git commit -m "feat: add team metrics tool"
```

---

### Task 9: ツール実装 — Seats (`src/tools/seats.ts`)

**Files:**
- Create: `src/tools/seats.ts`

- [ ] **Step 1: Seats ツール実装**

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GitHubClient } from "../lib/github-client.js";

export function registerSeatsTool(server: McpServer, client: GitHubClient, defaultOrg: string) {
  server.tool(
    "get_copilot_seat_assignments",
    "Get Copilot seat assignments for an Organization (user list with last activity date, editor info, plan type)",
    {
      org: z.string().optional().describe("Organization name (defaults to GITHUB_ORG env var)"),
      force_refresh: z.boolean().optional().describe("Ignore cache and fetch fresh data"),
    },
    async ({ org, force_refresh }) => {
      try {
        const o = org ?? defaultOrg;
        if (!o) {
          return { content: [{ type: "text", text: "Organization name is required. Set GITHUB_ORG or pass 'org' parameter." }], isError: true };
        }

        const seats = await client.fetchSeats(o, force_refresh ?? false);

        return { content: [{ type: "text", text: JSON.stringify(seats, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );
}
```

- [ ] **Step 2: コミット**

```bash
git add src/tools/seats.ts
git commit -m "feat: add seat assignments tool"
```

---

### Task 10: ツール実装 — Summary (`src/tools/summary.ts`)

**Files:**
- Create: `src/tools/summary.ts`

- [ ] **Step 1: Summary ツール実装**

```typescript
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GitHubClient } from "../lib/github-client.js";
import { validateDateRange, validateTeamSlug } from "../lib/validation.js";
import type { UsageSummary } from "../lib/types.js";

export function registerSummaryTool(
  server: McpServer,
  client: GitHubClient,
  defaultEnterprise: string,
  defaultOrg: string
) {
  server.tool(
    "get_copilot_usage_summary",
    "Get a combined summary of Copilot usage across Enterprise, Organization, and seat assignments. Optionally include team-level metrics.",
    {
      since: z.string().optional().describe("Start date in YYYY-MM-DD format (defaults to 28 days ago)"),
      until: z.string().optional().describe("End date in YYYY-MM-DD format (defaults to today)"),
      team_slug: z.string().optional().describe("Team slug to include team-level metrics"),
      force_refresh: z.boolean().optional().describe("Ignore cache and fetch fresh data"),
    },
    async ({ since, until, team_slug, force_refresh }) => {
      try {
        const today = new Date().toISOString().split("T")[0];
        const defaultSince = new Date();
        defaultSince.setUTCDate(defaultSince.getUTCDate() - 28);
        const s = since ?? defaultSince.toISOString().split("T")[0];
        const u = until ?? today;
        const fr = force_refresh ?? false;

        validateDateRange(s, u);
        if (team_slug) validateTeamSlug(team_slug);

        const summary: UsageSummary = {
          enterprise: { error: "Not configured" },
          org: { error: "Not configured" },
          seats: { error: "Not configured" },
        };

        // Enterprise metrics
        if (defaultEnterprise) {
          try {
            summary.enterprise = await client.fetchMetrics("enterprise", defaultEnterprise, s, u, fr, { identifier: defaultEnterprise });
          } catch (e) {
            summary.enterprise = { error: e instanceof Error ? e.message : String(e) };
          }
        }

        // Org metrics
        if (defaultOrg) {
          try {
            summary.org = await client.fetchMetrics("org", defaultOrg, s, u, fr, { identifier: defaultOrg });
          } catch (e) {
            summary.org = { error: e instanceof Error ? e.message : String(e) };
          }

          // Seats
          try {
            summary.seats = await client.fetchSeats(defaultOrg, fr);
          } catch (e) {
            summary.seats = { error: e instanceof Error ? e.message : String(e) };
          }
        }

        // Team metrics (optional)
        if (team_slug && defaultOrg) {
          try {
            const cacheSlug = `${defaultOrg}/${team_slug}`;
            summary.team = await client.fetchMetrics("team", cacheSlug, s, u, fr, { identifier: defaultOrg, teamSlug: team_slug });
          } catch (e) {
            summary.team = { error: e instanceof Error ? e.message : String(e) };
          }
        }

        return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );
}
```

- [ ] **Step 2: コミット**

```bash
git add src/tools/summary.ts
git commit -m "feat: add usage summary tool"
```

---

### Task 11: エントリポイント (`src/index.ts`)

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: MCP サーバーのエントリポイントを実装**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Cache } from "./lib/cache.js";
import { GitHubClient } from "./lib/github-client.js";
import { registerEnterpriseTool } from "./tools/enterprise.js";
import { registerOrgTool } from "./tools/org.js";
import { registerTeamTool } from "./tools/team.js";
import { registerSeatsTool } from "./tools/seats.js";
import { registerSummaryTool } from "./tools/summary.js";

config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error("GITHUB_TOKEN environment variable is required");
  process.exit(1);
}

const enterprise = process.env.GITHUB_ENTERPRISE ?? "";
const org = process.env.GITHUB_ORG ?? "";
const cacheDir = process.env.CACHE_DIR
  ? path.resolve(process.env.CACHE_DIR)
  : path.join(projectRoot, "cache");

const cache = new Cache(cacheDir);
const client = new GitHubClient(token, cache);

const server = new McpServer({
  name: "copilot-usage",
  version: "1.0.0",
});

registerEnterpriseTool(server, client, enterprise);
registerOrgTool(server, client, org);
registerTeamTool(server, client, org);
registerSeatsTool(server, client, org);
registerSummaryTool(server, client, enterprise, org);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Copilot Usage MCP server started");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
```

- [ ] **Step 2: ビルド確認**

```bash
npm run build
```

Expected: コンパイル成功、`dist/` にファイル生成

- [ ] **Step 3: コミット**

```bash
git add src/index.ts
git commit -m "feat: add MCP server entry point with tool registration"
```

---

### Task 12: 全体テスト・動作確認

**Files:**
- (既存ファイルの修正のみ)

- [ ] **Step 1: 全テスト実行**

```bash
npm test
```

Expected: 全テスト PASS

- [ ] **Step 2: ビルド確認**

```bash
npm run build
```

Expected: コンパイル成功

- [ ] **Step 3: Claude Desktop 設定例を README 代わりに .env.example に追記**

`.env.example` の末尾に以下を追記:

```
# Claude Desktop config example (claude_desktop_config.json):
# {
#   "mcpServers": {
#     "copilot-usage": {
#       "command": "node",
#       "args": ["C:/path/to/copilot-usage/dist/index.js"],
#       "env": {
#         "GITHUB_TOKEN": "ghp_xxxx",
#         "GITHUB_ENTERPRISE": "my-enterprise",
#         "GITHUB_ORG": "my-org"
#       }
#     }
#   }
# }
```

- [ ] **Step 4: 最終コミット**

```bash
git add -A
git commit -m "chore: finalize project setup and configuration"
```
