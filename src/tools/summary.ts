import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GitHubClient } from "../lib/github-client.js";
import type { UsageSummary } from "../lib/types.js";

export function registerSummaryTool(
  server: McpServer,
  client: GitHubClient,
  defaultEnterprise: string,
  defaultOrg: string
) {
  server.tool(
    "get_copilot_usage_summary",
    "Get a combined summary of Copilot usage across Enterprise and Organization (aggregate metrics, user metrics, and seat assignments). " +
    "Uses the latest 28-day reports for all metrics.",
    {
      force_refresh: z.boolean().optional().describe("Ignore cache and fetch fresh data"),
    },
    async ({ force_refresh }) => {
      try {
        const fr = force_refresh ?? false;

        const summary: UsageSummary = {
          enterprise_metrics: { error: "Not configured" },
          enterprise_user_metrics: { error: "Not configured" },
          org_metrics: { error: "Not configured" },
          org_user_metrics: { error: "Not configured" },
          seats: { error: "Not configured" },
        };

        if (defaultEnterprise) {
          try {
            summary.enterprise_metrics = await client.fetchEnterpriseReport(defaultEnterprise, "aggregate", undefined, fr);
          } catch (e) {
            summary.enterprise_metrics = { error: e instanceof Error ? e.message : String(e) };
          }

          try {
            summary.enterprise_user_metrics = await client.fetchEnterpriseReport(defaultEnterprise, "users", undefined, fr);
          } catch (e) {
            summary.enterprise_user_metrics = { error: e instanceof Error ? e.message : String(e) };
          }
        }

        if (defaultOrg) {
          try {
            summary.org_metrics = await client.fetchOrgReport(defaultOrg, "aggregate", undefined, fr);
          } catch (e) {
            summary.org_metrics = { error: e instanceof Error ? e.message : String(e) };
          }

          try {
            summary.org_user_metrics = await client.fetchOrgReport(defaultOrg, "users", undefined, fr);
          } catch (e) {
            summary.org_user_metrics = { error: e instanceof Error ? e.message : String(e) };
          }

          try {
            summary.seats = await client.fetchSeats(defaultOrg, fr);
          } catch (e) {
            summary.seats = { error: e instanceof Error ? e.message : String(e) };
          }
        }

        return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );
}
