import { createHash } from "node:crypto";

// What local search keeps about a place, with no I/O and no model: its Anchor id (one read call with a fixed argument),
// a digest of what the read returned, whether a failed read means the place is gone, and its Markdown sections. The id
// and the digest are what a person's store is keyed by: changing how they are made makes every place new again.

const sha = (text) => createHash("sha256").update(text).digest("hex");

// Arrays of primitives under these keys are sets: order never matters, duplicates never count.
const SET_KEY = /(ids|labels|tags)$/i;

// Args as one fixed form: keys sorted recursively; undefined, null and "" dropped; strings trimmed; numbers kept;
// arrays keep their order (it can matter) except primitive sets under *ids / *labels / *tags (sorted, deduped).
function canonicalArgs(value, key = "") {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    const items = value.map((v) => canonicalArgs(v)).filter((v) => v !== undefined);
    if (SET_KEY.test(key) && items.every((v) => v === null || ["string", "number", "boolean"].includes(typeof v))) {
      return [...new Set(items)].sort((a, b) => (typeof a === typeof b ? (a < b ? -1 : a > b ? 1 : 0) : String(typeof a).localeCompare(typeof b)));
    }
    return items;
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value).sort()) {
      const v = canonicalArgs(value[k], k);
      if (v === undefined || v === null || v === "") continue;
      out[k] = v;
    }
    return out;
  }
  return value === null ? undefined : value;
}

// "rcp_" + sha256(workspaceId | scope | tool | canonical args)[0..24]: the same read is the same Anchor, whatever the
// order of its args. Local search calls it with the person's user id and an empty scope.
export function recipeId({ workspaceId = "", scope = "", tool, args }) {
  return `rcp_${sha([workspaceId, scope ?? "", tool, JSON.stringify(canonicalArgs(args ?? {}) ?? {})].join("|")).slice(0, 24)}`;
}

// Bookkeeping that changes with every call without the content changing.
const VOLATILE_KEY = /^(etag|headers|next_?page_?token|next_?page|next_?cursor|cursor|next_?link|request_?id|log_?id|nonce|fetched_?at|x-[\w-]+)$|_url$|Url$/;

function normalize(value) {
  if (typeof value === "string") return value.replace(/\r\n?/g, "\n").trim();
  if (Array.isArray(value)) return value.map((v) => normalize(v));
  if (value && typeof value === "object") {
    let obj = value;
    // Base64 file contents are decoded, so a re-encoding does not count as a change.
    if (obj.encoding === "base64" && typeof obj.content === "string") {
      obj = { ...obj, content: Buffer.from(obj.content.replace(/\s+/g, ""), "base64").toString("utf8"), encoding: undefined };
    }
    const out = {};
    for (const k of Object.keys(obj).sort()) {
      if (VOLATILE_KEY.test(k)) continue;
      const v = normalize(obj[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  return value === undefined ? undefined : value;
}

// sha256 of the normalized result (a file's text, a page's { url, title, text }). Equal hash == "unchanged".
export function contentHash(data) {
  return sha(JSON.stringify(normalize(data) ?? null));
}

// A failed read, classified. "gone": what it points to is not there any more. "denied": it may not (or no longer can)
// be read. Anything else (a timeout, a bad argument, a rate limit) is null: a transient failure never changes an Anchor.
export function classifyFailure(error) {
  const text = typeof error === "string" ? error : error instanceof Error ? error.message : JSON.stringify(error ?? "");
  if (!text) return null;
  if (/rate.?limit|too many requests|\b429\b|timed? ?out|timeout|temporar|try again|\b5\d\d\b|econnreset|socket/i.test(text) && !/not found|forbidden/i.test(text)) return null;
  if (/(connected ?account|connection|auth ?config|account) (was |is |has been )?(not found|deleted|revoked|disabled|inactive|expired|removed)|(revoked|invalid[_ ]grant|token (has )?expired|expired token|invalid[_ ]token|bad credentials)/i.test(text)) return "denied";
  if (/not found|\b404\b|does not exist|doesn'?t exist|no longer exists?|was deleted|has been deleted|\bgone\b|\b410\b|no such (file|object|repo|page|item|thread|event|document)|could not find/i.test(text)) return "gone";
  if (/forbidden|\b403\b|unauthori[sz]ed|\b401\b|permission|access denied|not accessible|insufficient (scope|permission)|denied/i.test(text)) return "denied";
  return null;
}

// ---- Markdown -> sections ----

const SECTION = { chars: 6000, depth: 3 }; // a section longer than this is cut at paragraph borders; # to ### start one

const slug = (text) =>
  String(text)
    .toLowerCase()
    .replace(/[`*_~[\]()]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "section";

// Cuts one Markdown file into sections by its headings (levels 1-3), deterministically and without any model. A heading
// inside a fenced code block is not a heading. Text before the first heading is the "intro" section. A section longer
// than SECTION.chars is cut at blank lines into parts. A heading with no text of its own gives no section (its
// children carry it in their path). Sections keep offsets into the file, so the text is never stored twice.
// Returns [{ id, path, title, headings, level, start, end }].
export function splitMarkdown(path, text) {
  const src = String(text);
  const sections = [];
  let current = { headings: [], level: 0, start: 0 };
  const stack = [];
  let fence = null;
  let offset = 0;
  for (const line of src.split("\n")) {
    const lineStart = offset;
    offset += line.length + 1;
    const f = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      continue;
    }
    if (fence) continue;
    const h = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line);
    if (!h || h[1].length > SECTION.depth) continue;
    sections.push({ ...current, end: lineStart });
    const level = h[1].length;
    while (stack.length && stack.at(-1).level >= level) stack.pop();
    stack.push({ level, title: h[2].replace(/[`*_]/g, "").trim() });
    current = { headings: stack.map((s) => s.title), level, start: lineStart };
  }
  sections.push({ ...current, end: src.length });

  const used = new Map();
  const unique = (base) => {
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    return n === 1 ? base : `${base}~${n}`;
  };
  const out = [];
  for (const s of sections) {
    const body = src.slice(s.start, s.end);
    // Only the heading line (or only blanks): nothing to read here.
    const own = s.level ? body.replace(/^[^\n]*\n?/, "") : body;
    if (!own.trim()) continue;
    const headings = s.headings.length ? s.headings : [];
    const title = headings.at(-1) ?? "Introduction";
    const base = unique(`${path}#${s.headings.length ? headings.map(slug).join("/") : "intro"}`);
    const parts = body.length > SECTION.chars ? cutParts(src, s.start, s.end) : [[s.start, s.end]];
    parts.forEach(([start, end], i) => {
      out.push({ id: parts.length > 1 ? `${base}.p${i + 1}` : base, path, title: parts.length > 1 ? `${title} (part ${i + 1})` : title, headings: headings.length ? headings : ["Introduction"], level: s.level, start, end });
    });
  }
  return out;
}

// Cuts [start, end) at blank lines into parts of about SECTION.chars; a single paragraph longer than that is cut at a line break.
function cutParts(src, start, end) {
  const parts = [];
  let from = start;
  while (end - from > SECTION.chars) {
    const window = src.slice(from, from + SECTION.chars);
    let cut = window.lastIndexOf("\n\n");
    if (cut < SECTION.chars / 3) cut = window.lastIndexOf("\n");
    if (cut < SECTION.chars / 3) cut = SECTION.chars;
    parts.push([from, from + cut]);
    from += cut;
    while (src[from] === "\n") from++;
  }
  parts.push([from, end]);
  return parts;
}

// ---- any text -> the pieces search ranks ----

// A file whose name says it is Markdown.
export const MARKDOWN_FILE = /\.(md|mdx|markdown)$/i;

// The pieces local search ranks a text by, the same for every caller (the engine, and a benchmark's plain ranking over
// the same sections): [[start, end, headings]]. Markdown (by its name, or a web page) is cut by its headings
// (splitMarkdown; the text before the first heading has none); any other text into blocks of about `chunk` characters.
export function pieces(where, text, { markdown = MARKDOWN_FILE.test(where), chunk = 1500 } = {}) {
  if (markdown) return splitMarkdown(where, text).map((p) => [p.start, p.end, p.headings[0] === "Introduction" && p.headings.length === 1 ? [] : p.headings]);
  return blocks(text, chunk).map(([a, b]) => [a, b, []]);
}

// Text that is not Markdown, cut at blank lines into blocks of about `chunk` characters: [[start, end]].
export function blocks(text, chunk = 1500) {
  const out = [];
  let start = 0;
  let last = 0;
  const re = /\n[ \t]*\n/g;
  let m = re.exec(text);
  while (m) {
    if (m.index - start > chunk && last > start) {
      out.push([start, last]);
      start = last;
    }
    last = m.index + m[0].length;
    m = re.exec(text);
  }
  if (text.length - start > chunk * 1.5 && last > start) {
    out.push([start, last]);
    start = last;
  }
  out.push([start, text.length]);
  // A block still longer than three blocks (no blank lines): cut at line ends.
  return out.flatMap(([a, b]) => {
    if (b - a <= chunk * 3) return [[a, b]];
    const parts = [];
    let from = a;
    while (b - from > chunk) {
      const cut = text.lastIndexOf("\n", from + chunk);
      const to = cut > from ? cut + 1 : from + chunk;
      parts.push([from, to]);
      from = to;
    }
    parts.push([from, b]);
    return parts;
  });
}
