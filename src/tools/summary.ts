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
