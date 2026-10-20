import { join } from "node:path";
import { appData, xdgCandidates } from "./paths.js";

// Zed: the user's settings.json, ~/.config/zed on macOS and Linux ($XDG_CONFIG_HOME/zed when set) and %APPDATA%\Zed on
// Windows, "JSON with support for // comments" (https://github.com/zed-industries/zed/blob/main/docs/src/configuring-zed.md);
// servers sit under "context_servers" (https://zed.dev/docs/ai/mcp). Never a project's .zed/settings.json. Comments stay
// byte for byte. A remote server is a "url"; with no Authorization header Zed signs in with OAuth.
export default {
  id: "zed",
  name: "Zed",
  format: "jsonc",
  key: "context_servers",
  places: (ctx) => {
    const dirs = ctx.platform === "win32" ? [join(appData(ctx), "Zed")] : ctx.platform === "linux" ? xdgCandidates(ctx, "zed") : [join(ctx.home, ".config", "zed")];
    return dirs.map((dir) => ({ marker: dir, file: join(dir, "settings.json") }));
  },
  local: ({ args, env }) => ({ command: "npx", args, ...(env && { env }) }),
  cloud: (url) => ({ url }),
};
