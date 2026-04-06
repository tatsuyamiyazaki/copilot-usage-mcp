import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerTeamTool(server: McpServer) {
  server.tool(
    "get_copilot_metrics_for_team",
    "[DEPRECATED] Team-level Copilot metrics are no longer available. " +
    "The GitHub Copilot Usage Metrics API (2026-03-10) provides metrics at the Enterprise and Organization level only. " +
    "Use 'get_copilot_metrics_for_org' or 'get_copilot_user_metrics_for_org' instead.",
    {
      org: z.string().optional().describe("Organization name"),
      team_slug: z.string().describe("Team slug"),
    },
    async () => {
      return {
        content: [{
          type: "text",
          text: "This tool is no longer available. The GitHub Copilot Usage Metrics API (apiVersion: 2026-03-10) " +
                "does not provide team-level metrics. Use 'get_copilot_metrics_for_org' or " +
                "'get_copilot_user_metrics_for_org' for organization-level data.",
        }],
        isError: true,
      };
    }
  );
}
