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
