import { join } from "node:path";

// Claude Code, user scope: the top-level "mcpServers" of ~/.claude.json, "available across all projects on your machine"
// (https://code.claude.com/docs/en/mcp#user-scope). Claude Code keeps much else in that file and rewrites it while it
// runs, so the entry goes in as one insertion and Claude Code is restarted after. Never .mcp.json: a project's, committed.
export default {
  id: "claude-code",
  name: "Claude Code",
  format: "json",
  key: "mcpServers",
  places: ({ home }) => [{ marker: join(home, ".claude.json"), file: join(home, ".claude.json") }],
  local: ({ args, env }) => ({ type: "stdio", command: "npx", args, ...(env && { env }) }),
  cloud: (url) => ({ type: "http", url }),
  signIn: "run /mcp to sign in to genter-cloud",
};
