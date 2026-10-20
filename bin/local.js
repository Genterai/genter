// The genter command, with no keys and no packages: folders, files, websites and notes (src/local.js), and the same as
// an MCP server over stdio (src/mcp-server.js). Each searches the project of the folder it runs in (mcp: its first folder).
// `genter serve` is the same two tools over HTTP for a small team (src/http.js), with one token per person.
// `genter decisions` writes the project's decisions page (src/page.js), stamped with its commit (src/git.js).
import { chmodSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { runDemo } from "../src/demo.js";
import { headOf } from "../src/git.js";
import { install, terminalAsk } from "../src/install/index.js";
import { SERVE, serveHttp, serveSetup } from "../src/http.js";
import { createLocal, embedderFor, embeddingProvider, findText, genterHome, LIMITS, realOf, shown, under } from "../src/local.js";
import { serveMcp, sourcesText } from "../src/mcp-server.js";
import { cutText, decisionsOf, decisionsPage } from "../src/page.js";
import { readerCommand } from "./reader.js";

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
  genter ask <question>              the passages that answer, read now, with path:lines (this project's folder at first)
  genter add <folder|file|url> ...   search these from now on, in this project
  genter remember <text>             keep a note (~/.genter/notes.md); ask finds it with its date, in every project
  genter sources                     what ask searches here
  genter forget <folder|file|url>    stop searching it here
  genter mcp [folder|url ...]        all of it for your agent (MCP over stdio), in the first folder's project:
                                     claude mcp add genter -- npx -y genter-cli mcp
  genter serve <folder|url> ...      search and read for a small team, MCP over HTTP at http://127.0.0.1:${SERVE.port}/mcp:
                                     one token per person (GENTER_TOKENS_FILE), read-only, no notes; every token
                                     holder reads all of it. --host 0.0.0.0 leaves this computer (tokens and
                                     GENTER_SECRET_FILE needed, TLS in front), --port N (docs/team.md)
  genter install [tool ...]          add genter mcp to the AI tools on this computer (Claude Code, Claude Desktop,
                                     Cursor, VS Code, Codex, Gemini CLI, Zed, goose), in your own settings for each:
                                     shows each change, then asks. --cloud adds Genter Cloud too, --semantic sets
                                     GENTER_SEMANTIC=1, --folder <dir> is what Claude Desktop searches, --dry-run only
                                     shows, --undo puts every file back
  genter decisions [--out <file>]    a page of this project's decisions: current, and replaced by their own text, with
                                     where each is written, its own date and the notice quoted; written outside the
                                     repository (~/.genter/pages/<project>.html) unless --out names a file
  genter reader new <name>           make readers/<name>/: a reader for a text format (its date, status and replaced
                                     marks), written as data, with fixtures and what they give
  genter reader check [folder ...]   lint the readers in readers/ (and rules/) and check them against their fixtures

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
    else if (a === "--dry-run") flags.dryRun = true;
    else if (a === "--undo") flags.undo = true;
    else if (a === "--folder") flags.folder = argv[++i] ?? "";
    else if (a.startsWith("--folder=")) flags.folder = a.slice(9);
    else if (a === "--out") flags.out = argv[++i] ?? "";
    else if (a.startsWith("--out=")) flags.out = a.slice(6);
    else if (a === "--host") flags.host = argv[++i] ?? "";
    else if (a.startsWith("--host=")) flags.host = a.slice(7);
    else if (a === "--port") flags.port = Number(argv[++i]);
    else if (a.startsWith("--port=")) flags.port = Number(a.slice(7));
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

// The decisions page of the project: written outside its repository unless --out names a file, readable by its owner
// only, since it quotes the project's documents; written whole, through a temp file of its own (never one already
// there, nor a link) that is removed when the page cannot take its place. { path, project, commit, current, replaced,
// complete }.
function decisions(g, home, flags, words) {
  if (words.length || flags.out === "") throw new Error("genter decisions [--out <file>]: it reads the project of the folder it runs in");
  const { root, place, refused } = g.project();
  if (refused) console.error(`genter: ${refused}`);
  const head = headOf(root);
  if (!head) throw new Error(`${place} is not a git repository: the decisions page is stamped with the commit it is made at, so run genter decisions in a clone`);
  const project = basename(root);
  const path = flags.out ? resolve(flags.out === "~" || flags.out.startsWith("~/") ? join(homedir(), flags.out.slice(1)) : flags.out) : join(home, "pages", `${project.replace(/[^\p{L}\p{N}_.-]+/gu, "-").replace(/^[.-]+/, "") || "project"}.html`);
  if (!flags.out && [root, head.root].some((dir) => within(path, dir))) throw new Error(`${shown(path)} is inside ${project}: the page quotes its documents, so it is written outside the repository; choose a file with --out <file>`);
  if (isFolder(path)) throw new Error(`${shown(path)} is a folder: --out names the page's file, such as ${shown(join(path, `${project}.html`))}`);
  const { documents, complete } = g.documents();
  const rows = decisionsOf(documents);
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const cut = complete ? undefined : LIMITS.files;
  const html = decisionsPage({ project, commit: head.commit, date, rows, cut });
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  if (!flags.out) chmodSync(dirname(path), 0o700);
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, html, { mode: 0o600, flag: "wx" });
  try {
    renameSync(temp, path);
  } catch (error) {
    try {
      unlinkSync(temp);
    } catch {}
    throw error;
  }
  const current = rows.filter((r) => r.state === "current").length;
  console.error(`genter: ${current} current · ${rows.length - current} replaced in ${project}${head.commit ? ` at ${head.commit.slice(0, 7)}` : ", before its first commit"}`);
  if (cut) console.error(`genter: ${cutText(cut)}`);
  return { path, project, commit: head.commit, current, replaced: rows.length - current, complete };
}

const isFolder = (path) => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

// Whether a path is a folder or inside it, as written or once links are followed (for a path that is not there yet,
// where its nearest folder that is leads).
const within = (path, dir) => under(path, [dir]) || under(realOf(path), [realOf(dir)]);

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
  if (flags.out !== undefined && command !== "decisions") {
    console.error("--out is for genter decisions");
    process.exitCode = 1;
    return;
  }
  if ((flags.host !== undefined || flags.port !== undefined) && command !== "serve") {
    console.error(`${flags.host !== undefined ? "--host" : "--port"} is for genter serve`);
    process.exitCode = 1;
    return;
  }
  if (command === "demo") return runDemo();
  // Readers are data in readers/: making and checking them touches no store and needs no key.
  if (command === "reader") {
    process.exitCode = readerCommand(words);
    return;
  }
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
  if (!["add", "ask", "remember", "forget", "sources", "mcp", "serve", "decisions", "login", "logout"].includes(command)) {
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
    // genter serve: its tokens, address and seal key are checked before anything is read; it reads no one's notes.
    if (command === "serve" && !words.length) throw new Error("genter serve <folder|url> ...: the folders to serve, read-only (docs/team.md)");
    const served = command === "serve" ? serveSetup({ env: process.env, home, host: flags.host, port: flags.port, log: console.error }) : null;
    const g = createLocal({ home, userId: process.env.GENTER_USER_ID || c.user_id || "default", embed, ...((command === "mcp" || served) && { project: projectFolder(words) }), ...(served && { secret: served.secret, notes: false }) });

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
    } else if (command === "serve") {
      for (const target of words) {
        const out = await g.add(target, { depth: flags.depth });
        if (out.refused) console.error(`genter: ${out.refused}`);
        console.error(`genter: ${out.source.place}, ${out.places} places`);
      }
      if (semantic) console.error("genter: ranking by meaning too: the passages a search ranks go to the embeddings provider");
      const server = await serveHttp(g, { host: served.host, port: served.port, tokens: served.tokens, version });
      for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => server.close());
      await server.closed;
    } else if (command === "decisions") {
      const out = decisions(g, home, flags, words);
      say(flags, out, `${shown(out.path)} holds quotes from ${out.project}: check before sharing`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
