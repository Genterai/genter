import { phrases } from "./readers.js";

// Anchor Drift: facts about how fresh an anchor's source is, shown next to a result. Genter states facts only (dates, a
// "replaced" mark the source carries itself, quoted as the source says it) and never says whether the source is right:
// comparing sources by meaning is the client's agent's job. No model is called here.

export const STALE_DAYS = 365; // an anchor's source older than this is "old" ...
export const SIBLING_RECENT_DAYS = 30; // ... when another source in the same answer changed within this
export const HEAD_LINES = 4; // a replaced-mark counts only in the first lines of a document ...
export const HEAD_LINE_MAX = 200; // ... and in a short line (a notice or a heading, not a paragraph)
export const CLONE_MIN_FILES = 5; // a folder whose files were written at once (a fresh clone) has at least this many ...
export const CLONE_GAP_MS = 2000; // ... each written within this of the one before
const DAY = 86_400_000;

// The marks of "this is replaced", as a document puts them at its top: the phrases of the language rules
// (rules/<lang>.json, read by readers.js). Each is a notice form, so a word inside a sentence about something else
// ("deprecated API handling", `deprecated_fn()`) is not one.
const TEXT_KEYS = ["title", "name", "subject", "heading", "text", "content", "body", "markdown", "description", "plain_text"];
const BOOL_MARKS = [["archived", /^(is_?)?archived$/i], ["deprecated", /^(is_?)?deprecated$/i], ["obsolete", /^(is_?)?obsolete$/i]];
const URL_RE = /https?:\/\/[^\s)>\]"'<]+/;

// { marker, by? } when the result is ONE document that marks itself as replaced at its top (its title or its first
// lines), or carries a flag (archived: true); null otherwise. A list never is: one item's mark is not the list's.
export function supersededOf(data) {
  let doc = Array.isArray(data) ? (data.length === 1 ? data[0] : null) : data;
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return null;
  if (!TEXT_KEYS.some((k) => typeof doc[k] === "string")) {
    const inner = Object.values(doc).find((v) => v && typeof v === "object" && !Array.isArray(v) && TEXT_KEYS.some((k) => typeof v[k] === "string"));
    if (inner) doc = inner;
  }
  for (const [marker, re] of BOOL_MARKS) {
    const flagged = Object.entries(doc).find(([k, v]) => v === true && re.test(k));
    if (flagged) return { marker };
  }
  const lines = [];
  for (const k of TEXT_KEYS) {
    if (typeof doc[k] !== "string") continue;
    const own = k === "title" || k === "name" || k === "subject" || k === "heading";
    const take = doc[k].slice(0, 1500).split("\n").map((l) => l.trim()).filter(Boolean).slice(0, own ? 1 : HEAD_LINES);
    take.forEach((l, i) => {
      lines.push([l, doc[k].slice(0, 1500).split("\n").map((x) => x.trim()).filter(Boolean)[i + 1]]);
    });
  }
  for (const [line, next] of lines) {
    if (line.length > HEAD_LINE_MAX) continue;
    for (const { marker, find } of phrases()) {
      const at = find(line);
      if (at < 0) continue;
      const rest = line.slice(at);
      const by = URL_RE.exec(rest)?.[0] ?? (next && next.length <= HEAD_LINE_MAX ? URL_RE.exec(next)?.[0] : undefined);
      return { marker, ...(by && { by: by.replace(/[.,;:!?]+$/, "") }) };
    }
  }
  return null;
}

// A site's address as a page identity, so http/https, www, a trailing slash or #fragment is no move.
const pageKey = (u) => String(u).replace(/#.*$/, "").replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "").toLowerCase();
// A requested URL that ended up on another page after redirects is that page's replacement.
export const redirectOf = (requested, final) => (requested && final && pageKey(requested) !== pageKey(final) ? { marker: "redirect", by: final } : null);

// The files of a folder written here at one moment (a fresh clone, a copy, an unpacked archive): their times say when
// they were written here, not when anyone changed them. The run of times from the oldest, each within CLONE_GAP_MS of
// the one before, when it holds at least CLONE_MIN_FILES files and at least half of them: [first, last] in ms; else
// null. A clone writes every file first, so a later run (a pull, a branch switch, a formatter) is edits, and a file
// changed after the clone has a time of its own, outside the run.
export function cloneWindow(times) {
  const t = times.filter(Number.isFinite).sort((a, b) => a - b);
  let end = 0;
  while (end + 1 < t.length && t[end + 1] - t[end] <= CLONE_GAP_MS) end++;
  const n = t.length ? end + 1 : 0;
  return n >= CLONE_MIN_FILES && n * 2 >= t.length ? [t[0], t[end]] : null;
}

// A notice as plain words, the way a person reads it: the line without Markdown's signs (a quote's ">", a heading's "#",
// a list's "-", emphasis, code ticks, an alert's "[!WARNING]", HTML tags and comments, a code comment's "//"), a link as
// its text, and a code span word for word, only its ticks gone. A line that is all signs stays as it is.
const HTML_TAG = /<\/?(?:a|abbr|aside|b|blockquote|br|center|code|del|details|div|em|font|h[1-6]|hr|i|img|ins|kbd|mark|p|pre|s|section|small|span|strike|strong|sub|summary|sup|u)\b[^>\n]{0,200}>|<!--|-->/gi;
export function noticeWords(line) {
  const raw = String(line ?? "").trim();
  const code = [];
  const words = raw
    .replace(/[\uE000\uE001]/g, "")
    .replace(/(`+)([^\n]{0,300}?[^`\n])\1(?!`)/g, (_, _ticks, span) => `\uE000${code.push(span.trim()) - 1}\uE001`)
    .replace(/!?\[([^\]\n]{0,200})\]\([^)\n]{0,400}\)/g, "$1")
    .replace(/\[\[([^\]|\n]{1,200})(?:\|([^\]\n]{1,200}))?\]\]/g, (_, page, label) => label ?? page)
    .replace(HTML_TAG, "")
    .replace(/^\s*(?:\/\/+|\/\*+|\*\/)\s*|\s*\*\/\s*$/g, "")
    .replace(/^(?:>\s*)+/, "")
    .replace(/^#{1,6}\s+/, "")
    .replace(/^(?:[-*+]|\d{1,3}[.)])\s+/, "")
    .replace(/\[![a-z]{1,20}\]\s*/gi, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/(^|[\s(])[*_](\S(?:[^*_\n]{0,200}\S)?)[*_](?=[\s).,:;!?]|$)/g, "$1$2")
    .replace(/\uE000(\d+)\uE001/g, (_, i) => code[i])
    .replace(/\s+/g, " ")
    .trim();
  return words || raw;
}

const month = (iso) => String(iso).slice(0, 7);
const at = (s) => s?.source_at ?? s?.updated_at ?? null;

// The facts shown next to one result, from its signals and the signals of the other results of the same answer:
// [] when nothing deviates (then nothing is added: a note on every line would be ignored). No verdict, only facts: a
// replaced mark is what the place says, quoted ({ place, quote, line? }: line when a reader found it past its top), and
// an age is said only from a date the source gives (a file written in a fresh clone gives none: no source_at).
export function driftFacts(signals, others = [], { now = Date.now() } = {}) {
  if (!signals) return [];
  const facts = [];
  const mine = at(signals);
  const t = mine && Date.parse(mine);
  if (signals.superseded) {
    const { marker, by, place, quote, line } = signals.superseded;
    facts.push(marker === "redirect" ? `address now redirects to ${by}` : `${place} says ${line ? `at line ${line}` : "at its top"}: "${quote ?? marker}"`);
  }
  if (t && now - t > STALE_DAYS * DAY) {
    const label = `${signals.source_at ? "source" : "anchor content"} last changed ${month(mine)}`;
    const recent = others.filter((o) => o !== signals).map(at).map((d) => d && Date.parse(d)).filter((x) => x && now - x <= SIBLING_RECENT_DAYS * DAY);
    if (recent.length) facts.unshift(`${label}; ${recent.length > 1 ? "other sources" : "another source"} in this answer changed within the last ${SIBLING_RECENT_DAYS} days`);
  }
  return facts;
}
