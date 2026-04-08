import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { parseArgs } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Cache } from "./lib/cache.js";
import { GitHubClient } from "./lib/github-client.js";
import { registerEnterpriseTools } from "./tools/enterprise.js";
import { registerOrgTools } from "./tools/org.js";
import { registerTeamTool } from "./tools/team.js";
import { registerSeatsTool } from "./tools/seats.js";
import { registerSummaryTool } from "./tools/summary.js";

const { values: args } = parseArgs({
  options: {
    token: { type: "string" },
    enterprise: { type: "string" },
    org: { type: "string" },
    "cache-dir": { type: "string" },
  },
  strict: false,
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const token = args.token as string | undefined;
if (!token) {
  console.error("--token is required");
  process.exit(1);
}

const enterprise = (args.enterprise as string | undefined) ?? "";
const org = (args.org as string | undefined) ?? "";
const rawCacheDir = args["cache-dir"] as string | undefined;
const cacheDir = rawCacheDir
  ? path.resolve(rawCacheDir)
  : path.join(projectRoot, "cache");

const cache = new Cache(cacheDir);
const client = new GitHubClient(token, cache);

const server = new McpServer({
  name: "copilot-usage",
  version: "2.0.0",
});

registerEnterpriseTools(server, client, enterprise);
registerOrgTools(server, client, org);
registerTeamTool(server);
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
