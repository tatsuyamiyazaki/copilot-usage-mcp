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
