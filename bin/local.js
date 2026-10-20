// The genter command, with no keys and no packages: folders, files, websites and notes (src/local.js), and the same as
// an MCP server over stdio (src/mcp-server.js).
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runDemo } from "../src/demo.js";
import { install, terminalAsk } from "../src/install/index.js";
import { createLocal, embedderFor, embeddingProvider, findText, genterHome } from "../src/local.js";
import { serveMcp } from "../src/mcp-server.js";

const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

// Genter Cloud is not reached from here: it is its own MCP server in the person's AI tool, which signs in with OAuth,
// so no token is kept on this computer (the one 0.3's genter login kept is dropped, below).
const CLOUD = "https://genter.ai/api/mcp";
const CLOUD_LINE = `Genter Cloud finds in your team's apps (GitHub, Slack, Notion and 500 more): add it to your AI tool as its own MCP
server, next to genter mcp (genter install offers it). The tool signs in with OAuth, and nothing is kept on this
computer: ${CLOUD}`;

const HELP = `genter ${version}: resolver for AI agents. A question resolves to where its answer is written, and Genter
reads it there again, so the answer is what your docs say now.

  genter demo                        see it in a second, on a temp folder
  genter ask <question>              the passages that answer, read now, with path:lines (the current folder at first)
  genter add <folder|file|url> ...   search these from now on
  genter remember <text>             keep a note (~/.genter/notes.md); ask finds it with its date
  genter sources                     what ask searches
  genter forget <folder|file|url>    stop searching it
  genter mcp [folder|url ...]        all of it for your agent (MCP over stdio):
                                     claude mcp add genter -- npx -y genter-cli mcp
  genter install [tool ...]          add genter mcp to the AI tools on this computer (Claude Code, Claude Desktop,
                                     Cursor, VS Code, Codex, Gemini CLI, Zed, goose), in your own settings for each:
                                     shows each change, then asks. --cloud adds Genter Cloud too, --semantic sets
                                     GENTER_SEMANTIC=1, --folder <dir> is what Claude Desktop searches, --dry-run only
                                     shows, --undo puts every file back

  --json             JSON
  --limit N          passages (default 5)
  --semantic         also rank by meaning (any language): OPENAI_API_KEY, OPENROUTER_API_KEY, AI_GATEWAY_API_KEY,
                     Ollama on this computer, or GENTER_EMBED_URL; --provider openai|openrouter|vercel|ollama picks one

${CLOUD_LINE}`;

function parse(argv) {
  const flags = { json: false, semantic: false };
  const words = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") flags.json = true;
    else if (a === "--semantic") flags.semantic = true;
    else if (a === "--provider") flags.provider = argv[++i];
    else if (a.startsWith("--provider=")) flags.provider = a.slice(11);
    else if (a === "--limit" || a === "--depth") flags[a.slice(2)] = Number(argv[++i]);
    else if (a.startsWith("--limit=") || a.startsWith("--depth=")) flags[a.slice(2, 7)] = Number(a.slice(8));
    else if (a === "--cloud") flags.cloud = true;
    else if (a === "--dry-run") flags.dryRun = true;
    else if (a === "--undo") flags.undo = true;
    else if (a === "--folder") flags.folder = argv[++i] ?? "";
    else if (a.startsWith("--folder=")) flags.folder = a.slice(9);
    else if (a !== "--local") words.push(a); // 0.3's --local: this computer is the only place now
  }
  return { flags, words };
}

function config(home) {
  try {
    return JSON.parse(readFileSync(join(home, "config.json"), "utf8"));
  } catch {
    return {};
  }
}

// 0.3's genter login kept a Genter Cloud token in config.json. Nothing reads it now, so the first command drops it and
// keeps the rest of the file, still readable by its owner only.
function dropCloudToken(home, c) {
  if (!c.cloud) return c;
  const { cloud, ...rest } = c;
  const file = join(home, "config.json");
  try {
    writeFileSync(`${file}.${process.pid}.tmp`, JSON.stringify(rest, null, 2), { mode: 0o600 });
    renameSync(`${file}.${process.pid}.tmp`, file);
    console.error(`genter: removed the Genter Cloud token genter 0.3 kept in ${file}; nothing uses it now`);
  } catch (error) {
    console.error(`genter: delete "cloud" from ${file}: it holds the Genter Cloud token genter 0.3 kept, which nothing uses now (${error.message})`);
  }
  return rest;
}

const say = (flags, data, text) => console.log(flags.json ? JSON.stringify(data, null, 2) : text);

export async function local(argv) {
  const [command = "help", ...rest] = argv;
  const { flags, words } = parse(rest);
  if (command === "--version" || command === "-v") return console.log(version);
  if (["help", "--help", "-h"].includes(command)) return console.log(HELP);
  // genter install's own flags mean nothing to the other commands: said, not dropped.
  const own = flags.folder !== undefined ? "--folder" : flags.undo ? "--undo" : flags.dryRun ? "--dry-run" : null;
  if (own && command !== "install") {
    console.error(`${own} is for genter install`);
    process.exitCode = 1;
    return;
  }
  if (command === "demo") return runDemo();
  // It edits other tools' settings, not Genter's store: no store, no key, and its --cloud adds Genter Cloud's address.
  if (command === "install") {
    try {
      process.exitCode = await install({ genterHome: genterHome(), only: words, semantic: flags.semantic, cloud: flags.cloud, folder: flags.folder, dryRun: flags.dryRun, undo: flags.undo, ask: terminalAsk() });
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
    return;
  }
  if (!["add", "ask", "remember", "forget", "sources", "mcp", "login", "logout"].includes(command)) {
    console.error(`Unknown command: ${command}\n\n${HELP}`);
    process.exitCode = 1;
    return;
  }
  // 0.3's ways to Genter Cloud: it is its own MCP server now.
  const gone = command === "login" || command === "logout" ? `genter ${command}` : flags.cloud ? "--cloud" : null;
  try {
    const home = genterHome();
    const c = dropCloudToken(home, config(home));
    if (gone) throw new Error(`${gone} is gone.\n${CLOUD_LINE}`);
    const semantic = flags.semantic || Boolean(flags.provider) || process.env.GENTER_SEMANTIC === "1" || c.semantic === true;
    const embed = semantic ? embedderFor(embeddingProvider({ env: process.env, config: c, name: flags.provider })) : undefined;
    const g = createLocal({ home, userId: process.env.GENTER_USER_ID || c.user_id || "default", embed });

    if (command === "add") {
      if (!words.length) throw new Error("genter add <folder|file|url> ...");
      for (const target of words) {
        const out = await g.add(target, { depth: flags.depth });
        say(flags, out, `${out.new ? "Added" : "Read again"} ${out.source.place}: ${out.places} ${out.source.kind === "website" ? "pages" : "files"} (${out.created} new, ${out.changed} changed, ${out.gone} gone)${out.complete === false ? ", the listing stopped at its limit" : ""}`);
      }
    } else if (command === "ask") {
      const question = words.join(" ");
      if (!question.trim()) throw new Error('genter ask "<question>"');
      const out = await g.find(question, { limit: flags.limit });
      if (out.added) console.error(`(searching ${out.added.source.place}, added as a source: genter forget ${out.added.source.place} to stop)`);
      if (semantic && out.semantic !== true) console.error(`(ranking by meaning ${out.semantic || "off"})`);
      say(flags, out, findText(out));
    } else if (command === "remember") {
      const out = g.remember(words.join(" "));
      say(flags, out, `Kept in ${out.path}`);
    } else if (command === "forget") {
      if (!words[0]) throw new Error("genter forget <folder|file|url>");
      const out = g.forget(words[0]);
      say(flags, out, `Forgot ${out.source.place} (${out.removed} anchors)`);
    } else if (command === "sources") {
      const list = g.sources();
      say(flags, list, list.length ? list.map((s) => `${s.kind.padEnd(8)} ${s.place}  ${s.places} places${s.gone ? `, ${s.gone} gone` : ""}`).join("\n") : "Nothing yet: genter add <folder|file|url>");
    } else if (command === "mcp") {
      for (const target of words) {
        const out = await g.add(target, { depth: flags.depth });
        console.error(`genter: ${out.source.place}, ${out.places} places`);
      }
      await serveMcp(g, { version });
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
