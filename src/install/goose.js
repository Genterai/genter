import { join } from "node:path";
import { appData, xdgCandidates } from "./paths.js";

// goose: config.yaml, ~/.config/goose on macOS and Linux and %APPDATA%\Block\goose\config on Windows, one entry per
// extension under "extensions" (https://github.com/block/goose/blob/main/documentation/docs/guides/config-files.md). A
// remote server is a streamable_http extension, and goose signs in with OAuth (Dynamic Client Registration). Its docs
// do not say which folder an extension starts in, and its desktop app opens no project.
export default {
  id: "goose",
  name: "goose",
  format: "yaml",
  key: "extensions",
  places: (ctx) => {
    const dirs = ctx.platform === "win32" ? [join(appData(ctx), "Block", "goose", "config")] : ctx.platform === "linux" ? xdgCandidates(ctx, "goose") : [join(ctx.home, ".config", "goose")];
    return dirs.map((dir) => ({ marker: dir, file: join(dir, "config.yaml") }));
  },
  local: ({ args, env }) => ({ type: "stdio", name: "genter", enabled: true, cmd: "npx", args, env_keys: [], envs: env ?? {}, timeout: 300 }),
  cloud: (url) => ({ type: "streamable_http", name: "genter-cloud", enabled: true, uri: url, headers: {}, env_keys: [], envs: {}, timeout: 300 }),
};
