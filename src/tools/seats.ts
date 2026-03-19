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
