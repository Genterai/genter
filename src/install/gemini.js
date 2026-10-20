import { join } from "node:path";

// Gemini CLI: the user's ~/.gemini/settings.json, "mcpServers" (https://geminicli.com/docs/tools/mcp-server/); never a
// project's .gemini/settings.json. A streamable HTTP server is an "httpUrl", and Gemini CLI signs in with OAuth. It runs
// in a terminal and gives a server no other folder than its own unless "cwd" is set: the folder it runs in.
export default {
  id: "gemini",
  name: "Gemini CLI",
  format: "json",
  key: "mcpServers",
  starts: "project",
  places: ({ home }) => [{ marker: join(home, ".gemini"), file: join(home, ".gemini", "settings.json") }],
  local: ({ args, env }) => ({ command: "npx", args, ...(env && { env }) }),
  cloud: (url) => ({ httpUrl: url }),
};
