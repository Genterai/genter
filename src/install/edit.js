// Adding Genter's entries to another app's config file as one insertion: the file after is the file before with one run
// of text added, so everything the person wrote (comments, order, spacing, their other servers) stays byte for byte.
// When a file cannot be edited that way with confidence, the answer is { snippet: why } and the person pastes it.
//
// Every edit answers { kept, text, at, inserted } or { kept, snippet }: `kept` lists the wanted entries already there
// ({ name, how: "same" | "differs" | "as <other name>" }), and the rest are added. `wanted` is [{ name, value, is }],
// where `is(text)` recognizes Genter under another name from the text of an existing entry.

const json = (v) => JSON.stringify(v);

// ---- JSON, and JSON with comments (VS Code, Zed) ----

// A JSON value with where it is in the text: { type, start, end, value, members? }. Comments (// and /* */) and trailing
// commas are read as JSONC allows them; a leading byte-order mark is skipped.
export function parseJsonc(text) {
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const fail = (what) => new Error(`${what} at character ${i}`);
  function ws() {
    for (;;) {
      const c = text[i];
      if (c === " " || c === "\t" || c === "\n" || c === "\r") i++;
      else if (c === "/" && text[i + 1] === "/") {
        const n = text.indexOf("\n", i);
        i = n < 0 ? text.length : n;
      } else if (c === "/" && text[i + 1] === "*") {
        const n = text.indexOf("*/", i + 2);
        if (n < 0) throw fail("a comment that never closes");
        i = n + 2;
      } else return;
    }
  }
  function string() {
    const start = i++;
    for (;;) {
      const c = text[i];
      if (c === undefined || c === "\n") throw fail("a string that never closes");
      i += c === "\\" ? 2 : 1;
      if (c === '"') break;
    }
    return { type: "string", start, end: i, value: JSON.parse(text.slice(start, i)) };
  }
  function object() {
    const node = { type: "object", start: i++, members: [], value: {} };
    for (;;) {
      ws();
      if (text[i] === "}") break;
      if (text[i] !== '"') throw fail("a key expected");
      const key = string();
      ws();
      if (text[i++] !== ":") throw fail('":" expected');
      const v = value();
      const member = { key: key.value, keyStart: key.start, node: v, end: v.end, comma: -1 };
      node.members.push(member);
      put(node.value, key.value, v.value);
      ws();
      if (text[i] === ",") {
        member.comma = i++;
        continue;
      }
      if (text[i] !== "}") throw fail('"," or "}" expected');
      break;
    }
    node.end = ++i;
    return node;
  }
  function array() {
    const node = { type: "array", start: i++, value: [] };
    for (;;) {
      ws();
      if (text[i] === "]") break;
      node.value.push(value().value);
      ws();
      if (text[i] === ",") {
        i++;
        continue;
      }
      if (text[i] !== "]") throw fail('"," or "]" expected');
      break;
    }
    node.end = ++i;
    return node;
  }
  function value() {
    ws();
    if (text[i] === "{") return object();
    if (text[i] === "[") return array();
    if (text[i] === '"') return string();
    const literal = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/y;
    literal.lastIndex = i;
    const hit = literal.exec(text);
    if (!hit) throw fail("an unexpected character");
    const start = i;
    i += hit[0].length;
    return { type: "literal", start, end: i, value: JSON.parse(hit[0]) };
  }
  const root = value();
  ws();
  if (i < text.length) throw fail("text after the end");
  return root;
}

// A key set as data, even "__proto__".
function put(object, key, v) {
  Object.defineProperty(object, key, { value: v, enumerable: true, writable: true, configurable: true });
}

export function same(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => Object.hasOwn(b, k) && same(a[k], b[k]));
}

const lineStart = (text, at) => text.lastIndexOf("\n", at - 1) + 1;
const indentOf = (text, at) => /^[ \t]*/.exec(text.slice(lineStart(text, at)))[0];
// The indentation before `at` when nothing else is on its line before it, else null.
function ownLine(text, at) {
  const before = text.slice(lineStart(text, at), at);
  return /^[ \t]*$/.test(before) ? before : null;
}

// A value as the file would hold it: objects one key per line, arrays on one line.
export function renderJson(v, indent, unit) {
  if (Array.isArray(v)) return `[${v.map(json).join(", ")}]`;
  if (v && typeof v === "object") {
    const keys = Object.keys(v);
    if (!keys.length) return "{}";
    return `{\n${keys.map((k) => `${indent}${unit}${json(k)}: ${renderJson(v[k], indent + unit, unit)}`).join(",\n")}\n${indent}}`;
  }
  return json(v);
}

// The members of `entries` added to the object node `object`, as one insertion: { at, inserted }.
function addMembers(text, object, entries, unit) {
  const first = object.members[0];
  const last = object.members.at(-1);
  const lines = (indent) => Object.entries(entries).map(([k, v]) => (indent === null ? `${json(k)}:${json(v)}` : `${indent}${json(k)}: ${renderJson(v, indent, unit)}`));
  if (!last) {
    const outer = indentOf(text, object.start);
    const inside = text.slice(object.start + 1, object.end - 1);
    return { at: object.start + 1, inserted: `\n${lines(outer + unit).join(",\n")}${inside.includes("\n") ? "" : `\n${outer}`}` };
  }
  const indent = ownLine(text, first.keyStart); // null: the members share a line, so the entries go in compact too
  const sep = indent === null ? "," : ",\n";
  const lead = indent === null ? "" : "\n";
  if (last.comma < 0) return { at: last.end, inserted: sep + lines(indent).join(sep) };
  // After a trailing comma, past a comment on the rest of its line, so the comment stays with the entry it is about.
  let at = last.comma + 1;
  const eol = text.indexOf("\n", at) < 0 ? text.length : text.indexOf("\n", at);
  if (indent !== null && /^[ \t]*(\/\/.*|\/\*.*?\*\/[ \t]*)?\r?$/.test(text.slice(at, eol))) at = text[eol - 1] === "\r" ? eol - 1 : eol;
  return { at, inserted: lead + lines(indent).join(sep) };
}

// The JSON (or JSONC) file with `wanted` under its top-level object `key` ("mcpServers", "servers", "context_servers").
export function editJson(text, key, wanted) {
  if (!text.trim()) {
    const inserted = `${renderJson({ [key]: Object.fromEntries(wanted.map((w) => [w.name, w.value])) }, "", "  ")}\n`;
    return { kept: [], at: 0, inserted, text: inserted + text };
  }
  let root;
  try {
    root = parseJsonc(text);
  } catch (error) {
    return { kept: [], snippet: `it does not read as JSON (${error.message})` };
  }
  if (root.type !== "object") return { kept: [], snippet: "its top level is not an object" };
  const found = root.members.filter((m) => m.key === key);
  if (found.length > 1) return { kept: [], snippet: `it has "${key}" twice` };
  const container = found[0]?.node;
  if (container && container.type !== "object") return { kept: [], snippet: `its "${key}" is not an object` };
  const kept = [];
  const entries = {};
  for (const w of wanted) {
    const there = container?.members.filter((m) => m.key === w.name) ?? [];
    const other = container?.members.find((m) => m.key !== w.name && w.is(text.slice(m.node.start, m.node.end)));
    if (there.length) kept.push({ name: w.name, how: there.length === 1 && same(there[0].node.value, w.value) ? "same" : "differs" });
    else if (other) kept.push({ name: w.name, how: `as ${other.key}` });
    else entries[w.name] = w.value;
  }
  if (!Object.keys(entries).length) return { kept };
  const firstOwn = root.members.length ? ownLine(text, root.members[0].keyStart) : null;
  const unit = firstOwn || "  ";
  const { at, inserted } = container ? addMembers(text, container, entries, unit) : addMembers(text, root, { [key]: entries }, unit);
  const after = text.slice(0, at) + inserted + text.slice(at);
  // The proof that nothing else moved: the file reads as it did, plus the entries.
  const want = { ...root.value, [key]: { ...(container?.value ?? {}), ...entries } };
  try {
    if (!same(parseJsonc(after).value, want)) return { kept, snippet: "the edit would change more than Genter's entries" };
  } catch {
    return { kept, snippet: "the edit would not read as JSON" };
  }
  return { kept, at, inserted, text: after };
}

// ---- TOML (Codex) ----

const tomlKey = (k) => (/^[A-Za-z0-9_-]+$/.test(k) ? k : json(k));
function tomlValue(v) {
  if (Array.isArray(v)) return `[${v.map(tomlValue).join(", ")}]`;
  if (v && typeof v === "object") return `{ ${Object.entries(v).map(([k, x]) => `${tomlKey(k)} = ${tomlValue(x)}`).join(", ")} }`;
  return json(v); // a JSON string is a TOML basic string: the same escapes
}
export const renderToml = (table, name, v) => [`[${table}.${tomlKey(name)}]`, ...Object.entries(v).map(([k, x]) => `${tomlKey(k)} = ${tomlValue(x)}`)].join("\n");

// Where a TOML line's comment starts, and the multi-line string still open at its end, given the one open at its start:
// strings are skipped whole, so a "#" or a quote inside one is text.
function scanToml(line, open) {
  let i = 0;
  while (i < line.length) {
    if (open) {
      const close = line.indexOf(open, i);
      if (close < 0) return { cut: line.length, open };
      i = close + 3;
      open = null;
    } else if (line[i] === "#") return { cut: i, open: null };
    else if (line.startsWith('"""', i) || line.startsWith("'''", i)) {
      open = line.slice(i, i + 3);
      i += 3;
    } else if (line[i] === '"' || line[i] === "'") {
      const q = line[i];
      let j = i + 1;
      while (j < line.length && line[j] !== q) j += q === '"' && line[j] === "\\" ? 2 : 1;
      i = j + 1;
    } else i++;
  }
  return { cut: line.length, open };
}

// The table headers and keys of a TOML file, line by line, outside strings and comments:
// { out: [{ header, array, table, key, from }], open }, `open` set when a multi-line string never closes.
function tomlLines(text) {
  const out = [];
  let table = "";
  let open = null;
  let from = 0;
  for (const line of text.split("\n")) {
    const start = from;
    from += line.length + 1;
    const inside = open !== null;
    const scan = scanToml(line, open);
    open = scan.open;
    if (inside) continue; // a line that starts inside a string holds no header and no key
    const code = line.slice(0, scan.cut);
    const header = /^\s*\[(\[?)\s*([^\]]*?)\s*\]\]?\s*$/.exec(code);
    if (header) {
      table = header[2].split(".").map((p) => p.trim().replace(/^(["'])(.*)\1$/, "$2")).join(".");
      out.push({ header: true, array: header[1] === "[", table, from: start });
      continue;
    }
    const key = /^\s*("[^"]*"|'[^']*'|[A-Za-z0-9_-]+)\s*[=.]/.exec(code);
    if (key) out.push({ table, key: key[1].replace(/^(["'])(.*)\1$/, "$2"), from: start });
  }
  return { out, open };
}

// The TOML file with `wanted` as tables `[<table>.<name>]` appended at its end.
export function editToml(text, table, wanted) {
  const { out, open } = tomlLines(text);
  if (open) return { kept: [], snippet: "a multi-line string in it never closes" };
  if (out.some((l) => (l.table === "" && l.key === table) || (l.header && l.array && l.table === table))) return { kept: [], snippet: `its "${table}" is written in a form Genter does not extend` };
  const sections = sectionsOf(text, out, table);
  const kept = [];
  const add = [];
  for (const w of wanted) {
    const block = renderToml(table, w.name, w.value);
    const mine = (l) => l.table === `${table}.${w.name}` || l.table.startsWith(`${table}.${w.name}.`) || (l.table === table && l.key === w.name);
    const other = Object.entries(sections).find(([name, body]) => name !== w.name && w.is(body));
    if (out.some(mine)) kept.push({ name: w.name, how: sections[w.name]?.trimEnd() === block ? "same" : "differs" });
    else if (other) kept.push({ name: w.name, how: `as ${other[0]}` });
    else add.push(block);
  }
  if (!add.length) return { kept };
  const lead = text === "" ? "" : text.endsWith("\n") ? "\n" : "\n\n";
  const inserted = `${lead}${add.join("\n\n")}\n`;
  return { kept, at: text.length, inserted, text: text + inserted };
}

// The text of each `[<table>.<name>]` section: { name: text }.
function sectionsOf(text, out, table) {
  const sections = {};
  const headers = out.filter((l) => l.header);
  headers.forEach((h, n) => {
    if (!h.table.startsWith(`${table}.`)) return;
    const name = h.table.slice(table.length + 1).split(".")[0];
    sections[name] = (sections[name] ?? "") + text.slice(h.from, headers[n + 1]?.from ?? text.length);
  });
  return sections;
}

// ---- YAML (goose) ----

const PLAIN = /^[A-Za-z][A-Za-z0-9_.-]*$/;
const KEYWORD = /^(true|false|yes|no|on|off|null|y|n)$/i;
function yamlValue(v) {
  if (Array.isArray(v)) return `[${v.map(json).join(", ")}]`;
  if (v && typeof v === "object") {
    const pairs = Object.entries(v);
    return pairs.length ? `{ ${pairs.map(([k, x]) => `${PLAIN.test(k) && !KEYWORD.test(k) ? k : json(k)}: ${json(x)}`).join(", ")} }` : "{}";
  }
  if (typeof v === "string") return PLAIN.test(v) && !KEYWORD.test(v) ? v : json(v); // a JSON string is a YAML double-quoted one
  return String(v);
}
export const renderYaml = (name, v, indent) => [`${indent}${name}:`, ...Object.entries(v).map(([k, x]) => `${indent}  ${k}: ${yamlValue(x)}`)].join("\n");

// The YAML file with `wanted` as children of its top-level block mapping `key` ("extensions").
export function editYaml(text, key, wanted) {
  const lines = text.split("\n");
  const significant = (l) => l.trim() !== "" && !/^\s*#/.test(l);
  if (lines.some((l) => /^\t/.test(l) || /^(---|\.\.\.)(\s|$)/.test(l))) return { kept: [], snippet: "it uses tabs or several documents" };
  const top = lines.findIndex(significant);
  if (top >= 0 && !/^[A-Za-z_"'][^:#]*:(\s|$)/.test(lines[top])) return { kept: [], snippet: "its top level is not a mapping" };
  const heads = lines.map((l, n) => (new RegExp(`^${key}\\s*:`).test(l) ? n : -1)).filter((n) => n >= 0);
  if (heads.length > 1) return { kept: [], snippet: `it has "${key}" twice` };
  const head = heads[0];
  if (head !== undefined && !new RegExp(`^${key}\\s*:\\s*(#.*)?$`).test(lines[head])) return { kept: [], snippet: `its "${key}" is written in a form Genter does not extend` };
  // The block under the key: its lines until the next line at the left edge.
  let end = head ?? -1;
  let child = null;
  const children = {};
  let current = null;
  if (head !== undefined) {
    for (let n = head + 1; n < lines.length; n++) {
      const l = lines[n];
      if (!significant(l)) continue;
      const indent = /^ */.exec(l)[0].length;
      if (indent === 0) break;
      child ??= indent;
      if (indent < child) return { kept: [], snippet: `its "${key}" is indented unevenly` };
      if (indent === child) {
        if (/^ *-(\s|$)/.test(l)) return { kept: [], snippet: `its "${key}" is a list, not a mapping` };
        const name = /^ *("[^"]*"|'[^']*'|[^:#]+?)\s*:/.exec(l)?.[1]?.replace(/^(["'])(.*)\1$/, "$2");
        if (name === undefined) return { kept: [], snippet: `its "${key}" is not a mapping` };
        current = name;
        children[name] = "";
      }
      if (current !== null) children[current] += `${l}\n`;
      end = n;
    }
  }
  const indent = " ".repeat(child ?? 2);
  const kept = [];
  const add = [];
  for (const w of wanted) {
    const block = renderYaml(w.name, w.value, indent);
    const other = Object.entries(children).find(([name, body]) => name !== w.name && w.is(body));
    if (Object.hasOwn(children, w.name)) kept.push({ name: w.name, how: children[w.name] === `${block}\n` ? "same" : "differs" });
    else if (other) kept.push({ name: w.name, how: `as ${other[0]}` });
    else add.push(block);
  }
  if (!add.length) return { kept };
  const body = `${add.join("\n")}\n`;
  if (head === undefined) {
    const lead = text === "" || text.endsWith("\n") ? "" : "\n";
    const inserted = `${lead}${key}:\n${body}`;
    return { kept, at: text.length, inserted, text: text + inserted };
  }
  // After the block's last line (its newline included), so comments and blank lines that follow it stay after it.
  const at = lines.slice(0, end + 1).join("\n").length + 1;
  const inserted = at > text.length ? `\n${body}` : body;
  const where = Math.min(at, text.length);
  return { kept, at: where, inserted, text: text.slice(0, where) + inserted + text.slice(where) };
}
