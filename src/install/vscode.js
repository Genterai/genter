import { join } from "node:path";
import { appData, xdgCandidates } from "./paths.js";

// VS Code: the mcp.json "in your user profile" ("MCP: Open User Configuration",
// https://code.visualstudio.com/docs/agents/reference/mcp-configuration), whose servers sit under "servers"; the default
// profile's folder is Code/User in the app-data folder (https://code.visualstudio.com/docs/configure/settings). Never a
// workspace's .vscode/mcp.json. JSON with comments: they stay byte for byte. A stdio server starts in the workspace folder.
export default {
  id: "vscode",
  name: "VS Code",
  format: "jsonc",
  key: "servers",
  starts: "project",
  places: (ctx) => (ctx.platform === "linux" ? xdgCandidates(ctx, "Code") : [join(appData(ctx), "Code")]).map((dir) => ({ marker: join(dir, "User"), file: join(dir, "User", "mcp.json") })),
  local: ({ args, env }) => ({ type: "stdio", command: "npx", args, ...(env && { env }) }),
  cloud: (url) => ({ type: "http", url }),
};
