import { createHash, randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { classifyFailure, contentHash, MARKDOWN_FILE as MARKDOWN, pieces as cut, recipeId, splitMarkdown } from "./anchor.js";
import { cloneWindow, driftFacts, HEAD_LINES, noticeWords, supersededOf } from "./drift.js";
import { bm25, prepare, terms, topTerms } from "./lexical.js";
import { readDocument } from "./readers.js";
import { cipher } from "./seal.js";
import { crawl, forgetPage, readPage, siteUrl } from "./web.js";

// Genter with no keys and no packages: folders, files, public websites and the person's notes, searched where they are.
// Each file or page is an Anchor: one read call with a fixed argument (FILE_READ {path}, WEBSITE_READ_PAGE {url}).
// A search reads the sources again, so what it returns is what they say now: a file that changed is read in its new
// form, one that is gone is no answer any more, and the result says what changed since the last look. Nothing is
// copied: the store holds which places there are, their digests, headings and dates (sealed), never their text.
// Words rank the sections (lexical.js); with an OpenRouter key, embeddings rank them too.
// A search reads its own project's sources and the person's notes, never another project's (projectOf). A project's
// genter.json can only narrow what it reads; the person's own "off" list, in Genter's config, holds in every project.
// The readers in readers/ (readers.js) read what a file says about itself: its date, its status, and where it marks
// itself as replaced. When a file of the project says so and what replaces it is in the project too, what replaces it
// comes first and the file follows, quoting its own notice: the current answer first, in the file's own words.
// A file's date is the one its document gives; its file time only when the folder was not written at one moment (a
// fresh clone), whose times say when the files arrived, not when anyone changed them.
// Every place has a number, the id search and read name it by over MCP; read reads a place whole, now, by that number,
// and only a place of the project it runs in.

export const LIMITS = { files: 5000, fileBytes: 1_000_000, passageChars: 1400, perPlace: 2, webCandidates: 8, chunkChars: 1500, dims: 256, readIds: 10, readChars: 20_000 };
export const FILE_READ = "FILE_READ";
export const PAGE_READ = "WEBSITE_READ_PAGE";

export const genterHome = () => process.env.GENTER_HOME || join(homedir(), ".genter");

const SKIP_DIRS = new Set(["node_modules", "dist", "build", "out", "coverage", "vendor", "target", "__pycache__", "venv", "env", "site-packages", "bower_components", "tmp", "temp", "logs"]);
const TEXT_FILE = /\.(md|mdx|markdown|txt|text|rst|adoc|asciidoc|org|tex|json|jsonc|ya?ml|toml|ini|cfg|conf|properties|csv|tsv|xml|js|mjs|cjs|jsx|ts|mts|cts|tsx|py|pyi|rb|go|rs|java|kt|kts|scala|swift|m|mm|c|h|cc|cpp|hpp|cs|fs|php|lua|pl|sh|bash|zsh|fish|ps1|sql|graphql|gql|proto|tf|hcl|vue|svelte|astro|ex|exs|erl|clj|dart|r|jl|nim|zig|el|css|scss|less|ipynb)$/i;
const BARE_FILE = /^(readme|license|licence|changelog|contributing|authors|notice|makefile|dockerfile|procfile|gemfile|rakefile|justfile|codeowners|todo)$/i;
// Never read: keys and credentials, lockfiles and built files (noise).
const SECRET_FILE = /^(id_(rsa|dsa|ecdsa|ed25519)(\.pub)?|credentials(\.json)?|service[-_]?account.*\.json|.*\.(pem|key|p12|pfx|jks|keystore|kdbx|ppk|asc|gpg))$/i;
const NOISE_FILE = /^(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|composer\.lock|cargo\.lock|poetry\.lock|gemfile\.lock|go\.sum|.*\.min\.(js|css)|.*\.map)$/i;
const PRIVATE_KEY = /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY/;

const now = () => new Date().toISOString();
const sha = (text) => createHash("sha256").update(text).digest("hex");

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}
// Genter's own files (the config with its secret and keys, the sealed store) are readable by their owner only.
function writeJson(file, data, pretty = false) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, pretty ? 2 : 0), { mode: 0o600 });
  renameSync(tmp, file);
}

// Genter's config (~/.genter/config.json): {} when there is none. One that is not JSON stops here instead of being
// replaced, since it holds the secret of the store and the person's off list.
function readConfig(home) {
  const file = join(home, "config.json");
  let raw;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return {};
  }
  try {
    const config = JSON.parse(raw);
    if (config && typeof config === "object" && !Array.isArray(config)) return config;
  } catch {}
  throw new Error(`${file} is not a JSON object: fix it by hand (it holds the secret that seals Genter's store)`);
}

// The secret that seals the local store: config.json's, made on the first run.
export function localSecret(home = genterHome()) {
  const file = join(home, "config.json");
  const config = readConfig(home);
  if (config.secret) return config.secret;
  const secret = randomBytes(32).toString("base64");
  writeJson(file, { ...config, secret }, true);
  return secret;
}

export function createLocal({ home = genterHome(), secret, userId = "default", openrouterApiKey, embed, cwd = process.cwd(), project = cwd } = {}) {
  secret ??= localSecret(home);
  const { seal, open } = cipher(`${secret}:${userId}:local`);
  const file = join(home, "local.json");
  const notesPath = join(home, "notes.md");
  embed ??= openrouterApiKey ? openrouterEmbedder(openrouterApiKey) : null;
  const texts = new Map(); // path -> { mtimeMs, size, text, digest, read, top }: files read by this process, never stored
  const prepared = new Map(); // anchor id + digest -> its sections, ready to rank
  // The project this Genter searches: the one of the folder it runs in, or of the folder given (`genter mcp <folder>`).
  const { root, by } = projectOf(resolve(cwd, project));
  let state;
  let loadedAt = 0;
  let dirty = false;
  let synced = { sources: new Set(), anchors: new Set(), number: 0 }; // the store as this process last read or wrote it

  // The store, read again when another process (the command while the MCP server runs) wrote it.
  function load() {
    let at = 0;
    try {
      at = statSync(file).mtimeMs;
    } catch {}
    if (state && at === loadedAt) return state;
    const raw = readJson(file, null);
    try {
      state = raw?.blob ? open(raw.blob) : null;
    } catch {
      throw new Error(`${file} was sealed with another secret: move it away to start over`);
    }
    state ??= { v: 2, sources: {}, anchors: {}, vectors: {} };
    loadedAt = at;
    sync();
    split(state);
    numberAll(state);
    return state;
  }
  // A store made by 0.3 holds one list of sources for everything. Split once, when it is first opened: a folder or a
  // file goes to the project whose root holds it (one outside any project is a project of its own folder), a website
  // stays in every project as it was (it is public), and notes stay the person's own. Ids and digests do not change.
  // A source genter-cli 0.3 adds to a split store later (it shares ~/.genter) goes the same way at the next open.
  function split(s) {
    let moved = s.v !== 2;
    for (const src of Object.values(s.sources)) {
      if (src.kind === "notes" || src.projects || src.everywhere) continue;
      if (src.kind === "website") src.everywhere = true;
      else src.projects = [projectOf(src.kind === "file" ? dirname(src.path) : src.path).root];
      moved = true;
    }
    if (!moved) return;
    s.v = 2;
    dirty = true;
    save();
  }
  // Every place has a number, the id search and read name it by over MCP (Genter Cloud's read takes numbers too): given
  // once, kept on its anchor inside the seal and never given to another place, so it stays the same across searches,
  // re-reads and restarts. A store made before numbers gets them at its first open, oldest place first.
  const given = (s) => Object.values(s.anchors ?? {}).reduce((n, a) => Math.max(n, Number.isSafeInteger(a.number) ? a.number : 0), Number.isSafeInteger(s.lastNumber) ? s.lastNumber : 0);
  function nextNumber(s) {
    if (!Number.isSafeInteger(s.lastNumber)) s.lastNumber = given(s);
    return ++s.lastNumber;
  }
  function numberAll(s) {
    const missing = Object.values(s.anchors).filter((a) => !Number.isSafeInteger(a.number));
    if (!missing.length) return;
    missing.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || (a.id < b.id ? -1 : 1));
    for (const a of missing) a.number = nextNumber(s);
    dirty = true;
    save();
  }
  function save() {
    if (!dirty) return;
    merge();
    writeJson(file, { v: 1, blob: seal(state) });
    dirty = false;
    try {
      loadedAt = statSync(file).mtimeMs;
    } catch {}
    sync();
  }
  function sync() {
    synced = { sources: new Set(Object.keys(state.sources)), anchors: new Set(Object.keys(state.anchors)), number: given(state) };
  }
  // Another process wrote the store since this one read it (the command while the MCP server runs, a second client):
  // what it added stays (sources, places and their numbers), what this process forgot stays forgotten, and a place this
  // process numbered meanwhile takes a number above all the store gave, before an answer names it. So no number names
  // two places. Two writes in the same instant (between one's look at the file and its write) can still cross.
  function merge() {
    let at = 0;
    try {
      at = statSync(file).mtimeMs;
    } catch {}
    if (!at || at === loadedAt) return;
    let disk;
    try {
      disk = open(readJson(file, null)?.blob);
    } catch {
      return;
    }
    if (!disk?.anchors) return;
    for (const [id, src] of Object.entries(disk.sources ?? {})) if (!state.sources[id] && !synced.sources.has(id)) state.sources[id] = src;
    for (const [id, a] of Object.entries(disk.anchors)) {
      const mine = state.anchors[id];
      if (!mine) {
        if (!synced.anchors.has(id)) state.anchors[id] = a;
      } else if (mine.number > synced.number && Number.isSafeInteger(a.number)) mine.number = a.number; // numbered by both: the first number given
    }
    const top = given(disk);
    let last = Math.max(top, given(state));
    for (const a of Object.values(state.anchors)) if (a.number > synced.number && a.number <= top && disk.anchors[a.id]?.number !== a.number) a.number = ++last;
    state.lastNumber = last;
  }
  const anchorId = (tool, args) => recipeId({ workspaceId: userId, scope: "", tool, args });
  const place = (a) => (a.args.url ? a.args.url : shown(a.args.path, cwd));
  // A source this project searches: one added in it, a website kept from 0.3, or the person's notes.
  const ours = (src) => Boolean(src) && (src.kind === "notes" || src.everywhere === true || Boolean(src.projects?.includes(root)));
  // A place this project reads: a page of one of its sources, or a file one of its sources holds that it does not leave
  // out (skip, from scope()). read reads nothing else.
  const inProject = (a, skip) => (a.tool === PAGE_READ ? ours(state.sources[a.source]) : Object.values(state.sources).some((src) => ours(src) && src.path && covers(src, a.args.path)) && !skip(a.args.path));

  // ---- what is read ----

  // What a read in this project leaves out, read again at each call (both files may change while the MCP server runs):
  // { skip(path, isFolder), off(path), refused? }. The person's own off list holds everywhere, matched by the path and
  // by where its links lead, so a link never reaches a place switched off. The project's genter.json, and that of each
  // project nested in it (a folder inside with its own genter.json), narrow only places inside them; a refused one is
  // not used at all.
  function scope() {
    const config = join(home, "config.json");
    const off = readConfig(home).off ?? [];
    if (!Array.isArray(off) || off.some((p) => typeof p !== "string")) throw new Error(`${config}: "off" must be a list of paths`);
    const reals = new Map();
    const real = (path) => {
      if (!reals.has(path)) reals.set(path, realOf(path));
      return reals.get(path);
    };
    const named = off.filter((p) => p.trim()).map((p) => resolve(homedir(), expandHome(p.trim())));
    const mine = [...new Set([...named, ...named.map(realOf)])];
    const repo = projectConfig(root, cwd);
    const configs = new Map([[root, repo.refused ? {} : repo]]);
    const configOf = (dir) => {
      if (!configs.has(dir)) {
        const c = projectConfig(dir);
        configs.set(dir, c.refused ? {} : c);
      }
      return configs.get(dir);
    };
    const isOff = (path) => mine.length > 0 && (under(path, mine) || under(real(path), mine));
    const skip = (path, folder = false) => {
      if (isOff(path)) return true;
      for (let dir = folder ? path : dirname(path); under(dir, [root]); dir = dirname(dir)) {
        if (narrows(configOf(dir), path, folder)) return true;
        if (dir === root) break;
      }
      return false;
    };
    return { skip, off: isOff, ...(repo.refused && { refused: repo.refused }) };
  }
  // A place the person switched off is not kept either: its anchor (headings, dates, digest) leaves the store.
  function dropOff({ off }) {
    for (const a of Object.values(state.anchors)) {
      if (!a.args.path || !off(a.args.path)) continue;
      delete state.anchors[a.id];
      texts.delete(a.args.path);
      dirty = true;
    }
  }

  // ---- sources ----

  function sourceFor(target) {
    if (/^https?:\/\//i.test(target)) {
      const url = siteUrl(target);
      return { id: `src_${sha(`website|${url}`).slice(0, 16)}`, kind: "website", url };
    }
    const path = resolve(cwd, expandHome(target));
    let st;
    try {
      st = statSync(path);
    } catch {
      throw new Error(`No such file or folder: ${target}`);
    }
    const kind = st.isDirectory() ? "folder" : "file";
    return { id: `src_${sha(`${kind}|${path}`).slice(0, 16)}`, kind, path };
  }

  // The files of a file or folder source that this project reads, and whether the listing is whole.
  function filesOf(source, skip) {
    if (source.kind === "file" || source.kind === "notes") return { files: skip(source.path) ? [] : [source.path], complete: true };
    return listFolder(source.path, { skip });
  }

  // One read of a file as its Anchor: { record, text, event } with event created | changed | back | unchanged | gone | null.
  function readFile(path, sourceId) {
    const s = state;
    const id = anchorId(FILE_READ, { path });
    const prev = s.anchors[id];
    let st = null;
    try {
      st = statSync(path);
    } catch {}
    if (!st?.isFile()) {
      texts.delete(path);
      if (prev && prev.status !== "gone") {
        s.anchors[id] = { ...prev, status: "gone", checked_at: now() };
        dirty = true;
        return { record: s.anchors[id], event: "gone" };
      }
      return { record: prev, event: null };
    }
    let hit = texts.get(path);
    if (!hit || hit.mtimeMs !== st.mtimeMs || hit.size !== st.size) {
      const text = st.size <= LIMITS.fileBytes ? readText(path) : null;
      if (text == null) return { record: prev, event: null };
      hit = { mtimeMs: st.mtimeMs, size: st.size, text, digest: contentHash(text) };
      texts.set(path, hit);
    }
    const at = now();
    const about = describeFile(path, hit, st);
    if (!prev) {
      s.anchors[id] = { id, number: nextNumber(s), tool: FILE_READ, args: { path }, source: sourceId, ...about, digest: hit.digest, size: st.size, mtimeMs: st.mtimeMs, status: "fresh", created_at: at, updated_at: at, checked_at: at };
      dirty = true;
      return { record: s.anchors[id], text: hit.text, event: "created" };
    }
    if (prev.digest !== hit.digest) {
      s.anchors[id] = { ...prev, ...about, digest: hit.digest, size: st.size, mtimeMs: st.mtimeMs, status: "fresh", updated_at: at, checked_at: at };
      dirty = true;
      return { record: s.anchors[id], text: hit.text, event: "changed" };
    }
    // The replaced mark of a file whose text did not change is still read again: the readers, the language rules or the
    // place it points to may have changed since it was kept (a store made by an earlier version).
    const remarked = JSON.stringify(prev.superseded) !== JSON.stringify(about.superseded);
    if (prev.status !== "fresh" || prev.mtimeMs !== st.mtimeMs || remarked) {
      s.anchors[id] = { ...prev, superseded: about.superseded, status: "fresh", mtimeMs: st.mtimeMs, checked_at: at };
      dirty = true;
      return { record: s.anchors[id], text: hit.text, event: prev.status !== "fresh" ? "back" : "unchanged" };
    }
    return { record: prev, text: hit.text, event: "unchanged" };
  }

  // Title, headings, dates and the replaced mark of a file, from its own text: no model. What the readers read in it, and
  // the mark at its top, are kept with the text this process read (hit.read, hit.top), not in the store, and read again
  // when the file changes; the place a mark points to is looked for at every read (readFile keeps what it finds).
  function describeFile(path, hit, st) {
    const { text } = hit;
    const title = /^#\s+(.+)$/m.exec(text)?.[1].replace(/[`*_]/g, "").trim() || basename(path);
    const items = MARKDOWN.test(path) ? [...new Set(splitMarkdown(path, text).map((p) => p.headings.join(" › ")))].slice(0, 40) : [];
    if (hit.read === undefined) hit.read = readDocument(readerPath(path), text);
    if (hit.top === undefined) hit.top = supersededOf({ title, text: text.slice(0, 1500) });
    const superseded = replacedMark({ title, text: text.slice(0, 1500) }, (link) => (/^https?:/i.test(link) ? link : localLink(path, link)), hit.read, hit.top);
    return { title: title.slice(0, 120), items, source_at: new Date(st.mtimeMs).toISOString(), superseded: superseded ?? undefined };
  }
  // A file's path as readers match it: from the project's root when it is inside it, else as it is; "/" between folders.
  function readerPath(path) {
    const rel = relative(root, path);
    return (rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel : path).split(sep).join("/");
  }

  // A page read as its Anchor, the same way: { record, text, event }.
  function notePage(url, data, sourceId, extra) {
    const s = state;
    const id = anchorId(PAGE_READ, { url });
    const prev = s.anchors[id];
    const digest = contentHash(data);
    const at = now();
    const about = {
      title: String(data.title || url).slice(0, 120),
      items: [...new Set(splitMarkdown(url, data.text).map((p) => p.headings.join(" › ")))].slice(0, 40),
      terms: topTerms(`${data.title}\n${data.text}`),
      ...(extra?.last_modified && { source_at: new Date(extra.last_modified).toISOString() }),
      superseded: (extra?.redirect ?? replacedMark({ title: data.title, text: data.text.slice(0, 1500) }, (link) => absoluteLink(url, link))) ?? undefined,
    };
    if (!prev) {
      s.anchors[id] = { id, number: nextNumber(s), tool: PAGE_READ, args: { url }, source: sourceId, ...about, digest, status: "fresh", created_at: at, updated_at: at, checked_at: at };
      dirty = true;
      return { record: s.anchors[id], text: data.text, event: "created" };
    }
    const event = prev.digest !== digest ? "changed" : prev.status !== "fresh" ? "back" : "unchanged";
    s.anchors[id] = { ...prev, ...about, digest, status: "fresh", checked_at: at, ...(event === "changed" && { updated_at: at }) };
    dirty = true;
    return { record: s.anchors[id], text: data.text, event };
  }

  // Reads a website's pages now (a crawl) and keeps each as an Anchor; a known page the crawl no longer finds is read
  // again so a removed one (404) becomes gone.
  async function readSite(source, depth) {
    const s = state;
    const crawled = await crawl({ url: source.url, depth });
    if (!crawled.successful) throw new Error(crawled.error);
    const stats = { created: 0, changed: 0, unchanged: 0, gone: 0 };
    const seen = new Set();
    for (const p of crawled.data.pages) {
      const { record, event } = notePage(p.url, { url: p.url, title: p.title, text: p.text }, source.id);
      seen.add(record.id);
      if (event === "back") stats.changed++;
      else stats[event]++;
    }
    if (crawled.data.complete) {
      for (const a of Object.values(s.anchors)) {
        if (a.source !== source.id || seen.has(a.id) || a.status !== "fresh") continue;
        forgetPage(a.args.url);
        const got = await readPage({ url: a.args.url });
        if (got.successful) notePage(a.args.url, got.data, source.id, got.source);
        else if (classifyFailure(got.error) === "gone") {
          s.anchors[a.id] = { ...a, status: "gone", checked_at: now() };
          stats.gone++;
          dirty = true;
        }
      }
    }
    return { ...stats, places: crawled.data.pages.length, complete: crawled.data.complete };
  }

  // Lists a file or folder source and reads every file in it this project reads: [{ record, text, event }].
  function readFiles(source, skip) {
    const s = state;
    const { files, complete } = filesOf(source, skip);
    const out = files.map((path) => readFile(path, source.id));
    const listed = new Set(files);
    // A file of this source that a whole listing no longer has is gone (deleted, or ignored now); after a cut-off
    // listing it is read on its own. One this project leaves out is neither read nor gone. A file another source read
    // first (sources of two projects overlap) is gone here only when it is deleted.
    for (const a of Object.values(s.anchors)) {
      if (a.tool !== FILE_READ || a.status !== "fresh" || listed.has(a.args.path) || skip(a.args.path)) continue;
      if (a.source !== source.id && (!covers(source, a.args.path) || existsSync(a.args.path))) continue;
      if (complete) {
        texts.delete(a.args.path);
        s.anchors[a.id] = { ...a, status: "gone", checked_at: now() };
        dirty = true;
        out.push({ record: s.anchors[a.id], event: "gone" });
      } else out.push(readFile(a.args.path, source.id));
    }
    return { reads: out, complete };
  }

  // A source belongs to the projects it was added in (notes to none: they are the person's own). true when it is new
  // to this project.
  function addSource(source) {
    const s = state;
    const had = s.sources[source.id];
    if (ours(had)) return false;
    if (had) s.sources[source.id] = { ...had, projects: [...(had.projects ?? []), root] };
    else s.sources[source.id] = { ...source, ...(source.kind !== "notes" && { projects: [root] }), added_at: now() };
    dirty = true;
    return true;
  }

  function ensureNotes() {
    const source = { id: `src_${sha(`notes|${notesPath}`).slice(0, 16)}`, kind: "notes", path: notesPath };
    if (!existsSync(notesPath)) {
      mkdirSync(home, { recursive: true });
      writeFileSync(notesPath, "# Notes\n\nKept by `genter remember`. Edit or delete anything here: Genter reads this file again on every search.\n");
    }
    addSource(source);
    return source;
  }

  // ---- ranking ----

  // The sections of one read: [{ record, path?, url?, headings, from, to, text, doc }], cut once per content.
  function sectionsOf(record, text) {
    const key = `${record.id}:${record.digest}`;
    const hit = prepared.get(key);
    if (hit) return hit;
    const where = record.args.path ?? record.args.url;
    const starts = lineStarts(text);
    const pieces = cut(where, text, { markdown: MARKDOWN.test(where) || record.tool === PAGE_READ, chunk: LIMITS.chunkChars });
    const name = record.tool === PAGE_READ ? record.title : basename(where);
    const out = pieces
      .map(([start, end, headings]) => {
        const body = text.slice(start, end);
        if (!body.trim()) return null;
        const from = lineOf(starts, start);
        const to = lineOf(starts, Math.max(start, end - 1));
        return { record, headings, from, to, text: body, doc: prepare({ head: `${name} ${headings.join(" ")}`, body }) };
      })
      .filter(Boolean);
    prepared.set(key, out);
    if (prepared.size > 20000) prepared.delete(prepared.keys().next().value);
    return out;
  }

  // Vectors of sections and of the question, from the store or embedded now (only new or changed sections).
  async function vectorsOf(sections, question) {
    const s = state;
    s.vectors ??= {};
    const model = embed.model ?? "";
    const keyOf = (x) => sha(`${model}\n${x.headings.join(" › ")}\n${x.text}`).slice(0, 24);
    const keys = sections.map(keyOf);
    const missing = [...new Set(keys.filter((k) => !s.vectors[k]))];
    const byKey = new Map(sections.map((x, i) => [keys[i], x]));
    const inputs = missing.map((k) => embedText(byKey.get(k)));
    const [q, ...fresh] = await embed([question, ...inputs]);
    missing.forEach((k, i) => {
      s.vectors[k] = toB64(shrink(fresh[i], model));
    });
    if (missing.length) dirty = true;
    // Kept while a project's last search used them: a search in one project does not drop another's.
    s.vectorKeys ??= {};
    const mine = [...new Set(keys)];
    if (String(s.vectorKeys[root]) !== String(mine)) {
      s.vectorKeys[root] = mine;
      dirty = true;
    }
    const used = new Set(Object.values(s.vectorKeys).flat());
    const all = Object.keys(s.vectors);
    if (all.length > used.size * 2 + 2000) {
      for (const k of all) if (!used.has(k)) delete s.vectors[k];
      dirty = true;
    }
    return { query: shrink(q, model), sections: keys.map((k) => fromB64(s.vectors[k])) };
  }

  // ---- marks, dates and whole reads ----

  // Which places' file times are clone times (drift.js cloneWindow), source by source, as the store has them now: a test
  // of an anchor, made once per answer. Such a file's date is unknown: no date of it is shown, and no age fact said.
  function clones() {
    const windows = new Map();
    const windowOf = (id) => {
      if (!windows.has(id)) windows.set(id, cloneWindow(Object.values(state.anchors).filter((a) => a.source === id && a.tool === FILE_READ && a.status === "fresh").map((a) => a.mtimeMs)));
      return windows.get(id);
    };
    return (a) => {
      if (a?.tool !== FILE_READ || a.args.path === notesPath) return false;
      const w = windowOf(a.source);
      return Boolean(w) && a.mtimeMs >= w[0] && a.mtimeMs <= w[1];
    };
  }
  // What the readers read in a file now (readers.js): from the text this process read, else read now; never kept.
  function documentAt(path) {
    let st;
    try {
      st = statSync(path);
    } catch {
      return null;
    }
    let hit = texts.get(path);
    if (!hit || hit.mtimeMs !== st.mtimeMs || hit.size !== st.size) {
      const text = st.isFile() && st.size <= LIMITS.fileBytes ? readText(path) : null;
      if (text == null) return null;
      hit = { mtimeMs: st.mtimeMs, size: st.size, text, digest: contentHash(text) };
      texts.set(path, hit);
    }
    if (hit.read === undefined) hit.read = readDocument(readerPath(path), hit.text);
    return hit.read;
  }
  // The day a place gives itself: the date its document gives (as its readers read it), else its file's time unless that
  // is a clone time; a page's Last-Modified, else when Genter saw it change. null when no day is known.
  const dayOf = (a, cloned) => (a.tool === PAGE_READ ? (a.source_at ?? a.updated_at ?? null) : (documentAt(a.args.path)?.date?.value ?? (cloned(a) ? null : (a.source_at ?? null))));

  // A place's replaced mark as search and read give it: { marker, by?, id?, at?, quote?, line? }. by: what replaces it,
  // shown; id and at: that place's number and its own day, only when this project reads it and its day is known, as a
  // mark never names a place read would refuse; quote: the notice as it reads now, in plain words (never stored); line:
  // where it is, when a reader found it past the place's top.
  function markOf(a, text, skip, cloned) {
    const mark = a.superseded;
    if (!mark) return undefined;
    const by = mark.by && state.anchors[/^https?:\/\//i.test(mark.by) ? anchorId(PAGE_READ, { url: mark.by }) : anchorId(FILE_READ, { path: mark.by })];
    const readable = by?.status === "fresh" && inProject(by, skip);
    const day = readable ? dayOf(by, cloned) : null;
    const notice = mark.marker === "redirect" ? null : noticeAt(text, mark.line);
    const quote = mark.marker === "redirect" ? undefined : noticeWords(notice?.text ?? a.title ?? mark.marker);
    return {
      marker: mark.marker,
      ...(mark.by && { by: /^https?:/i.test(mark.by) ? mark.by : shown(mark.by, cwd) }),
      ...(readable && day && { id: by.number, at: day }),
      ...(quote && { quote: quote.replace(/\s+/g, " ").slice(0, 300) }),
      ...(notice && !notice.top && { line: notice.line }),
    };
  }

  // One place read whole, now, as read gives it: { id, kind, place, path? | url?, title, text?, more?, superseded?,
  // seen, source_at?, dated?, fresh_clone?, gone? | error? }. The text is cut at LIMITS.readChars; more says how many
  // characters were left out; dated: the date its document gives; fresh_clone: its file time is a clone time.
  async function readWhole(a, skip, cloned) {
    let record = a;
    let text = null;
    let event = null;
    let error;
    if (a.tool === PAGE_READ) {
      forgetPage(a.args.url); // read now, not from what a crawl or a search read
      const got = await readPage({ url: a.args.url });
      if (got.successful) ({ record, text, event } = notePage(a.args.url, got.data, a.source, got.source));
      else if (classifyFailure(got.error) === "gone") {
        record = state.anchors[a.id] = { ...a, status: "gone", checked_at: now() };
        dirty = true;
      } else error = got.error;
    } else {
      const r = readFile(a.args.path, a.source);
      record = r.record ?? a;
      text = r.text ?? null;
      event = r.event;
      if (text == null && record.status !== "gone") error = "it cannot be read now (not text, over 1 MB, or it holds a private key)";
    }
    const clone = cloned(record);
    const dated = text != null && record.args.path ? texts.get(record.args.path)?.read?.date?.value : undefined;
    const out = { id: record.number, kind: kindOf(record), place: place(record), ...(record.args.path ? { path: record.args.path } : { url: record.args.url }), title: record.title, ...(record.source_at && !clone && { source_at: record.source_at }), ...(dated && { dated }), ...(clone && { fresh_clone: true }) };
    if (text == null) return { ...out, seen: [], ...(error ? { error } : { gone: true }) };
    const seen = event === "changed" || event === "back" ? ["changed since the last look"] : event === "created" ? ["new since the last look"] : [];
    const superseded = markOf(record, text, skip, cloned);
    return { ...out, text: text.slice(0, LIMITS.readChars), more: Math.max(0, text.length - LIMITS.readChars), ...(superseded && { superseded }), seen };
  }
  const kindOf = (a) => (a.tool === PAGE_READ ? "page" : a.args.path === notesPath ? "notes" : "file");

  // ---- the API ----

  const api = {
    home,
    notesPath,

    // A folder, a file or a public website for this project to search from now on: every file or page it reads is read
    // now and kept as an Anchor. { source, places, created, changed, unchanged, gone, complete, refused? }.
    async add(target, { depth } = {}) {
      if (!target || typeof target !== "string") throw new Error("Pass a folder, a file or a website address");
      load();
      const source = sourceFor(target.trim());
      const sc = scope();
      if (source.path && sc.off(source.path)) throw new Error(`${shown(source.path, cwd)} is switched off ("off" in ${join(home, "config.json")}): Genter does not read it`);
      dropOff(sc);
      const isNew = addSource(source);
      let stats;
      if (source.kind === "website") stats = await readSite(source, depth);
      else {
        const { reads, complete } = readFiles(source, sc.skip);
        stats = { places: reads.filter((r) => r.text != null).length, created: 0, changed: 0, unchanged: 0, gone: 0, complete };
        for (const r of reads) if (r.event) stats[r.event === "back" ? "changed" : r.event]++;
      }
      save();
      return { source: shownSource(state.sources[source.id], cwd), new: isNew, ...stats, ...(sc.refused && { refused: sc.refused }) };
    },

    // The project searched: { root, place, by: "genter.json" | ".git" | "folder", refused? }.
    project() {
      const { refused } = projectConfig(root, cwd);
      return { root, place: shown(root, cwd), by, ...(refused && { refused }) };
    },

    // The sources this project searches, notes included: [{ id, kind, place, places, gone, added_at, everywhere?, off? }].
    sources() {
      const s = load();
      const { off, skip } = scope();
      return Object.values(s.sources)
        .filter(ours)
        .map((src) => {
          const anchors = Object.values(s.anchors).filter((a) => (src.kind === "website" ? a.source === src.id : Boolean(a.args.path) && covers(src, a.args.path) && !skip(a.args.path)));
          return { ...shownSource(src, cwd), places: anchors.filter((a) => a.status === "fresh").length, gone: anchors.filter((a) => a.status === "gone").length, ...(src.everywhere && { everywhere: true }), ...(src.path && off(src.path) && { off: true }) };
        });
    },

    // Stops searching a source in this project, by its id, its path or its address; once no project searches it, its
    // Anchors are dropped, but for those another source still holds (they become that source's). A website kept from
    // 0.3 is in every project, so it is forgotten in all. { source, removed, elsewhere }: elsewhere counts the
    // projects that still search it.
    forget(target) {
      const s = load();
      let id = ours(s.sources[target]) ? target : null;
      if (!id) {
        const want = /^https?:\/\//i.test(target) ? siteUrl(target) : resolve(cwd, expandHome(target));
        id = Object.values(s.sources).find((src) => ours(src) && (src.url ?? src.path) === want)?.id;
      }
      if (!id) throw new Error(`Not a source of this project: ${target} (genter sources lists them)`);
      if (s.sources[id].kind === "notes") throw new Error(`Notes are a file: edit or delete what you want in ${notesPath}`);
      const source = s.sources[id];
      const elsewhere = source.everywhere ? [] : (source.projects ?? []).filter((r) => r !== root);
      let removed = 0;
      if (elsewhere.length) s.sources[id] = { ...source, projects: elsewhere };
      else {
        delete s.sources[id];
        const rest = Object.values(s.sources).filter((src) => src.path);
        for (const a of Object.values(s.anchors)) {
          if (a.source !== id) continue;
          const heir = a.args.path && rest.find((src) => covers(src, a.args.path));
          if (heir) s.anchors[a.id] = { ...a, source: heir.id };
          else {
            delete s.anchors[a.id];
            removed++;
          }
        }
      }
      dirty = true;
      save();
      return { source: shownSource(source, cwd), removed, elsewhere: elsewhere.length };
    },

    // Keeps a note in the notes file (a heading with the time, then the text). Search finds it with its date.
    remember(text) {
      const note = String(text ?? "").trim();
      if (!note) throw new Error("Nothing to remember");
      load();
      ensureNotes();
      const at = now();
      appendFileSync(notesPath, `\n## ${at.slice(0, 16).replace("T", " ")} UTC\n\n${note}\n`);
      save();
      return { path: notesPath, at, text: note };
    },

    // The sections that answer a question, read now from this project's sources and the person's notes. With nothing
    // added in this project yet, its folder is added first (never the home folder or the root).
    // { question, results, changes, searched, semantic, project, added?, ms }.
    async find(question, { limit = 5 } = {}) {
      const started = Date.now();
      const q = String(question ?? "").trim();
      if (!q) throw new Error("Ask a question");
      limit = Math.max(1, Math.min(20, Number(limit) || 5));
      load();
      const sc = scope();
      dropOff(sc);
      let added;
      if (!Object.values(state.sources).some((src) => src.projects?.includes(root)) && !homes().includes(root) && root !== resolve("/") && !sc.off(root)) added = await api.add(root);
      if (existsSync(notesPath)) ensureNotes();
      const reads = [];
      const seenPaths = new Set();
      const changes = [];
      for (const source of Object.values(state.sources)) {
        if (source.kind === "website" || !ours(source)) continue;
        const fresh = added && source.id === added.source.id; // just read whole: nothing "changed since" yet
        for (const r of readFiles(source, sc.skip).reads) {
          if (r.record && r.event && r.event !== "unchanged" && !fresh && !(source.kind === "notes" && r.event === "created")) changes.push({ place: place(r.record), event: r.event === "back" ? "changed" : r.event });
          if (r.text == null || seenPaths.has(r.record.args.path)) continue;
          seenPaths.add(r.record.args.path);
          reads.push(r);
        }
      }
      // Websites: the pages whose saved terms fit are read again now; the rest are not touched.
      const pages = Object.values(state.anchors).filter((a) => a.tool === PAGE_READ && a.status === "fresh" && ours(state.sources[a.source]));
      if (pages.length) {
        const docs = pages.map((a) => ({ tf: new Map(a.terms ?? []), len: (a.terms ?? []).reduce((n, [, c]) => n + c, 0), pairs: new Set() }));
        const scores = bm25(q, docs);
        const picked = pages.map((a, i) => [a, scores[i]]).filter(([, sc]) => sc > 0).sort((a, b) => b[1] - a[1]).slice(0, LIMITS.webCandidates).map(([a]) => a);
        await pool(picked, 4, async (a) => {
          forgetPage(a.args.url); // read now, not from what a crawl or an earlier search read
          const got = await readPage({ url: a.args.url });
          if (got.successful) {
            const r = notePage(a.args.url, got.data, a.source, got.source);
            if (r.event !== "unchanged") changes.push({ place: place(r.record), event: r.event === "back" ? "changed" : r.event });
            reads.push(r);
          } else if (classifyFailure(got.error) === "gone") {
            state.anchors[a.id] = { ...a, status: "gone", checked_at: now() };
            dirty = true;
            changes.push({ place: place(a), event: "gone" });
          }
        });
      }
      // Sections are cut once per content; the record they point to is the one read now.
      const sections = reads.flatMap((r) => sectionsOf(r.record, r.text).map((x) => ({ ...x, record: r.record })));
      const lexical = bm25(q, sections.map((x) => x.doc));
      let scores = lexical;
      let semantic = false;
      if (embed && sections.length) {
        try {
          const v = await vectorsOf(sections, q);
          const cos = v.sections.map((e) => dot(v.query, e));
          scores = fuse(lexical, cos);
          semantic = true;
        } catch (e) {
          semantic = `off: ${e.message.slice(0, 300)}`;
        }
      }
      const order = sections.map((x, i) => [x, scores[i]]).filter(([, sc]) => sc > 0).sort((a, b) => b[1] - a[1]);
      const picked = [];
      const perPlace = new Map();
      for (const [x, score] of order) {
        const n = perPlace.get(x.record.id) ?? 0;
        if (n >= LIMITS.perPlace) continue;
        perPlace.set(x.record.id, n + 1);
        picked.push([x, score]);
        if (picked.length >= limit) break;
      }
      save(); // the places' numbers settle (merge) before a result names them
      const byPath = new Map();
      for (const x of sections) {
        const k = x.record.args.path ?? x.record.args.url;
        if (!byPath.has(k)) byPath.set(k, []);
        byPath.get(k).push(x);
      }
      const results = [];
      const changedNow = new Map(changes.map((c) => [c.place, c.event]));
      const textOf = new Map(reads.map((r) => [r.record.id, r.text]));
      const cloned = clones();
      const mark = (x) => markOf(x.record, textOf.get(x.record.id), sc.skip, cloned);
      const qTerms = new Set(terms(q));
      const scoreOf = new Map(sections.map((x, i) => [x, scores[i]]));
      const placeOf = (x) => x.record.args.path ?? x.record.args.url;
      // The current answer first: a file inside the project's folder that its readers mark as replaced (a decision
      // record's status, a banner at its top, its front matter) by another file inside it, read in this search. What
      // replaces it, or null; any other mark (a place outside the folder on either side, the notes, a page, a mark no
      // reader read) shows on its place and changes no order.
      const inside = (a) => a?.tool === FILE_READ && a.args.path !== notesPath && under(a.args.path, [root]);
      const replacerOf = (a) => {
        const m = a.superseded;
        if (!m?.reader || !m.by || /^https?:/i.test(m.by) || m.by === a.args.path || !inside(a) || !byPath.has(m.by)) return null;
        const by = state.anchors[anchorId(FILE_READ, { path: m.by })];
        return by?.status === "fresh" && inside(by) ? by : null;
      };
      // Each picked section in order. One whose place is replaced that way has what replaces it come first, in its rank:
      // that place's section among the picked ones (moved up), else its best section of all; it follows right after.
      // chain: the places on the way, so two places that name each other end. A place brought from outside the picked
      // ones brings nothing more (follow false): its own mark shows, so a picked section adds one place at most and a
      // chain of replaced files does not grow the answer past the limit.
      const queue = [...picked];
      const emit = ([x, score], chain, follow = true) => {
        const by = follow ? replacerOf(x.record) : null;
        let first = null;
        if (by && !chain.has(by.args.path)) {
          first = results.find((r) => r.path === by.args.path) ?? null;
          if (!first) {
            const at = queue.findIndex(([y]) => placeOf(y) === by.args.path);
            if (at >= 0) first = emit(queue.splice(at, 1)[0], new Set([...chain, placeOf(x)]));
            else {
              const best = [...byPath.get(by.args.path)].sort((a, b) => (scoreOf.get(b) ?? 0) - (scoreOf.get(a) ?? 0))[0];
              first = emit([best, scoreOf.get(best) ?? 0], chain, false);
            }
          }
        }
        const r = result(x, score, results.length + 1, qTerms, changedNow, mark, cloned);
        results.push(r);
        if (first && first.replaces === undefined) first.replaces = r.ref;
        return r;
      };
      while (queue.length) emit(queue.shift(), new Set());
      // The facts of each result's freshness, beside the others of the same answer: facts says all of them in words
      // (the date its document gives, what a replaced place says); freshness holds those about its age alone.
      const others = results.map((o) => o.signals);
      for (const r of results) {
        r.freshness = driftFacts({ ...r.signals, superseded: undefined }, others);
        r.facts = [...r.facts, ...(r.anchor.document?.date ? [`dated ${r.anchor.document.date}`] : []), ...driftFacts(r.signals, others)];
        delete r.signals;
      }
      save();
      return {
        question: q,
        results,
        changes,
        searched: { sources: Object.values(state.sources).filter(ours).length, places: reads.length, sections: sections.length },
        semantic,
        project: { root, place: shown(root, cwd), by, ...(sc.refused && { refused: sc.refused }) },
        ...(added && { added }),
        ms: Date.now() - started,
      };
    },

    // Places read whole, now, by the numbers search gave, LIMITS.readIds at most: { project, results, refused, more? }.
    // results as readWhole gives them; refused: the numbers that are no place of this project (another project's, one
    // switched off or left out, one never given), of which nothing is read; more: the numbers past the limit, not read.
    // An id may be a number or text holding numbers ("[12, 40]"), as a model writes them.
    async read(ids) {
      const wanted = [...new Set([].concat(ids ?? []).flatMap((id) => (typeof id === "string" ? (id.match(/\d+/g) ?? []).map(Number) : [id])).filter((id) => typeof id === "number" && Number.isFinite(id)))];
      if (!wanted.length) throw new Error("Pass the ids search returned");
      load();
      const sc = scope();
      dropOff(sc);
      const byNumber = new Map(Object.values(state.anchors).map((a) => [a.number, a]));
      const results = [];
      const refused = [];
      const cloned = clones();
      for (const n of wanted.slice(0, LIMITS.readIds)) {
        const a = byNumber.get(n);
        if (a && inProject(a, sc.skip)) results.push(await readWhole(a, sc.skip, cloned));
        else refused.push(n);
      }
      save();
      return { project: { root, place: shown(root, cwd), by, ...(sc.refused && { refused: sc.refused }) }, results, refused, ...(wanted.length > LIMITS.readIds && { more: wanted.slice(LIMITS.readIds) }) };
    },
  };

  // One section of the answer: ref is its rank, id its place's number (what read takes); seen holds what Genter saw of
  // it (changed or new since the last look, a note's date), and facts adds what its freshness says, in words. A file
  // whose time is a clone time (cloned) carries no file date: anchor.fresh_clone instead of anchor.source_at.
  function result(x, score, ref, qTerms, changedNow, mark, cloned) {
    const a = x.record;
    const clone = cloned(a);
    const passage = passageOf(x, qTerms);
    const event = changedNow.get(place(a));
    const document = documentOf(a.args.path ? texts.get(a.args.path)?.read : null);
    const facts = [];
    if (event === "changed") facts.push("changed since the last look");
    if (event === "created") facts.push("new since the last look");
    if (a.args.path === notesPath && /^\d{4}-\d{2}-\d{2}/.test(x.headings.at(-1) ?? "")) facts.push(`noted ${x.headings.at(-1)}`);
    const superseded = mark(x);
    return {
      ref,
      id: a.number,
      kind: kindOf(a),
      place: a.args.url ? a.args.url : `${shown(a.args.path, cwd)}:${passage.from}-${passage.to}`,
      ...(a.args.path && { path: a.args.path, lines: [passage.from, passage.to] }),
      ...(a.args.url && { url: a.args.url }),
      title: a.title,
      headings: x.headings,
      text: passage.text,
      score: Number(score.toFixed(3)),
      anchor: { id: a.id, tool: a.tool, args: a.args, status: a.status, updated_at: a.updated_at, ...(a.source_at && !clone && { source_at: a.source_at }), ...(clone && { fresh_clone: true }), ...(a.superseded && { superseded: a.superseded }), ...(document && { document }) },
      ...(superseded && { superseded }),
      seen: [...facts],
      facts,
      signals: { ...(!clone && { source_at: a.source_at, updated_at: a.updated_at }), superseded: superseded && { ...superseded, place: a.args.url ?? shown(a.args.path, cwd) } },
    };
  }

  return api;
}

// The answer as text, for a terminal and for MCP: what changed since the last look (and, once, that the files' dates
// are clone times), then each section under the line that says where it is.
export function findText(out) {
  const lines = [];
  const what = { changed: "changed", created: "is new", gone: "is gone" };
  if (out.changes?.length) lines.push(`Since the last look: ${out.changes.slice(0, 12).map((c) => `${c.place} ${what[c.event] ?? c.event}`).join("; ")}${out.changes.length > 12 ? `; ${out.changes.length - 12} more` : ""}.`, "");
  if (out.results.some((r) => r.anchor?.fresh_clone)) lines.push("File dates unknown (fresh clone): the files were written here within seconds of each other, so only the dates documents give themselves are said.", "");
  if (!out.results.length) {
    lines.push(`Nothing in ${out.searched.places} places matches "${out.question}". Add more with: genter add <folder|file|url>`);
    return lines.join("\n");
  }
  for (const r of out.results) {
    const where = [r.headings?.length ? r.headings.join(" › ") : r.title].filter(Boolean).join("");
    lines.push(`[${r.ref}] ${r.place}${where ? ` · ${where}` : ""}`);
    const facts = [...(r.replaces ? [`replaces [${r.replaces}]`] : []), ...r.facts];
    if (facts.length) lines.push(`    ${facts.join(" · ")}`);
    lines.push(r.text.trim(), "");
  }
  return lines.join("\n").trimEnd();
}

// ---- files ----

function expandHome(p) {
  return p === "~" || p.startsWith("~/") ? join(homedir(), p.slice(1)) : p;
}

// A path for people: relative to the current folder when it is inside it, else from ~.
export function shown(path, cwd = process.cwd()) {
  if (!path) return path;
  const rel = relative(cwd, path);
  if (rel && !rel.startsWith("..") && !isAbsolute(rel)) return rel.split(sep).join("/");
  const home = homedir();
  return path.startsWith(home + sep) ? `~/${relative(home, path).split(sep).join("/")}` : path;
}
const shownSource = (src, cwd) => src && { id: src.id, kind: src.kind, place: src.url ?? shown(src.path, cwd), added_at: src.added_at };

// Whether a path is one of the places given or inside one.
function under(path, places = []) {
  return places.some((p) => path === p || path.startsWith(p.endsWith(sep) ? p : p + sep));
}
// Whether a file or folder source holds a path.
const covers = (src, path) => (src.kind === "folder" ? under(path, [src.path]) : path === src.path);
// Where a path is once its links are followed (for one that is not there, where its nearest folder that is leads).
function realOf(path) {
  try {
    return realpathSync.native(path);
  } catch {
    const up = dirname(path);
    return up === path ? path : join(realOf(up), basename(path));
  }
}
// The home folder, as written and with its links followed.
const homes = (home = homedir()) => [...new Set([resolve(home), realOf(resolve(home))])];

// The project of a folder: walking up from it, the first folder that holds a genter.json or a .git (so a genter.json
// makes a folder inside a repository a project of its own); with neither, the folder itself. The home folder and the
// root are never found by walking up: everything a person has is under them. { root, by: "genter.json" | ".git" | "folder" }.
export function projectOf(folder, home = homedir()) {
  const start = resolve(folder);
  const stop = homes(home);
  for (let dir = start; !stop.includes(dir) && dirname(dir) !== dir; dir = dirname(dir)) {
    let st = null;
    try {
      st = statSync(join(dir, "genter.json"));
    } catch {}
    if (st?.isFile()) return { root: dir, by: "genter.json" };
    if (existsSync(join(dir, ".git"))) return { root: dir, by: ".git" };
  }
  return { root: start, by: "folder" };
}

// A project's genter.json. It comes with a clone, so it can only narrow what the project reads: "include", "exclude"
// and "off", each a list of paths inside the project. One entry outside it (~/…, ../…, an absolute path elsewhere), or
// anything else that is not such a list, and nothing from the file is used. { include?, exclude?, off? } as absolute
// paths, or { refused } with the message that says why.
export function projectConfig(root, cwd = root) {
  const file = join(root, "genter.json");
  let raw;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return {};
  }
  const no = (why) => ({ refused: `${shown(file, cwd)} is not used: ${why}. A project's genter.json can only name paths inside the project, to narrow what Genter reads there.` });
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return no("it is not JSON");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return no("it is not a JSON object");
  const out = {};
  for (const key of ["include", "exclude", "off"]) {
    if (data[key] === undefined) continue;
    if (!Array.isArray(data[key]) || data[key].some((p) => typeof p !== "string")) return no(`"${key}" is not a list of paths`);
    out[key] = [];
    for (const entry of data[key].filter((p) => p.trim())) {
      const path = resolve(root, entry.trim());
      if (/^~/.test(entry.trim()) || entry.split(/[\\/]/).includes("..") || !under(path, [root])) return no(`"${entry}" in "${key}" is outside the project`);
      out[key].push(path);
    }
  }
  return out;
}
// Whether a genter.json's narrowing ({ include?, exclude?, off? }) leaves a path out; a folder holding an included
// path is kept, so the walk reaches it.
function narrows(config, path, folder = false) {
  if (under(path, config.off) || under(path, config.exclude)) return true;
  return Boolean(config.include) && !under(path, config.include) && !(folder && config.include.some((p) => under(p, [path])));
}

// The readable files of a folder: text and code, not hidden, not ignored by its .gitignore, not keys or lockfiles, and
// not what skip(path, isFolder) leaves out.
export function listFolder(root, { skip = () => false } = {}) {
  const ignored = gitignore(root);
  const files = [];
  let complete = true;
  if (skip(root, true)) return { files, complete };
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      if (files.length >= LIMITS.files) {
        complete = false;
        return;
      }
      if (e.name.startsWith(".")) continue;
      const full = join(dir, e.name);
      const rel = relative(root, full).split(sep).join("/");
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name.toLowerCase()) && !ignored(rel, true) && !skip(full, true)) walk(full);
      } else if (e.isFile() && readable(e.name) && !ignored(rel, false) && !skip(full, false)) files.push(full);
    }
  };
  walk(root);
  return { files, complete };
}

export const readable = (name) => (TEXT_FILE.test(name) || BARE_FILE.test(name)) && !SECRET_FILE.test(name) && !NOISE_FILE.test(name);

// The rules of a folder's own .gitignore as a test (rel path, is a folder) -> ignored. Negations are not followed.
function gitignore(root) {
  let lines = [];
  try {
    lines = readFileSync(join(root, ".gitignore"), "utf8").split("\n");
  } catch {}
  const rules = lines
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("!"))
    .map((pattern) => {
      const dirOnly = pattern.endsWith("/");
      let p = pattern.replace(/\/+$/, "");
      const anchored = p.includes("/");
      p = p.replace(/^\//, "");
      const source = p
        .split("**/")
        .map((part) => part.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]"))
        .join("(?:.*/)?");
      const re = new RegExp(`^${source}$`);
      return (rel, isDir) => (!dirOnly || isDir) && (anchored ? re.test(rel) : re.test(rel.split("/").pop()));
    });
  return (rel, isDir) => rules.some((r) => r(rel, isDir));
}

// A file's text, or null for a binary file or one holding a private key.
function readText(path) {
  let buf;
  try {
    buf = readFileSync(path);
  } catch {
    return null;
  }
  if (buf.subarray(0, 8000).includes(0)) return null;
  const text = buf.toString("utf8");
  return PRIVATE_KEY.test(text) ? null : text;
}

// A link in a file to the file it points to, when that file is there; a link that is not a valid escape is as written.
function localLink(from, link) {
  const raw = link.replace(/[#?].*$/, "");
  let clean = raw;
  try {
    clean = decodeURIComponent(raw);
  } catch {}
  if (!clean) return null;
  const target = resolve(dirname(from), clean);
  return existsSync(target) ? target : null;
}
function absoluteLink(from, link) {
  try {
    return new URL(link, from).toString();
  } catch {
    return null;
  }
}

// What the readers read about a document, as a result shows it: { readers, date?, status? } (the document's own words).
const documentOf = (read) => read && { readers: read.readers, ...(read.date && { date: read.date.value }), ...(read.status && { status: read.status.value }) };

// The replaced mark of a document: where a reader says it is (an ADR's Status section, a banner at its top, front
// matter), the one that names what replaces it first; else the language rules' phrases at its top (drift.js). A
// relative link beside it is resolved; a place that is not there is no replacement. Only a mark at the top with no
// place beside it takes the first link of the top lines (as before readers); a reader's mark that names no place that
// is there has none.
function replacedMark(doc, resolveLink, read, top = supersededOf(doc)) {
  const found = read?.marks?.find((m) => m.by) ?? read?.marks?.[0];
  const named = found?.by && (/^https?:/i.test(found.by) ? found.by : resolveLink(found.by));
  if (found && (named || !top)) return { marker: found.marker ?? found.kind, line: found.line, reader: found.reader, ...(named && { by: named }) };
  if (!top || top.by) return top;
  const head = String(doc.text).split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 5).join("\n");
  const link = /\]\(\s*<?([^)\s>]+)>?\s*\)/.exec(head)?.[1];
  const by = link && resolveLink(link);
  return by ? { ...top, by } : top;
}

// The line that marks a document as replaced, as it reads now: the line a reader found it on (from 1), else the first of
// its top lines the language rules mark. { text, line, top } (top: among its first HEAD_LINES lines that are not empty),
// or null. Read again each time, never stored (the store keeps no line of a place's text).
function noticeAt(text, line) {
  const lines = String(text ?? "").split("\n");
  if (line && lines[line - 1]?.trim()) return { text: lines[line - 1].trim(), line, top: lines.slice(0, line).filter((l) => l.trim()).length <= HEAD_LINES };
  const head = String(text ?? "").slice(0, 1500).split("\n");
  for (let i = 0, seen = 0; i < head.length && seen < HEAD_LINES; i++) {
    const l = head[i].trim();
    if (!l) continue;
    seen++;
    if (supersededOf({ text: l })) return { text: l, line: i + 1, top: true };
  }
  return null;
}

// ---- text ----

function lineStarts(text) {
  const out = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) out.push(i + 1);
  return out;
}
function lineOf(starts, offset) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

// The part of a section to show: all of it when short, else the lines around the one holding most of the question's
// words, under the section's first line (its heading).
function passageOf(x, qTerms) {
  const body = x.text.replace(/\s+$/, "");
  if (body.length <= LIMITS.passageChars) return { text: body.replace(/^\n+/, ""), from: x.from, to: x.from + body.split("\n").length - 1 };
  const lines = body.split("\n");
  const weight = lines.map((l) => terms(l).filter((t) => qTerms.has(t)).length);
  let best = weight.indexOf(Math.max(...weight));
  if (best < 0) best = 0;
  let a = best;
  let b = best;
  let size = lines[best].length;
  for (;;) {
    const down = b + 1 < lines.length && size + lines[b + 1].length + 1 <= LIMITS.passageChars;
    if (down) size += lines[++b].length + 1;
    const up = a > 1 && size + lines[a - 1].length + 1 <= LIMITS.passageChars;
    if (up) size += lines[--a].length + 1;
    if (!down && !up) break;
  }
  const head = a > 1 ? `${lines[0]}\n…\n` : a === 1 ? `${lines[0]}\n` : "";
  return { text: head + lines.slice(a, b + 1).join("\n") + (b < lines.length - 1 ? "\n…" : ""), from: x.from + a, to: x.from + b };
}

// ---- vectors ----

// Where embeddings come from: any OpenAI-compatible /embeddings endpoint. The first three need their key in the
// environment; Ollama runs on this computer, so nothing leaves it.
export const PROVIDERS = {
  openai: { url: "https://api.openai.com/v1", env: "OPENAI_API_KEY", model: "text-embedding-3-small" },
  openrouter: { url: "https://openrouter.ai/api/v1", env: "OPENROUTER_API_KEY", model: "openai/text-embedding-3-small" },
  vercel: { url: "https://ai-gateway.vercel.sh/v1", env: "AI_GATEWAY_API_KEY", also: ["AI_GATEWAY_TOKEN"], model: "openai/text-embedding-3-small", free: "google/gemini-embedding-001" },
  ollama: { url: "http://localhost:11434/v1", env: null, model: "nomic-embed-text" },
};

// The provider to embed with: GENTER_EMBED_URL (any endpoint, GENTER_EMBED_KEY, GENTER_EMBED_MODEL), else the one named
// (`name` or GENTER_PROVIDER), else the first whose key is set (OpenAI, OpenRouter, Vercel AI Gateway), else Ollama.
// { name, url, key?, model }.
export function embeddingProvider({ env = process.env, config = {}, name } = {}) {
  const model = env.GENTER_EMBED_MODEL || undefined;
  if (env.GENTER_EMBED_URL) return { name: "custom", url: env.GENTER_EMBED_URL.replace(/\/+$/, ""), key: env.GENTER_EMBED_KEY || undefined, model: model ?? "text-embedding-3-small" };
  const of = (n) => {
    const p = PROVIDERS[n];
    const key = p.env ? [p.env, ...(p.also ?? [])].map((k) => env[k]).find(Boolean) || (n === "openrouter" ? config.openrouter_api_key : undefined) : undefined;
    return { name: n, url: p.url, ...(key && { key }), model: model ?? p.model };
  };
  const named = name || env.GENTER_PROVIDER;
  if (named) {
    if (!PROVIDERS[named]) throw new Error(`Unknown provider "${named}": ${Object.keys(PROVIDERS).join(", ")}, or GENTER_EMBED_URL for any other`);
    const p = of(named);
    if (PROVIDERS[named].env && !p.key) throw new Error(`${named} needs ${PROVIDERS[named].env}`);
    return p;
  }
  return ["openai", "openrouter", "vercel"].map(of).find((p) => p.key) ?? of("ollama");
}

// Embeds texts in batches with a provider; no package. The function carries its model (vectors of two models never mix).
export function embedderFor({ name = "custom", url, key, model }) {
  const embed = async (texts) => {
    const batches = [];
    for (let i = 0; i < texts.length; i += 128) batches.push(texts.slice(i, i + 128));
    const out = await pool(batches, 4, async (input) => {
      let res;
      try {
        res = await fetch(`${url}/embeddings`, {
          method: "POST",
          headers: { ...(key && { Authorization: `Bearer ${key}` }), "Content-Type": "application/json" },
          body: JSON.stringify({ model, input }),
          signal: AbortSignal.timeout(60000),
        });
      } catch (e) {
        if (name === "ollama") throw new Error(`No embeddings: set OPENAI_API_KEY, OPENROUTER_API_KEY or AI_GATEWAY_API_KEY, or run Ollama (ollama pull ${model}), or GENTER_EMBED_URL (${e.cause?.code ?? e.message})`);
        throw e;
      }
      if (!res.ok) {
        const text = (await res.text()).slice(0, 200);
        // Vercel AI Gateway's free tier has no OpenAI embedding models; Google's work there.
        const hint = res.status === 403 && /free tier/i.test(text) && PROVIDERS[name]?.free ? `: on the free tier, set GENTER_EMBED_MODEL=${PROVIDERS[name].free}, or add credits` : "";
        throw new Error(`Embeddings (${name} ${model}) failed: ${res.status}${hint || ` ${text}`}`);
      }
      const data = await res.json();
      return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
    });
    return out.flat();
  };
  return Object.assign(embed, { provider: name, model });
}

// OpenRouter's, the model the hosted engine ranks with.
export const openrouterEmbedder = (apiKey, model = process.env.EMBEDDING_MODEL || PROVIDERS.openrouter.model) => embedderFor({ name: "openrouter", url: PROVIDERS.openrouter.url, key: apiKey, model });

const embedText = (x) => `${x.headings.join(" › ")}\n${x.text.slice(0, 2000)}`;
// Vectors of models trained to be cut keep their first numbers: text-embedding-3 256, gemini-embedding 768; other
// models keep all of theirs.
function shrink(v, model = "") {
  const keep = /text-embedding-3/.test(model) ? LIMITS.dims : /gemini-embedding/.test(model) ? 768 : Infinity;
  const s = Array.from(v).slice(0, keep);
  const n = Math.hypot(...s) || 1;
  return Float32Array.from(s, (x) => x / n);
}
const toB64 = (f32) => Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength).toString("base64");
function fromB64(b64) {
  const buf = Buffer.from(b64, "base64");
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}
function dot(a, b) {
  let s = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) s += a[i] * b[i];
  return s;
}

// Two rankings as one: reciprocal rank fusion of the words' ranking (sections that share a word) and the vectors'
// (their 100 closest sections).
export function fuse(lexical, cosine, k = 60) {
  const out = lexical.map(() => 0);
  const rank = (scores, n) =>
    scores
      .map((s, i) => [s, i])
      .filter(([s]) => s > 0)
      .sort((a, b) => b[0] - a[0])
      .slice(0, n)
      .forEach(([, i], r) => {
        out[i] += 1 / (k + r + 1);
      });
  rank(lexical, Infinity);
  rank(cosine.map((c) => c + 1), 100);
  return out;
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}
