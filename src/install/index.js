import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createInterface } from "node:readline/promises";
import claudeCode from "./claude-code.js";
import claudeDesktop from "./claude-desktop.js";
import codex from "./codex.js";
import cursor from "./cursor.js";
import { editJson, editToml, editYaml, renderJson, renderToml, renderYaml } from "./edit.js";
import gemini from "./gemini.js";
import goose from "./goose.js";
import vscode from "./vscode.js";
import zed from "./zed.js";

// genter install: adds Genter to the AI tools on this computer by editing each one's user-level config file, never a
// project's (those get committed), and without starting any other program. It shows what it would add and writes only
// after a yes in a terminal. What it writes is `npx -y genter-cli mcp` and, when asked, Genter Cloud's public address:
// never a token, a key or a private URL. A copy of every file it changes is kept in ~/.genter/install/, and
// `genter install --undo` puts the files back byte for byte.

export const CLOUD = "https://genter.ai/api/mcp";
export const CLIENTS = [claudeCode, claudeDesktop, cursor, vscode, codex, gemini, zed, goose];
const EDIT = { json: editJson, jsonc: editJson, toml: editToml, yaml: editYaml };

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const shown = (file, home) => (file.startsWith(home + sep) ? `~${file.slice(home.length)}` : file);
const listed = (names) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

// The servers Genter adds to one tool: the local one, and Genter Cloud when asked and the tool's file can hold it.
function wantedFor(client, { semantic, cloud, folder }) {
  const args = ["-y", "genter-cli", "mcp", ...(client.folder && folder ? [folder] : [])];
  const env = semantic ? { GENTER_SEMANTIC: "1" } : undefined;
  const wanted = [{ name: "genter", value: client.local({ args, env }), is: (text) => text.includes("genter-cli") }];
  if (cloud && client.cloud) wanted.push({ name: "genter-cloud", value: client.cloud(CLOUD), is: (text) => text.includes(CLOUD) });
  return wanted;
}

// Which AI tools are here and what each one's file would become:
// [{ client, file, found, exists?, mode?, before?, wanted?, edit? }], `edit` as src/install/edit.js answers.
export function plan({ home, env, platform, only = [], semantic = false, cloud = false, folder }) {
  return CLIENTS.filter((c) => !only.length || only.includes(c.id)).map((client) => {
    const places = client.places({ home, env, platform });
    const place = places.find((p) => existsSync(p.marker));
    if (!place) return { client, file: places[0].file, found: false };
    const item = { client, file: place.file, found: true, wanted: wantedFor(client, { semantic, cloud, folder }) };
    let st = null;
    try {
      st = lstatSync(place.file);
    } catch {}
    // A link may lead into a repository (dotfiles): what it points at is left to the person.
    if (st?.isSymbolicLink()) return { ...item, edit: { kept: [], snippet: "it is a link to another file" } };
    if (st && !st.isFile()) return { ...item, edit: { kept: [], snippet: "it is not a file" } };
    const raw = st ? readFileSync(place.file) : Buffer.alloc(0);
    const before = raw.toString("utf8");
    if (!Buffer.from(before, "utf8").equals(raw)) return { ...item, edit: { kept: [], snippet: "it is not UTF-8 text" } };
    let edit = EDIT[client.format](before, client.key, item.wanted);
    // A file with Windows line ends gets them in what is added too.
    if (edit.inserted !== undefined && before.includes("\r\n")) {
      const inserted = edit.inserted.replace(/\r?\n/g, "\r\n");
      edit = { ...edit, inserted, text: before.slice(0, edit.at) + inserted + before.slice(edit.at) };
    }
    return { ...item, exists: Boolean(st), mode: st ? st.mode & 0o777 : 0o600, before, edit };
  });
}

// What to paste when a file is left as it is.
function snippetOf({ client, wanted }) {
  if (client.format === "toml") return wanted.map((w) => renderToml(client.key, w.name, w.value)).join("\n\n");
  if (client.format === "yaml") return `${client.key}:\n${wanted.map((w) => renderYaml(w.name, w.value, "  ")).join("\n")}`;
  return `${JSON.stringify(client.key)}: ${renderJson(Object.fromEntries(wanted.map((w) => [w.name, w.value])), "", "  ")}`;
}

// One file's change: the lines Genter adds and where, never a line of the person's own (it may hold their keys).
function show(item, home, out) {
  const { client, edit } = item;
  const where = shown(item.file, home);
  out("");
  if (edit.snippet) {
    out(`${client.name} · ${where}: left as it is, because ${edit.snippet}. To add Genter, put this in it yourself:`);
    for (const line of snippetOf(item).split("\n")) out(`  ${line}`);
    return;
  }
  for (const k of edit.kept) out(`${client.name} · ${where}: "${k.name}" is already there${k.how === "same" ? "" : k.how === "differs" ? ", set differently: left as you have it" : ` ${k.how}`}`);
  if (edit.inserted === undefined) return;
  out(`${client.name} · ${where}${item.exists ? "" : " (a new file, readable by you only)"}`);
  // The added text from the line it starts on; when it starts with a line break, from the first new line.
  const lines = edit.inserted.replace(/\r/g, "").replace(/\n[ \t]*$/, "").split("\n");
  const line = item.before.slice(0, edit.at).split("\n").length + (lines[0] === "" ? 1 : 0);
  out(`@@ ${where}:${line} @@`);
  for (const l of lines[0] === "" ? lines.slice(1) : lines) out(`+${l}`);
}

// A file replaced in one step, with the mode it is given.
function writeAtomic(file, data, mode) {
  const tmp = `${file}.genter-${process.pid}.tmp`;
  try {
    writeFileSync(tmp, data, { mode });
    chmodSync(tmp, mode);
    renameSync(tmp, file);
  } catch (error) {
    try {
      unlinkSync(tmp);
    } catch {}
    throw error;
  }
}

// What genter install changed, file by file, each write on top of the last: { files: { <path>: [{ backup, mode,
// written, at }] } }. `backup` names the copy of the file as it was before that write (null: there was no file).
function manifest(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  } catch {
    return { v: 1, files: {} };
  }
}
const keep = (dir, m) => writeAtomic(join(dir, "manifest.json"), JSON.stringify(m, null, 2), 0o600);
function backupDir(dir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
}

// The changes written, a copy of each file kept first: the items written.
function write(changes, dir, home, out) {
  backupDir(dir);
  const m = manifest(dir);
  const written = [];
  for (const item of changes) {
    const where = shown(item.file, home);
    try {
      // Another program (the tool itself) may have written the file while the person read the change.
      const now = existsSync(item.file) ? readFileSync(item.file, "utf8") : null;
      if (now !== (item.exists ? item.before : null)) throw new Error("it changed while genter install was asking: run it again");
      const stack = m.files[item.file] ?? [];
      const backup = item.exists ? `${sha(item.file).slice(0, 16)}-${stack.length}.bak` : null;
      if (backup) writeAtomic(join(dir, backup), item.before, 0o600);
      writeAtomic(item.file, item.edit.text, item.mode);
      stack.push({ backup, mode: item.exists ? item.mode : null, written: sha(item.edit.text), at: new Date().toISOString() });
      m.files[item.file] = stack;
      keep(dir, m);
      written.push(item);
      out(`Wrote ${where}`);
    } catch (error) {
      out(`${where}: not written, ${error.message}`);
    }
  }
  return written;
}

// --undo: each file goes back write by write, while it is still what genter install wrote; a file changed by hand since
// is left as it is, with where its copy is.
async function undo({ dir, home, ask, dryRun, out }) {
  const m = manifest(dir);
  const files = Object.entries(m.files);
  if (!files.length) {
    out("Nothing to undo: genter install has changed no file.");
    return 0;
  }
  const steps = files.map(([file, stack]) => {
    let current = existsSync(file) ? sha(readFileSync(file)) : null;
    let n = 0;
    while (n < stack.length && current === stack[stack.length - 1 - n].written) {
      const { backup } = stack[stack.length - 1 - n];
      if (backup && !existsSync(join(dir, backup))) break; // its copy is gone: nothing to put back from
      current = backup ? sha(readFileSync(join(dir, backup))) : null;
      n++;
    }
    return { file, stack, n, target: stack[stack.length - n] };
  });
  for (const { file, stack, n, target } of steps) {
    const where = shown(file, home);
    const copy = stack.at(-1).backup;
    if (!n) out(`${where}: changed since genter install wrote it, so it is left as it is (${copy ? `as it was before: ${shown(join(dir, copy), home)}` : "genter install made it"})`);
    else if (!target.backup) out(`${where}: deleted (genter install made it)`);
    else out(`${where}: put back as it was before genter install${n < stack.length ? ` wrote it on ${target.at.slice(0, 10)} (it was changed by hand before that, so Genter's earlier entry stays)` : ""}`);
  }
  const todo = steps.filter((s) => s.n);
  const left = steps.some((s) => s.n < s.stack.length); // some write of genter install stays
  if (!todo.length) return 1;
  if (dryRun || !ask) {
    out(`\nNothing put back (${dryRun ? "--dry-run" : "no terminal to ask in"}). Run genter install --undo in a terminal.`);
    return 0;
  }
  if (!(await ask(`\nPut back ${todo.length} ${todo.length === 1 ? "file" : "files"}? [y/N] `))) {
    out("Nothing put back.");
    return 0;
  }
  for (const { file, stack, n, target } of todo) {
    if (target.backup) writeAtomic(file, readFileSync(join(dir, target.backup)), target.mode);
    else unlinkSync(file);
    for (const s of stack.splice(stack.length - n)) if (s.backup) unlinkSync(join(dir, s.backup));
    if (!stack.length) delete m.files[file];
    keep(dir, m);
    out(`${target.backup ? "Put back" : "Deleted"} ${shown(file, home)}`);
  }
  return left ? 1 : 0;
}

// --folder, for Claude Desktop: a folder that is there, never the home folder or the root (as `ask` never adds them).
function folderOf(folder, home) {
  const path = resolve(folder === "~" || folder.startsWith("~/") ? join(home, folder.slice(1)) : folder);
  let st;
  try {
    st = statSync(path);
  } catch {}
  if (!st?.isDirectory()) throw new Error(`--folder ${folder}: no such folder`);
  if (path === resolve(home) || path === resolve("/")) throw new Error(`--folder ${folder}: name a folder of notes or docs, not ${path === resolve("/") ? "the root" : "your home folder"}`);
  return path;
}

// A question answered in this terminal, or null when there is none to ask in.
export function terminalAsk(input = process.stdin, output = process.stdout) {
  if (!input.isTTY || !output.isTTY) return null;
  return async (question) => {
    const rl = createInterface({ input, output });
    try {
      return /^\s*y(es)?\s*$/i.test(await rl.question(question));
    } finally {
      rl.close();
    }
  };
}

// The command: 0 when done (or nothing to do), 1 when a file could not be written or put back.
export async function install({ home = homedir(), env = process.env, platform = process.platform, genterHome, only = [], semantic = false, cloud = false, folder, dryRun = false, undo: back = false, ask = null, out = console.log } = {}) {
  const dir = join(genterHome ?? join(home, ".genter"), "install");
  if (back) return undo({ dir, home, ask, dryRun, out });
  const unknown = only.filter((id) => !CLIENTS.some((c) => c.id === id));
  if (unknown.length) throw new Error(`genter install: no AI tool called ${unknown.join(", ")}; it knows ${CLIENTS.map((c) => c.id).join(", ")}`);
  if (folder !== undefined) folder = folderOf(folder, home);
  const options = { home, env, platform, only, semantic, cloud, folder };
  let items = plan(options);
  const found = items.filter((i) => i.found);
  const missing = items.filter((i) => !i.found).map((i) => i.client.name);
  out(`genter install adds Genter to your AI tools, in each one's settings for you (never a project's files): it shows the change, then asks.\n`);
  out(`Found: ${listed(found.map((i) => i.client.name)) || "none"}.${missing.length ? ` Not found: ${listed(missing)}.` : ""}`);
  if (!found.length) {
    out("\nNothing to add Genter to. For any MCP client: npx -y genter-cli mcp");
    return 0;
  }
  if (folder && !found.some((i) => i.client.folder)) out("--folder is for Claude Desktop, which is not here.");
  if (!cloud && ask && !dryRun) {
    cloud = await ask(`\nAlso add Genter Cloud, for your team's apps (${CLOUD})? Your AI tool signs you in with OAuth; Genter keeps nothing on this computer for it. [y/N] `);
    if (cloud) items = plan({ ...options, cloud });
  }
  for (const item of items.filter((i) => i.found)) show(item, home, out);
  const desktop = items.find((i) => i.found && !i.client.cloud);
  if (cloud && desktop) out(`\n${desktop.client.name} takes Genter Cloud as a custom connector, not in its file: ${desktop.client.cloudHere}, then ${CLOUD}`);
  out(`\nEach tool starts npx -y genter-cli mcp in the project it opens, and Genter searches that project and your notes.${found.some((i) => i.client.folder) ? ` Claude Desktop opens no project: there Genter searches your notes${folder ? ` and ${shown(folder, home)}` : " (or a folder you name with --folder)"}.` : ""}`);
  const changes = items.filter((i) => i.found && i.edit.inserted !== undefined);
  if (!changes.length) {
    out(items.some((i) => i.found && i.edit.snippet) ? "\nNothing to write: add the lines above yourself where a file is left as it is." : "\nNothing to change: Genter is in every tool found.");
    return 0;
  }
  const files = `${changes.length} ${changes.length === 1 ? "file" : "files"}`;
  if (dryRun || !ask) {
    out(`\nNothing written (${dryRun ? "--dry-run" : "no terminal to ask in"}). Run genter install in a terminal to write ${files}, or add the lines yourself.`);
    return 0;
  }
  if (!(await ask(`\nWrite ${files}? A copy of each is kept in ${shown(dir, home)}, and genter install --undo puts them back. [y/N] `))) {
    out("Nothing written.");
    return 0;
  }
  const written = write(changes, dir, home, out).map((i) => i.client);
  if (written.length) out(`\nRestart ${listed(written.map((c) => c.name))} to load Genter.`);
  if (cloud) for (const c of written.filter((c) => c.signIn)) out(`${c.name}: ${c.signIn}.`);
  return written.length === changes.length ? 0 : 1;
}
