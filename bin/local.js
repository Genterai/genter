// The genter command, with no keys and no packages: folders, files, websites and notes (src/local.js), and the same as
// an MCP server over stdio (src/mcp-server.js). Each searches the project of the folder it runs in (mcp: its first folder).
import { readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { runDemo } from "../src/demo.js";
import { createLocal, embedderFor, embeddingProvider, findText, genterHome } from "../src/local.js";
import { serveMcp, sourcesText } from "../src/mcp-server.js";

const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

// Genter Cloud is not reached from here: it is its own MCP server in the person's AI tool, which signs in with OAuth,
// so no token is kept on this computer (the one 0.3's genter login kept is dropped, below).
const CLOUD = "https://genter.ai/api/mcp";
const CLOUD_LINE = `Genter Cloud finds in your team's apps (GitHub, Slack, Notion and 500 more): add it to your AI tool as its own MCP
server, next to genter mcp. The tool signs in with OAuth, and nothing is kept on this computer: ${CLOUD}`;

const HELP = `genter ${version}: resolver for AI agents. A question resolves to where its answer is written, and Genter
reads it there again, so the answer is what your docs say now.

  genter demo                        see it in a second, on a temp folder
  genter ask <question>              the passages that answer, read now, with path:lines (this project's folder at first)
  genter add <folder|file|url> ...   search these from now on, in this project
  genter remember <text>             keep a note (~/.genter/notes.md); ask finds it with its date, in every project
  genter sources                     what ask searches here
  genter forget <folder|file|url>    stop searching it here
  genter mcp [folder|url ...]        all of it for your agent (MCP over stdio), in the first folder's project:
                                     claude mcp add genter -- npx -y genter-cli mcp

  A project is the nearest folder up from here (for mcp, from its first folder) with a genter.json or a .git, else
  that folder; ask reads only its sources and your notes. Its genter.json can only narrow that: {"include": [...],
  "exclude": [...], "off": [...]}, paths inside it. "off" in ~/.genter/config.json switches places off everywhere.

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

// The folder whose project `genter mcp <folder>` searches: the first folder (or a file's folder) given, written as it
// is added, so a server an MCP client starts elsewhere still searches that project; with none given, the current folder.
function projectFolder(words) {
  const first = words.find((w) => !/^https?:\/\//i.test(w));
  if (!first) return process.cwd();
  const path = resolve(first === "~" || first.startsWith("~/") ? join(homedir(), first.slice(1)) : first);
  try {
    return statSync(path).isDirectory() ? path : dirname(path);
  } catch {
    return process.cwd(); // not there: adding it says so
  }
}

export async function local(argv) {
  const [command = "help", ...rest] = argv;
  const { flags, words } = parse(rest);
  if (command === "--version" || command === "-v") return console.log(version);
  if (["help", "--help", "-h"].includes(command)) return console.log(HELP);
  if (command === "demo") return runDemo();
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
    const g = createLocal({ home, userId: process.env.GENTER_USER_ID || c.user_id || "default", embed, ...(command === "mcp" && { project: projectFolder(words) }) });

    if (command === "add") {
      if (!words.length) throw new Error("genter add <folder|file|url> ...");
      for (const target of words) {
        const out = await g.add(target, { depth: flags.depth });
        if (out.refused) console.error(`genter: ${out.refused}`);
        say(flags, out, `${out.new ? "Added" : "Read again"} ${out.source.place}: ${out.places} ${out.source.kind === "website" ? "pages" : "files"} (${out.created} new, ${out.changed} changed, ${out.gone} gone)${out.complete === false ? ", the listing stopped at its limit" : ""}`);
      }
    } else if (command === "ask") {
      const question = words.join(" ");
      if (!question.trim()) throw new Error('genter ask "<question>"');
      const out = await g.find(question, { limit: flags.limit });
      if (out.project.refused) console.error(`genter: ${out.project.refused}`);
      if (out.added) console.error(`(searching ${out.added.source.place}, this project's folder, added as a source: genter forget ${out.added.source.place} to stop)`);
      if (semantic && out.semantic !== true) console.error(`(ranking by meaning ${out.semantic || "off"})`);
      say(flags, out, findText(out));
    } else if (command === "remember") {
      const out = g.remember(words.join(" "));
      say(flags, out, `Kept in ${out.path}`);
    } else if (command === "forget") {
      if (!words[0]) throw new Error("genter forget <folder|file|url>");
      const out = g.forget(words[0]);
      say(flags, out, out.elsewhere ? `Forgot ${out.source.place} here; ${out.elsewhere === 1 ? "another project still searches" : `${out.elsewhere} other projects still search`} it` : `Forgot ${out.source.place} (${out.removed} anchors)`);
    } else if (command === "sources") {
      const list = g.sources();
      const project = g.project();
      say(flags, list, sourcesText(project, list));
    } else if (command === "mcp") {
      for (const target of words) {
        const out = await g.add(target, { depth: flags.depth });
        console.error(`genter: ${out.source.place}, ${out.places} places`);
      }
      const { place, refused } = g.project();
      console.error(`genter: searching the project ${place} and your notes`);
      if (refused) console.error(`genter: ${refused}`);
      await serveMcp(g, { version });
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
