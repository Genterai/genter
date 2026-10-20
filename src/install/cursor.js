import { join } from "node:path";

// Cursor: the global ~/.cursor/mcp.json, "for tools available everywhere" (https://cursor.com/docs/mcp); never a
// project's .cursor/mcp.json. A remote server is a "url", and Cursor signs in with OAuth. Its docs do not say which
// folder a stdio server starts in.
export default {
  id: "cursor",
  name: "Cursor",
  format: "json",
  key: "mcpServers",
  places: ({ home }) => [{ marker: join(home, ".cursor"), file: join(home, ".cursor", "mcp.json") }],
  local: ({ args, env }) => ({ type: "stdio", command: "npx", args, ...(env && { env }) }),
  cloud: (url) => ({ url }),
};
