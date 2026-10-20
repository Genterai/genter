import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Format readers: data that turns a document's text into what the document says about itself: its date, its status,
// and the explicit marks that it, or a part of it, is replaced (superseded by, deprecated, removed), with the place that
// replaces it. A reader is a JSON manifest (readers/<name>/reader.json, described by readers/reader.schema.json) that
// this file interprets: nothing in a manifest is ever run, a reader reaches nothing but the text it is given, and the
// same text always gives the same output. Its patterns are a small language of their own (pattern(), below), matched
// here by a machine that keeps every way at once instead of backtracking, so a pattern's time is linear in the line
// whatever it says. The phrases that mark a document as replaced are data too (rules/<lang>.json), each with the lines
// it must mark and the lines it must not.

export const LIMITS = { lines: 400, lineChars: 400, noticeChars: 200, patternChars: 300, repeat: 200, states: 2000, groups: 6, classItems: 64, marks: 20, entries: 200, globChars: 120, globWildcards: 6, work: 1_000_000 };
export const KINDS = ["superseded", "deprecated", "obsolete", "archived", "moved", "removed", "unmaintained"];
// The package's folder, from this file's own path: a URL made of a relative path and import.meta.url is, to a bundler,
// a file to bring in that is not there, and an app that imports genter-cli/local (which imports this file) is bundled.
const DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
export const READERS_DIR = join(DIR, "readers");
export const RULES_DIR = join(DIR, "rules");

// ---- the pattern language ----
// Literals, `.`, classes ([a-z], [^)], \d \s \w and their capitals), anchors (^ $ \b), groups ((…) and (?:…)) with
// alternation, and bounded repeats (? {n} {n,m}, m at most 200) of something that holds no repeat itself. A line is
// matched without case; \w and \b know every alphabet (Cyrillic included), unlike JavaScript's.

const WORD = /[\p{L}\p{N}_]/u;
const SPACE = /\s/;
const isWord = (ch) => ch !== undefined && ch !== "" && WORD.test(ch);
const lower = (ch) => {
  const l = ch.toLowerCase();
  return l.length === 1 ? l : ch;
};
const upper = (ch) => {
  const u = ch.toUpperCase();
  return u.length === 1 ? u : ch;
};
// A line lowered as the machine lowers it, one character at a time: the engine's own lowering when it keeps every
// character in place (all but a final sigma and a few letters that grow), and the last line is remembered, since every
// phrase looks at the same line in turn.
let lastLine;
let lastLow;
const lowered = (s) => {
  if (s === lastLine) return lastLow;
  let out = s.toLowerCase();
  if (out.length !== s.length || s.includes("Σ")) {
    out = "";
    for (let i = 0; i < s.length; i++) out += lower(s[i]);
  }
  lastLine = s;
  lastLow = out;
  return out;
};

function parse(src) {
  if (typeof src !== "string" || !src) throw new Error("a pattern is a string that is not empty");
  if (src.length > LIMITS.patternChars) throw new Error(`longer than ${LIMITS.patternChars} characters`);
  let i = 0;
  let groups = 0;
  const fail = (why) => {
    throw new Error(`${why}, at ${i}`);
  };
  const holdsRepeat = (n) => n.t === "repeat" || (n.t === "group" && holdsRepeat(n.body)) || (n.t === "seq" && n.items.some(holdsRepeat)) || (n.t === "alt" && n.branches.some(holdsRepeat));

  function alt() {
    const branches = [seq()];
    while (src[i] === "|") {
      i++;
      branches.push(seq());
    }
    return branches.length === 1 ? branches[0] : { t: "alt", branches };
  }
  function seq() {
    const items = [];
    while (i < src.length && src[i] !== "|" && src[i] !== ")") {
      const node = atom();
      items.push(i < src.length && "?*+{".includes(src[i]) ? repeat(node) : node);
    }
    if (!items.length) fail("an empty alternative");
    return items.length === 1 ? items[0] : { t: "seq", items };
  }
  function atom() {
    const c = src[i];
    if (c === "(") {
      i++;
      let n = 0;
      if (src[i] === "?") {
        if (src[i + 1] === "=" || src[i + 1] === "!" || (src[i + 1] === "<" && (src[i + 2] === "=" || src[i + 2] === "!"))) fail("a lookaround");
        if (src[i + 1] !== ":") fail("a group other than (…) and (?:…)");
        i += 2;
      } else n = ++groups;
      const body = alt();
      if (src[i] !== ")") fail("a ( that is not closed");
      i++;
      return { t: "group", n, body };
    }
    if (c === "[") return set();
    if (c === "\\") return escaped();
    if ("*+?{".includes(c)) fail("nothing to repeat");
    if (c === "]" || c === "}") fail(`a ${c} that opens nothing (write \\${c})`);
    i++;
    if (c === ".") return { t: "any" };
    if (c === "^") return { t: "bol" };
    if (c === "$") return { t: "eol" };
    return { t: "char", c: lower(c) };
  }
  // \d \s \w and their capitals, \b, or a sign written as itself (\. \( \/ …); no backreference, no property.
  function escaped() {
    const c = src[i + 1];
    if (c === undefined) fail("a \\ at the end");
    if (/[0-9]/.test(c) || c === "k") fail("a backreference");
    if (c === "p" || c === "P") fail("a Unicode property (write the characters in a class)");
    i += 2;
    if ("dswDSW".includes(c)) return { t: "set", neg: false, items: [{ esc: c }] };
    if (c === "b") return { t: "wordb" };
    if (/[A-Za-z]/.test(c)) {
      i -= 2;
      fail(`\\${c}, which the language does not have`);
    }
    return { t: "char", c: lower(c) };
  }
  function set() {
    const start = i++;
    const neg = src[i] === "^";
    if (neg) i++;
    const items = [];
    while (i < src.length && src[i] !== "]") {
      const lo = member();
      if (lo.esc) items.push(lo);
      else if (src[i] === "-" && src[i + 1] !== undefined && src[i + 1] !== "]") {
        i++;
        const hi = member();
        if (hi.esc) fail("a range to a class");
        if (hi.ch < lo.ch) fail("a range that runs backwards");
        items.push({ lo: lo.ch, hi: hi.ch });
      } else items.push({ lo: lo.ch, hi: lo.ch });
      if (items.length > LIMITS.classItems) fail(`a class of more than ${LIMITS.classItems} items`);
    }
    if (src[i] !== "]") {
      i = start;
      fail("a [ that is not closed");
    }
    if (!items.length) fail("an empty class");
    i++;
    return { t: "set", neg, items };
  }
  function member() {
    const c = src[i];
    if (c === "\\") {
      const e = src[i + 1];
      if (e === undefined) fail("a \\ at the end");
      if (/[0-9A-Za-z]/.test(e) && !"dswDSW".includes(e)) fail(`\\${e} in a class, which the language does not have`);
      i += 2;
      return "dswDSW".includes(e) ? { esc: e } : { ch: e };
    }
    if (c >= "\ud800" && c <= "\udfff") fail("a character outside the basic plane in a class");
    i++;
    return { ch: c };
  }
  function repeat(node) {
    const c = src[i];
    if (c === "*" || c === "+") fail(`an unbounded repeat ${c} (write {0,N} or {1,N}, N at most ${LIMITS.repeat})`);
    let min = 0;
    let max = 1;
    if (c === "?") i++;
    else {
      const m = /^\{(\d{1,4})(,(\d{0,4}))?\}/.exec(src.slice(i));
      if (!m) fail("a { that is not {n} or {n,m}");
      min = Number(m[1]);
      max = m[2] === undefined ? min : m[3] === "" ? Infinity : Number(m[3]);
      if (max === Infinity) fail(`an unbounded repeat {${min},} (write {${min},N}, N at most ${LIMITS.repeat})`);
      if (max > LIMITS.repeat) fail(`a repeat above ${LIMITS.repeat}`);
      if (max < 1 || min > max) fail("a repeat {n,m} needs n ≤ m and m ≥ 1");
      i += m[0].length;
    }
    if (node.t === "bol" || node.t === "eol" || node.t === "wordb") fail("nothing to repeat");
    if (holdsRepeat(node)) fail("a nested quantifier (a repeated group cannot hold a repeat: write two rules)");
    if (i < src.length && "?*+{".includes(src[i])) fail("a quantifier after a quantifier");
    return { t: "repeat", node, min, max };
  }

  const node = alt();
  if (i < src.length) fail("a ) that closes no group");
  if (groups > LIMITS.groups) throw new Error(`more than ${LIMITS.groups} groups`);
  return { node, groups };
}

const CHAR = 1;
const ANY = 2;
const SET = 3;
const SPLIT = 4;
const JMP = 5;
const SAVE = 6;
const BOL = 7;
const EOL = 8;
const WORDB = 9;
const MATCH = 10;

// The pattern as steps of a machine: a repeat {n,m} is n copies, then m-n copies each of which may be skipped.
function program(node, groups) {
  const code = [];
  const push = (ins) => {
    if (code.push(ins) > LIMITS.states) throw new Error(`more than ${LIMITS.states} steps once its repeats are counted`);
    return ins;
  };
  const emit = (n) => {
    if (n.t === "char") push({ op: CHAR, c: n.c });
    else if (n.t === "any") push({ op: ANY });
    else if (n.t === "set") push({ op: SET, set: n });
    else if (n.t === "bol") push({ op: BOL });
    else if (n.t === "eol") push({ op: EOL });
    else if (n.t === "wordb") push({ op: WORDB });
    else if (n.t === "seq") for (const x of n.items) emit(x);
    else if (n.t === "group") {
      if (n.n) push({ op: SAVE, n: 2 * n.n });
      emit(n.body);
      if (n.n) push({ op: SAVE, n: 2 * n.n + 1 });
    } else if (n.t === "alt") {
      const jumps = [];
      for (const b of n.branches.slice(0, -1)) {
        const split = push({ op: SPLIT, x: code.length + 1, y: -1 });
        emit(b);
        jumps.push(push({ op: JMP, x: -1 }));
        split.y = code.length;
      }
      emit(n.branches.at(-1));
      for (const j of jumps) j.x = code.length;
    } else if (n.t === "repeat") {
      for (let k = 0; k < n.min; k++) emit(n.node);
      const splits = [];
      for (let k = n.min; k < n.max; k++) {
        splits.push(push({ op: SPLIT, x: code.length + 1, y: -1 }));
        emit(n.node);
      }
      for (const s of splits) s.y = code.length;
    }
  };
  push({ op: SAVE, n: 0 });
  emit(node);
  push({ op: SAVE, n: 1 });
  push({ op: MATCH });
  return { code, slots: 2 * (groups + 1) };
}

const inItems = (items, ch) =>
  items.some((it) => {
    if (!it.esc) return ch >= it.lo && ch <= it.hi;
    const yes = it.esc.toLowerCase() === "d" ? ch >= "0" && ch <= "9" : it.esc.toLowerCase() === "s" ? SPACE.test(ch) : isWord(ch);
    return it.esc === it.esc.toLowerCase() ? yes : !yes;
  });
const inSet = (set, ch) => (inItems(set.items, ch) || inItems(set.items, lower(ch)) || inItems(set.items, upper(ch))) !== set.neg;

// The steps the machine may still take while one reader reads one document (readWith): a reader whose patterns are each
// linear but many and wide gives up on a document past LIMITS.work steps, the same way for the same text.
let work = Infinity;
const OUT_OF_WORK = new Error("out of work");

// The leftmost match in a line, preferring the longer way at each repeat and the earlier branch at each alternative (as
// JavaScript would), by running every thread of the machine side by side: time linear in the line. The slots of the
// match (start, end, then each group's), or null.
function run({ code, slots }, line) {
  const len = line.length;
  const mark = new Int32Array(code.length).fill(-1);
  let matched = null;
  const add = (list, pc, caps, i) => {
    if (mark[pc] === i) return;
    mark[pc] = i;
    work--;
    const ins = code[pc];
    if (ins.op === JMP) add(list, ins.x, caps, i);
    else if (ins.op === SPLIT) {
      add(list, ins.x, caps, i);
      add(list, ins.y, caps, i);
    } else if (ins.op === SAVE) {
      const next = caps.slice();
      next[ins.n] = i;
      add(list, pc + 1, next, i);
    } else if (ins.op === BOL) {
      if (i === 0) add(list, pc + 1, caps, i);
    } else if (ins.op === EOL) {
      if (i === len) add(list, pc + 1, caps, i);
    } else if (ins.op === WORDB) {
      if (isWord(line[i - 1]) !== isWord(line[i])) add(list, pc + 1, caps, i);
    } else list.push(pc, caps);
  };
  let list = [];
  for (let i = 0; i <= len; i++) {
    if (work < 0) throw OUT_OF_WORK;
    if (!matched) add(list, 0, new Array(slots).fill(-1), i);
    if (!list.length) {
      if (matched) break;
      continue;
    }
    const next = [];
    const ch = line[i];
    const lc = i < len ? lower(ch) : "";
    for (let k = 0; k < list.length; k += 2) {
      const ins = code[list[k]];
      if (ins.op === MATCH) {
        matched = list[k + 1];
        break; // the threads after it are less preferred
      }
      if (i < len && (ins.op === ANY || (ins.op === CHAR ? ins.c === lc : inSet(ins.set, ch)))) add(next, list[k] + 1, list[k + 1], i + 1);
    }
    list = next;
  }
  return matched;
}

// The literals one of which every match holds (lowercase), to skip a line without running the machine; null if none.
function needOf(n) {
  if (n.t === "char") return [n.c];
  if (n.t === "group") return needOf(n.body);
  if (n.t === "repeat") return n.min > 0 ? needOf(n.node) : null;
  if (n.t === "alt") {
    const all = n.branches.map(needOf);
    return all.some((x) => !x) ? null : all.flat();
  }
  if (n.t !== "seq") return null;
  const weight = (list) => Math.min(...list.map((s) => s.length));
  let best = null;
  let run = "";
  const offer = (list) => {
    if (list && (!best || weight(list) > weight(best))) best = list;
  };
  for (const x of n.items) {
    if (x.t === "char") {
      run += x.c;
      continue;
    }
    offer(run ? [run] : null);
    run = "";
    offer(needOf(x));
  }
  offer(run ? [run] : null);
  return best;
}

// A pattern of the readers' language, ready: { source, groups, exec(line) → { index, end, group(n) } | null }. Throws
// with what is wrong and where.
export function pattern(source) {
  const { node, groups } = parse(source);
  const prog = program(node, groups);
  const need = needOf(node);
  return {
    source,
    groups,
    exec(line) {
      if (typeof line !== "string") return null;
      if (need) {
        const low = lowered(line);
        if (!need.some((s) => low.includes(s))) return null;
      }
      const caps = run(prog, line);
      if (!caps) return null;
      return { index: caps[0], end: caps[1], group: (n) => (caps[2 * n] >= 0 && caps[2 * n + 1] >= 0 ? line.slice(caps[2 * n], caps[2 * n + 1]) : undefined) };
    },
  };
}

// What is wrong with a pattern, or null.
export function lintPattern(source) {
  try {
    pattern(source);
    return null;
  } catch (e) {
    return e.message;
  }
}

// ---- files ----

// Never given to a reader, whatever a manifest's globs say: keys, credentials, environment files and hidden files.
const SECRET_NAME = /^(\.env(\..+)?|id_(rsa|dsa|ecdsa|ed25519)(\.pub)?|credentials(\.json)?|service[-_]?account.*\.json|.*\.(pem|key|p12|pfx|jks|keystore|kdbx|ppk|asc|gpg))$/i;
export const secretLooking = (path) => {
  const parts = String(path).split(/[\\/]/).filter(Boolean);
  return parts.some((p) => p.startsWith(".")) || SECRET_NAME.test(parts.at(-1) ?? "");
};
// Names a manifest's globs must not reach: a glob that matches one is refused.
const SECRET_SAMPLES = ["id_rsa", "keys/id_ed25519", "server.pem", "certs/server.pem", "tls.key", "config/tls.key", "credentials.json", "secrets/service-account.json", "store.p12", ".env", "config/.env.local"];

// File globs, matched without case against a path from the project's root ("/" between folders): `*` and `?` within a
// name, `**` for any folders, `{a,b}` for either; a name that starts with "." is reached by no wildcard.
function globLint(g) {
  if (typeof g !== "string" || !g || g.length > LIMITS.globChars) return `a glob of 1 to ${LIMITS.globChars} characters`;
  if (/^[/~]|\\|^[A-Za-z]:/.test(g)) return "a glob is a path inside the project (no /, ~ or \\)";
  if (/[[\]]/.test(g) || [...g].some((c) => c.charCodeAt(0) < 32)) return "a glob has no [ ], and no control characters";
  if (/\{[^}]*\{|\}[^{]*\}|^[^{]*\}|\{[^}]*$/.test(g)) return "a { } in a glob is not nested and is closed";
  if (expand(g).length > 32) return "a glob of more than 32 forms";
  for (const form of expand(g)) {
    const segs = form.split("/");
    if (segs.some((s) => s === "" || s === "." || s === "..")) return "a glob has no empty, . or .. folder";
    if (segs.some((s) => s.includes("**") && s !== "**")) return "** is a whole folder name";
    if (segs.some((s) => s !== "**" && (s.match(/\*/g) ?? []).length > 2)) return "at most two * in a name";
    if ((form.match(/\*\*|\*|\?/g) ?? []).length > LIMITS.globWildcards) return `at most ${LIMITS.globWildcards} wildcards`;
  }
  const test = glob(g);
  const hit = SECRET_SAMPLES.find(test);
  return hit ? `the glob reaches a secret-looking file (${hit}); name the format's files` : null;
}
function expand(g) {
  const m = /\{([^{}]*)\}/.exec(g);
  if (!m) return [g];
  return m[1].split(",").flatMap((alt) => expand(g.slice(0, m.index) + alt + g.slice(m.index + m[0].length)));
}
function glob(g) {
  const forms = expand(g).map((form) =>
    form.split("/").map((s) => {
      if (s === "**") return s;
      const body = s.replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]");
      return new RegExp(`^${s.startsWith(".") ? "" : "(?!\\.)"}${body}$`, "i");
    }),
  );
  const walk = (gs, ps, gi, pi) => {
    if (gi === gs.length) return pi === ps.length;
    if (gs[gi] === "**") {
      for (let k = pi; k <= ps.length; k++) {
        if (walk(gs, ps, gi + 1, k)) return true;
        if (k < ps.length && ps[k].startsWith(".")) return false;
      }
      return false;
    }
    return pi < ps.length && gs[gi].test(ps[pi]) && walk(gs, ps, gi + 1, pi + 1);
  };
  return (path) => {
    const ps = String(path).split("/").filter(Boolean);
    return forms.some((gs) => walk(gs, ps, 0, 0));
  };
}

// ---- the schema ----

let schemaCache;
export function readerSchema() {
  schemaCache ??= JSON.parse(readFileSync(join(READERS_DIR, "reader.schema.json"), "utf8"));
  return schemaCache;
}

// A value against the part of JSON Schema that reader.schema.json uses: $ref, type, const, enum, pattern, lengths,
// bounds, items, properties, required and additionalProperties: false. Problems as "path: what".
function validate(v, s, path, root, out, skip) {
  if (s.$ref) s = s.$ref.replace(/^#\//, "").split("/").reduce((o, k) => o[k], root);
  const at = path || "the reader";
  if ("const" in s && v !== s.const) return out.push(`${at}: must be ${JSON.stringify(s.const)}`);
  if (s.enum && !s.enum.includes(v)) return out.push(`${at}: one of ${s.enum.join(", ")}`);
  const types = { object: (x) => x !== null && typeof x === "object" && !Array.isArray(x), array: Array.isArray, string: (x) => typeof x === "string", integer: Number.isInteger, boolean: (x) => typeof x === "boolean" };
  if (s.type && !types[s.type](v)) return out.push(`${at}: must be ${s.type === "integer" ? "an" : "a"} ${s.type}`);
  if (typeof v === "string") {
    if (s.minLength !== undefined && v.length < s.minLength) out.push(`${at}: at least ${s.minLength} characters`);
    if (s.maxLength !== undefined && v.length > s.maxLength) out.push(`${at}: at most ${s.maxLength} characters`);
    if (s.pattern && !new RegExp(s.pattern, "u").test(v)) out.push(`${at}: must match ${s.pattern}`);
  }
  if (typeof v === "number") {
    if (s.minimum !== undefined && v < s.minimum) out.push(`${at}: at least ${s.minimum}`);
    if (s.maximum !== undefined && v > s.maximum) out.push(`${at}: at most ${s.maximum}`);
  }
  if (Array.isArray(v)) {
    if (s.minItems !== undefined && v.length < s.minItems) out.push(`${at}: at least ${s.minItems} items`);
    if (s.maxItems !== undefined && v.length > s.maxItems) out.push(`${at}: at most ${s.maxItems} items`);
    if (s.items) for (const [k, x] of v.entries()) validate(x, s.items, `${path}[${k}]`, root, out, skip);
  }
  if (types.object(v) && s.properties) {
    for (const k of s.required ?? []) if (!(k in v)) out.push(`${path ? `${path}.` : ""}${k}: missing`);
    for (const [k, x] of Object.entries(v)) {
      const p = path ? `${path}.${k}` : k;
      if (s.properties[k]) validate(x, s.properties[k], p, root, out, skip);
      else if (s.additionalProperties === false && !skip.has(p)) out.push(`${p}: not a key of ${path ? `"${path.split(".").pop()}"` : "a reader"}`);
    }
  }
}

// ---- lint ----

// Keys no manifest may have, whatever the schema says: a reader reaches no network, holds no code and carries no text
// for a model or a person to follow.
const NETWORK_KEY = /^(urls?|uris?|href|links?|fetch|https?|endpoints?|hosts?|network|webhooks?|api|remote|download|source_url)$/i;
const CODE_KEY = /^(scripts?|code|js|javascript|eval|functions?|exec|run|commands?|shell|modules?|imports?|require|wasm|hooks?|plugins?)$/i;
const TEXT_KEY = /^(prompts?|instructions?|system|messages?|agent|model|llm|description|notes?|comments?|readme|help|about)$/i;
const ADDRESS = /^([a-z][a-z0-9+.-]*:\/\/|\/\/|(javascript|data|file|mailto):)/i;

function keyProblems(value, path, out, skip) {
  if (Array.isArray(value)) {
    for (const [k, x] of value.entries()) keyProblems(x, `${path}[${k}]`, out, skip);
    return;
  }
  if (typeof value === "string") {
    if (ADDRESS.test(value.trim())) out.push(`${path || "the reader"}: an address; a reader names none (no network field)`);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [k, x] of Object.entries(value)) {
    const p = path ? `${path}.${k}` : k;
    const why = NETWORK_KEY.test(k) ? "no network field: a reader reads the document it is given, nothing else" : CODE_KEY.test(k) ? "no code: a reader is data, never run" : TEXT_KEY.test(k) ? "no free-text field: a reader says what it reads by its patterns" : null;
    if (why) {
      out.push(`${p}: ${why}`);
      skip.add(p);
    }
    keyProblems(x, p, out, skip);
  }
}

// What is wrong with a manifest: [] when it can be read. `folder`: the name of the folder it is in.
export function lintReader(m, { folder } = {}) {
  const out = [];
  if (!m || typeof m !== "object" || Array.isArray(m)) return ["a reader is a JSON object"];
  const skip = new Set();
  keyProblems(m, "", out, skip);
  validate(m, readerSchema(), "", readerSchema(), out, skip);
  if (out.length) return out;
  if (folder !== undefined && m.name !== folder) out.push(`name: "${m.name}" is not the name of its folder, "${folder}"`);
  if (!(m.fields?.date || m.fields?.status || m.fields?.marks) && !m.entries) out.push("fields: a reader reads a date, a status, marks or entries");
  for (const [k, g] of m.matches.files.entries()) {
    const why = globLint(g);
    if (why) out.push(`matches.files[${k}]: ${why}`);
  }
  const check = (path, source, groups = {}) => {
    let p;
    try {
      p = pattern(source);
    } catch (e) {
      out.push(`${path}: ${e.message}`);
      return;
    }
    for (const [k, n] of Object.entries(groups)) if (n !== undefined && n > p.groups) out.push(`${path.replace(/\.pattern$/, "")}.${k}: group ${n}, but the pattern has ${p.groups}`);
  };
  for (const [k, h] of (m.matches.headings ?? []).entries()) check(`matches.headings[${k}]`, h);
  const rule = (r, path, mark, inEntry) => {
    if (r.in === "section" ? !r.section : r.section !== undefined) out.push(`${path}.section: ${r.in === "section" ? "missing for in: section" : 'only with in: "section"'}`);
    if (r.first !== undefined && r.in !== "top" && r.in !== "section") out.push(`${path}.first: only with in: "top" or "section"`);
    if (inEntry && r.in === "front-matter") out.push(`${path}.in: an entry has no front matter`);
    if (r.section) check(`${path}.section`, r.section);
    if (!mark) check(`${path}.pattern`, r.pattern, { value: r.value ?? 1 });
    else if (r.phrases) {
      for (const k of ["pattern", "kind", "by", "name"]) if (r[k] !== undefined) out.push(`${path}.${k}: not with phrases (the language rules give it)`);
    }
    else if (!r.pattern) out.push(`${path}: a mark has a pattern, or phrases: true`);
    else {
      if (!r.kind) out.push(`${path}.kind: missing`);
      check(`${path}.pattern`, r.pattern, { by: r.by, name: r.name });
    }
  };
  const rules = (fields, at, inEntry) => {
    for (const name of ["date", "status", "marks"]) for (const [k, r] of (fields[name] ?? []).entries()) rule(r, `${at}.${name}[${k}]`, name === "marks", inEntry);
  };
  if (m.fields) rules(m.fields, "fields", false);
  if (m.entries) {
    for (const [k, h] of m.entries.heading.entries()) check(`entries.heading[${k}].pattern`, h.pattern, { title: h.title, date: h.date });
    if (m.entries.fields) rules(m.entries.fields, "entries.fields", true);
  }
  return out;
}

// What is wrong with a language's rules (rules/<lang>.json): the schema, each pattern, and each phrase against its own
// lines (it marks every one of "hits" and none of "misses").
export function lintRules(data, { lang } = {}) {
  const out = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) return ["rules are a JSON object"];
  const root = readerSchema();
  validate(data, root.$defs.languageRules, "", root, out, new Set());
  if (out.length) return out;
  if (lang !== undefined && data.lang !== lang) out.push(`lang: "${data.lang}" is not the name of its file, "${lang}.json"`);
  for (const [k, p] of data.marks.entries()) {
    let re;
    try {
      re = pattern(p.pattern);
    } catch (e) {
      out.push(`marks[${k}].pattern: ${e.message}`);
      continue;
    }
    for (const line of p.hits) if (!re.exec(line)) out.push(`marks[${k}] "${p.marker}": does not mark ${JSON.stringify(line)}`);
    for (const line of p.misses) if (re.exec(line)) out.push(`marks[${k}] "${p.marker}": marks ${JSON.stringify(line)}`);
  }
  return out;
}

// ---- loading ----

// A manifest that passed lintReader, ready to read with.
export function compileReader(m) {
  const rule = (r) => ({ ...r, ...(r.pattern && { re: pattern(r.pattern) }), ...(r.section && { section: pattern(r.section) }) });
  const fields = (f) => f && { date: (f.date ?? []).map(rule), status: (f.status ?? []).map(rule), marks: (f.marks ?? []).map(rule) };
  return {
    name: m.name,
    owner: m.owner,
    fallback: m.fallback === true,
    lines: m.lines ?? 60,
    files: m.matches.files.map(glob),
    headings: (m.matches.headings ?? []).map(pattern),
    fields: fields(m.fields),
    entries: m.entries && { heading: m.entries.heading.map((h) => ({ ...h, re: pattern(h.pattern) })), fields: fields(m.entries.fields) },
  };
}

// Format readers first (by name), then the fallback ones that read any document of a kind (banners, front matter).
const order = (a, b) => Number(a.fallback) - Number(b.fallback) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

const loaded = new Map();
// The readers of a folder (readers/<name>/reader.json): { readers, problems }. One that does not pass lintReader is
// left out, with its problems; the folder's own readers are read once.
export function loadReaders(dir = READERS_DIR) {
  if (loaded.has(dir)) return loaded.get(dir);
  const readers = [];
  const problems = [];
  let names = [];
  try {
    names = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch {}
  for (const name of names) {
    let m;
    try {
      m = JSON.parse(readFileSync(join(dir, name, "reader.json"), "utf8"));
    } catch (e) {
      if (e.code !== "ENOENT") problems.push(`${name}: ${e.message}`);
      continue;
    }
    const found = lintReader(m, { folder: name });
    if (found.length) problems.push(...found.map((p) => `${name}: ${p}`));
    else readers.push(compileReader(m));
  }
  const out = { readers: readers.sort(order), problems };
  loaded.set(dir, out);
  return out;
}

// The phrases of every language's rules (rules/<lang>.json, in the order of the files' names, then as written):
// { phrases: [{ lang, marker, kind, find(line) → index | -1 }], problems }. A file that does not pass lintRules is left
// out, with its problems.
export function loadRules(dir = RULES_DIR) {
  const key = `rules:${dir}`;
  if (loaded.has(key)) return loaded.get(key);
  const phrases = [];
  const problems = [];
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  } catch {
    problems.push(`no rules in ${dir}`);
  }
  for (const file of files) {
    const lang = basename(file, ".json");
    let data;
    try {
      data = JSON.parse(readFileSync(join(dir, file), "utf8"));
    } catch (e) {
      problems.push(`${file}: ${e.message}`);
      continue;
    }
    const found = lintRules(data, { lang });
    if (found.length) {
      problems.push(...found.map((p) => `${file}: ${p}`));
      continue;
    }
    for (const p of data.marks) {
      const re = pattern(p.pattern);
      phrases.push({ lang, marker: p.marker, kind: p.kind, find: (line) => re.exec(line)?.index ?? -1 });
    }
  }
  const out = { phrases, problems };
  loaded.set(key, out);
  return out;
}
// The phrases themselves; rules that cannot be read are an error, never a document left unmarked.
export function phrases(dir = RULES_DIR) {
  const { phrases: list, problems } = loadRules(dir);
  if (!list.length) throw new Error(`Genter's language rules cannot be read: ${problems.join("; ") || "no phrase in them"}`);
  return list;
}

// ---- reading ----

// The lines a reader looks at: at most `cap`, trimmed; the front matter (between a first line "---" and the next "---"
// or "..."), the headings (#, outside code), and which lines are code (inside ``` or ~~~ fences).
function view(text, cap) {
  const raw = [];
  for (let at = 0; raw.length < cap; ) {
    const end = text.indexOf("\n", at);
    raw.push(text.slice(at, end < 0 ? text.length : end).replace(/\r$/, ""));
    if (end < 0) break;
    at = end + 1;
  }
  const lines = raw.map((l) => (l.length > LIMITS.lineChars * 4 ? l.slice(0, LIMITS.lineChars * 4) : l).trim());
  let fm = null;
  if (lines[0] === "---") {
    for (let k = 1; k < Math.min(lines.length, 100); k++) {
      if (lines[k] === "---" || lines[k] === "...") {
        fm = [1, k];
        break;
      }
    }
  }
  const body = fm ? fm[1] + 1 : 0;
  const code = new Array(lines.length).fill(false);
  const headings = [];
  let fence = null;
  for (let k = body; k < lines.length; k++) {
    const t = lines[k];
    const f = /^(`{3,}|~{3,})/.exec(t)?.[1];
    if (fence) {
      code[k] = true;
      if (f && f[0] === fence[0] && f.length >= fence.length) fence = null;
      continue;
    }
    if (f) {
      fence = f;
      code[k] = true;
      continue;
    }
    if (raw[k].length > LIMITS.lineChars) continue;
    const h = /^ {0,3}(#{1,6})(?:[ \t]|$)/.exec(raw[k]);
    if (!h) continue;
    const words = raw[k].slice(h[0].length).trim().replace(/(^|[ \t]+)#+$/, "").trim();
    if (words) headings.push({ k, level: h[1].length, text: words });
  }
  return { lines, fm, body, code, headings };
}

// The lines a rule looks at, in order: [{ k (the line's index), text }]. scope: { from, to, heading? } (an entry's).
function linesFor(r, v, scope, doc) {
  const plain = (a, b) => {
    const out = [];
    for (let k = a; k < b; k++) if (v.lines[k] && !v.code[k]) out.push({ k, text: v.lines[k] });
    return out;
  };
  if (r.in === "front-matter") return doc && v.fm ? plain(v.fm[0], v.fm[1]) : [];
  if (r.in === "top") return plain(scope.from, scope.to).slice(0, r.first ?? 6);
  if (r.in === "any") return plain(scope.from, scope.to);
  const inside = v.headings.filter((h) => h.k >= scope.from && h.k < scope.to);
  if (r.in === "heading") return scope.heading ? [{ k: scope.heading.k, text: scope.heading.text }] : inside.map((h) => ({ k: h.k, text: h.text }));
  const at = inside.findIndex((h) => r.section.exec(h.text));
  if (at < 0) return [];
  const end = inside.slice(at + 1).find((h) => h.level <= inside[at].level)?.k ?? scope.to;
  return plain(inside[at].k + 1, end).slice(0, r.first ?? 40);
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
// A date as the document writes it (2026-03-03, 2026/03/03, 03.03.2026, 3 March 2026, March 3, 2026, 03-Mar-2026), as
// YYYY-MM-DD; null for anything else or a day no calendar has.
export function isoDate(s) {
  const t = String(s ?? "").trim();
  let y;
  let m;
  let d;
  let x = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/.exec(t);
  if (x) [y, m, d] = [x[1], x[2], x[3]];
  else if ((x = /^(\d{1,2})[./](\d{1,2})[./](\d{4})(?!\d)/.exec(t))) [d, m, y] = [x[1], x[2], x[3]];
  else if ((x = /^(\d{1,2})[- ]([A-Za-z]{3,9})\.?[- ,]{1,2}(\d{4})(?!\d)/.exec(t))) [d, m, y] = [x[1], MONTHS.indexOf(x[2].slice(0, 3).toLowerCase()) + 1, x[3]];
  else if ((x = /^([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})(?!\d)/.exec(t))) [m, d, y] = [MONTHS.indexOf(x[1].slice(0, 3).toLowerCase()) + 1, x[2], x[3]];
  else return null;
  [y, m, d] = [Number(y), Number(m), Number(d)];
  if (y < 1970 || y > 2100 || m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
const statusWord = (s) => {
  const w = String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return /^[\p{L}][\p{L}\p{N} _-]{0,39}$/u.test(w) ? w : null;
};
const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim().replace(/^["'<]+|["'>]+$/g, "").slice(0, 120);

// A link on a line: a Markdown link's text and target, or an address; the first of them.
const MD_LINK = /\[([^\]\n]{0,200})\]\(\s*<?([^)\s>]{1,400})>?[^)\n]{0,200}\)/;
const BARE_URL = /https?:\/\/[^\s)>\]"'<]+/;
function linkIn(s) {
  const md = MD_LINK.exec(s);
  const url = BARE_URL.exec(s);
  if (md && (!url || md.index <= url.index)) return { text: md[1], target: md[2] };
  return url ? { target: url[0].replace(/[.,;:!?]+$/, "") } : null;
}

const value = (rules, v, scope, doc, norm) => {
  for (const r of rules) {
    for (const { k, text } of linesFor(r, v, scope, doc)) {
      if (text.length > LIMITS.lineChars) continue;
      const m = r.re.exec(text);
      const found = m && norm(m.group(r.value ?? 1));
      if (found) return { value: found, line: k + 1 };
    }
  }
  return undefined;
};

// The marks of the lines the rules look at: a line has the mark of the first rule that marks it. A phrases rule marks a
// short line (a notice, not a paragraph) with the language rules' phrases, and takes a link beside the phrase or on the
// next line; a pattern takes its groups, else a link after where it matched.
function marksIn(rules, v, scope, doc) {
  const found = new Map();
  const nextLine = (k) => {
    for (let j = k + 1; j < v.lines.length; j++) if (v.lines[j] && !v.code[j]) return v.lines[j];
    return "";
  };
  for (const r of rules) {
    for (const { k, text } of linesFor(r, v, scope, doc)) {
      if (found.has(k) || found.size >= LIMITS.marks) continue;
      let m;
      let link;
      let what;
      if (r.phrases) {
        if (text.length > LIMITS.noticeChars) continue;
        const p = phrases().find((x) => x.find(text) >= 0);
        if (!p) continue;
        const next = nextLine(k);
        link = linkIn(text.slice(p.find(text))) ?? (next.length <= LIMITS.noticeChars ? linkIn(next) : null);
        what = { kind: p.kind, marker: p.marker };
      } else {
        if (text.length > LIMITS.lineChars || !(m = r.re.exec(text))) continue;
        const by = r.by ? m.group(r.by) : undefined;
        link = by ? { target: by } : linkIn(text.slice(m.index));
        what = { kind: r.kind };
      }
      const name = clean((r.name && m?.group(r.name)) || link?.text);
      const by = link?.target && clean(link.target);
      found.set(k, { ...what, line: k + 1, quote: text.slice(0, LIMITS.noticeChars), ...(name && { name }), ...(by && { by }) });
    }
  }
  return [...found.values()].sort((a, b) => a.line - b.line);
}

const fieldsIn = (f, v, scope, doc) => ({ date: value(f.date, v, scope, doc, isoDate), status: value(f.status, v, scope, doc, statusWord), marks: marksIn(f.marks, v, scope, doc) });

// The entries of a document: one per heading an entry rule matches, from it to the next heading of its level or above.
function entriesOf(e, v) {
  const out = [];
  v.headings.forEach((head, h) => {
    if (out.length >= LIMITS.entries) return;
    let m = null;
    const rule = e.heading.find((r) => (!r.level || r.level === head.level) && (m = r.re.exec(head.text)));
    if (!rule) return;
    const next = v.headings.slice(h + 1).find((x) => x.level <= head.level);
    const f = e.fields ? fieldsIn(e.fields, v, { from: head.k + 1, to: next ? next.k : v.lines.length, heading: head }, false) : { marks: [] };
    const dated = rule.date && isoDate(m.group(rule.date));
    const date = dated ? { value: dated, line: head.k + 1 } : f.date;
    out.push({ title: clean(rule.title && m.group(rule.title)) || head.text, line: head.k + 1, ...(date && { date }), ...(f.status && { status: f.status }), ...(f.marks.length && { marks: f.marks }) });
  });
  return out;
}

// What one reader reads in a document: null when the reader does not take it (its globs and headings, or a
// secret-looking path) or runs out of work on it (LIMITS.work), else { date?, status?, marks?, entries? }, each with the
// line it is on (from 1). With no date of its own, a document with entries is dated by its latest one. path: from the
// project's root, "/" between folders.
export function readWith(reader, path, text) {
  if (typeof text !== "string" || !path || secretLooking(path) || !reader.files.some((f) => f(path))) return null;
  work = LIMITS.work;
  try {
    const v = view(text, reader.lines);
    if (reader.headings.length && !v.headings.some((h) => reader.headings.some((re) => re.exec(h.text)))) return null;
    const f = reader.fields ? fieldsIn(reader.fields, v, { from: v.body, to: v.lines.length }, true) : { marks: [] };
    const entries = reader.entries ? entriesOf(reader.entries, v) : [];
    let date = f.date;
    if (!date) for (const e of entries) if (e.date && (!date || e.date.value > date.value)) date = e.date;
    return { ...(date && { date }), ...(f.status && { status: f.status }), ...(f.marks.length && { marks: f.marks }), ...(entries.length && { entries }) };
  } catch (e) {
    if (e === OUT_OF_WORK) return null;
    throw e;
  } finally {
    work = Infinity;
  }
}

// What the readers read in a document, together: { readers (those that read something), date?, status?, marks?,
// entries? }, each with the reader it comes from; null when none read anything. The date and the status are the first
// reader's that has them, format readers before fallback ones; marks and entries are every reader's, in that order.
export function readDocument(path, text, { readers = loadReaders().readers } = {}) {
  const out = { readers: [] };
  for (const r of readers) {
    const got = readWith(r, path, text);
    if (!got || !Object.keys(got).length) continue;
    out.readers.push(r.name);
    if (got.date && !out.date) out.date = { ...got.date, reader: r.name };
    if (got.status && !out.status) out.status = { ...got.status, reader: r.name };
    if (got.marks) (out.marks ??= []).push(...got.marks.map((x) => ({ ...x, reader: r.name })));
    if (got.entries) (out.entries ??= []).push(...got.entries.map((x) => ({ ...x, reader: r.name })));
  }
  return out.readers.length ? out : null;
}
