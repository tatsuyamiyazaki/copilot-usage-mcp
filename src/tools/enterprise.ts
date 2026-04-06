import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GitHubClient } from "../lib/github-client.js";
import { validateDateFormat, validateDateRange } from "../lib/validation.js";

function buildEnterpriseHandler(
  client: GitHubClient,
  defaultEnterprise: string,
  reportKind: "aggregate" | "users"
) {
  return async ({
    enterprise,
    day,
    since,
    until,
    force_refresh,
  }: {
    enterprise?: string;
    day?: string;
    since?: string;
    until?: string;
    force_refresh?: boolean;
  }) => {
    try {
      const ent = enterprise ?? defaultEnterprise;
      if (!ent) {
        return { content: [{ type: "text" as const, text: "Enterprise slug is required. Set GITHUB_ENTERPRISE or pass 'enterprise' parameter." }], isError: true };
      }

      const fr = force_refresh ?? false;

      // 日付範囲モード
      if (since || until) {
        const today = new Date().toISOString().split("T")[0];
        const s = since ?? today;
        const u = until ?? today;
        validateDateRange(s, u);
        const result = await client.fetchReportRange("enterprise", ent, reportKind, s, u, fr);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      }

      // 1日指定モード
      if (day) {
        if (!validateDateFormat(day)) {
          return { content: [{ type: "text" as const, text: `Invalid date format: ${day}. Use YYYY-MM-DD.` }], isError: true };
        }
        const result = await client.fetchEnterpriseReport(ent, reportKind, day, fr);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      }

      // 28日間最新レポートモード
      const result = await client.fetchEnterpriseReport(ent, reportKind, undefined, fr);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  };
}

export function registerEnterpriseTools(server: McpServer, client: GitHubClient, defaultEnterprise: string) {
  const commonParams = {
    enterprise: z.string().optional().describe("Enterprise slug (defaults to GITHUB_ENTERPRISE env var)"),
    day: z.string().optional().describe("Specific date in YYYY-MM-DD for a 1-day report"),
    since: z.string().optional().describe("Start date in YYYY-MM-DD for a date range report (use with 'until')"),
    until: z.string().optional().describe("End date in YYYY-MM-DD for a date range report (use with 'since')"),
    force_refresh: z.boolean().optional().describe("Ignore cache and fetch fresh data"),
  };

  server.tool(
    "get_copilot_metrics_for_enterprise",
    "Get Copilot aggregate usage metrics for a GitHub Enterprise. " +
    "Specify 'day' for a 1-day report, 'since'/'until' for a date range (fetches each day in parallel), " +
    "or omit all dates for the latest 28-day report.",
    commonParams,
    buildEnterpriseHandler(client, defaultEnterprise, "aggregate")
  );

  server.tool(
    "get_copilot_user_metrics_for_enterprise",
    "Get Copilot user-level metrics for a GitHub Enterprise. " +
    "Specify 'day' for a 1-day report, 'since'/'until' for a date range (fetches each day in parallel), " +
    "or omit all dates for the latest 28-day report.",
    commonParams,
    buildEnterpriseHandler(client, defaultEnterprise, "users")
  );
}
