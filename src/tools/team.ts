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
