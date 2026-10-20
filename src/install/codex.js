import { isAbsolute, join } from "node:path";

// Codex: ~/.codex/config.toml (CODEX_HOME when set, https://developers.openai.com/codex/config-advanced), one
// [mcp_servers.<name>] table per server (https://learn.chatgpt.com/docs/extend/mcp?surface=cli); never a project's
// .codex/config.toml. A remote server is a "url", signed in with `codex mcp login <name>`.
export default {
  id: "codex",
  name: "Codex",
  format: "toml",
  key: "mcp_servers",
  places: ({ home, env }) => {
    const dir = env.CODEX_HOME && isAbsolute(env.CODEX_HOME) ? env.CODEX_HOME : join(home, ".codex");
    return [{ marker: dir, file: join(dir, "config.toml") }];
  },
  local: ({ args, env }) => ({ command: "npx", args, ...(env && { env }) }),
  cloud: (url) => ({ url }),
  signIn: "run codex mcp login genter-cloud to sign in",
};
