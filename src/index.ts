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

config({ quiet: true });

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
