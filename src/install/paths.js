import { isAbsolute, join } from "node:path";

// Where apps keep their settings on each system: Application Support on macOS, %APPDATA% on Windows, the XDG config
// folder on Linux.
export function appData({ home, env, platform }) {
  if (platform === "darwin") return join(home, "Library", "Application Support");
  if (platform === "win32") return env.APPDATA || join(home, "AppData", "Roaming");
  return xdg({ home, env });
}

export const xdg = ({ home, env }) => (env.XDG_CONFIG_HOME && isAbsolute(env.XDG_CONFIG_HOME) ? env.XDG_CONFIG_HOME : join(home, ".config"));

// On Linux an app's folder is under $XDG_CONFIG_HOME when that is set, else ~/.config: the first that exists counts.
export const xdgCandidates = (ctx, name) => [...new Set([join(xdg(ctx), name), join(ctx.home, ".config", name)])];
