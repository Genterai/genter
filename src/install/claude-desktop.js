import { join } from "node:path";
import { appData, xdgCandidates } from "./paths.js";

// Claude Desktop: claude_desktop_config.json in the app's folder, "~/Library/Application Support/Claude" on macOS and
// "%APPDATA%\Claude" on Windows (https://modelcontextprotocol.io/docs/develop/connect-local-servers); on Linux the app's
// folder is ~/.config/Claude (its logs are in ~/.config/Claude/logs/, https://claude.com/docs/third-party/claude-desktop/configuration).
// It opens no project, so the server reads the person's notes, or the folder they name with --folder. A remote server is
// not a line in this file: it is a custom connector in the app (Customize › Connectors), which the person adds there.
export default {
  id: "claude-desktop",
  name: "Claude Desktop",
  format: "json",
  key: "mcpServers",
  folder: true,
  places: (ctx) => (ctx.platform === "linux" ? xdgCandidates(ctx, "Claude") : [join(appData(ctx), "Claude")]).map((dir) => ({ marker: dir, file: join(dir, "claude_desktop_config.json") })),
  local: ({ args, env }) => ({ command: "npx", args, ...(env && { env }) }),
  cloud: null,
  cloudHere: "Customize › Connectors › + Add › Add custom connector",
};
