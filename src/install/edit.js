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
  const bom = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  if (!text.slice(bom).trim()) {
    const inserted = `${renderJson({ [key]: Object.fromEntries(wanted.map((w) => [w.name, w.value])) }, "", "  ")}\n`;
    return { kept: [], at: bom, inserted, text: text.slice(0, bom) + inserted + text.slice(bom) };
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

// Where a TOML line's comment starts, and what is still open at its end given what was open at its start: a multi-line
// string (strings are skipped whole, so a "#", a quote or a bracket inside one is text), and the depth of the arrays
// and inline tables that run on over several lines.
function scanToml(line, open, depth) {
  let i = 0;
  while (i < line.length) {
    if (open) {
      const close = line.indexOf(open, i);
      if (close < 0) return { cut: line.length, open, depth };
      i = close + 3;
      open = null;
    } else if (line[i] === "#") return { cut: i, open: null, depth };
    else if (line.startsWith('"""', i) || line.startsWith("'''", i)) {
      open = line.slice(i, i + 3);
      i += 3;
    } else if (line[i] === '"' || line[i] === "'") {
      const q = line[i];
      let j = i + 1;
      while (j < line.length && line[j] !== q) j += q === '"' && line[j] === "\\" ? 2 : 1;
      i = j + 1;
    } else {
      if (line[i] === "[" || line[i] === "{") depth++;
      else if ((line[i] === "]" || line[i] === "}") && depth > 0) depth--;
      i++;
    }
  }
  return { cut: line.length, open, depth };
}

// The table headers and keys of a TOML file, line by line, outside strings, comments and values that run on:
// { out: [{ header, array, table, key, from, to }], open }, `open` set when a multi-line string, array or inline table
// never closes. A key's `from` and `to` take in its whole value.
function tomlLines(text) {
  const out = [];
  let table = "";
  let open = null;
  let depth = 0;
  let from = 0;
  for (const line of text.split("\n")) {
    const start = from;
    from += line.length + 1;
    const inside = open !== null || depth > 0;
    const scan = scanToml(line, open, depth);
    ({ open, depth } = scan);
    if (inside) {
      // A line that starts inside a value holds no header and no key: it is the last key's value going on.
      if (out.at(-1)?.key !== undefined) out.at(-1).to = start + line.length;
      continue;
    }
    const code = line.slice(0, scan.cut);
    const header = /^\s*\[(\[?)\s*([^\]]*?)\s*\]\]?\s*$/.exec(code);
    if (header) {
      table = header[2].split(".").map((p) => p.trim().replace(/^(["'])(.*)\1$/, "$2")).join(".");
      out.push({ header: true, array: header[1] === "[", table, from: start });
      continue;
    }
    const key = /^\s*("[^"]*"|'[^']*'|[A-Za-z0-9_-]+)\s*[=.]/.exec(code);
    if (key) out.push({ table, key: key[1].replace(/^(["'])(.*)\1$/, "$2"), from: start, to: start + line.length });
  }
  return { out, open: open ?? (depth ? "]" : null) };
}

// The TOML file with `wanted` as tables `[<table>.<name>]` appended at its end.
export function editToml(text, table, wanted) {
  const { out, open } = tomlLines(text);
  if (open) return { kept: [], snippet: "a multi-line string, array or inline table in it never closes" };
  if (out.some((l) => (l.table === "" && l.key === table) || (l.header && l.array && l.table === table))) return { kept: [], snippet: `its "${table}" is written in a form Genter does not extend` };
  const sections = sectionsOf(text, out, table);
  // Every server already there with its text: its [<table>.<name>] section, or its key in [<table>] (inline, dotted).
  const servers = [...Object.entries(sections), ...out.filter((l) => l.table === table && l.key !== undefined).map((l) => [l.key, text.slice(l.from, l.to)])];
  const kept = [];
  const add = [];
  for (const w of wanted) {
    const block = renderToml(table, w.name, w.value);
    const mine = (l) => l.table === `${table}.${w.name}` || l.table.startsWith(`${table}.${w.name}.`) || (l.table === table && l.key === w.name);
    const other = servers.find(([name, body]) => name !== w.name && w.is(body));
    if (out.some(mine)) kept.push({ name: w.name, how: sections[w.name]?.replace(/\r/g, "").trimEnd() === block ? "same" : "differs" });
    else if (other) kept.push({ name: w.name, how: `as ${other[0]}` });
    else add.push({ name: w.name, block });
  }
  if (!add.length) return { kept };
  const lead = text === "" ? "" : text.endsWith("\n") ? "\n" : "\n\n";
  const inserted = `${lead}${add.map((a) => a.block).join("\n\n")}\n`;
  const after = text + inserted;
  // The proof that nothing else moved: the file reads as the same headers and keys, then Genter's tables only.
  const again = tomlLines(after);
  const ours = (l) => add.some((a) => l.table === `${table}.${a.name}`);
  if (again.open || !out.every((l, n) => same(l, again.out[n])) || !again.out.slice(out.length).every(ours)) return { kept, snippet: "the edit would change more than Genter's entries" };
  return { kept, at: text.length, inserted, text: after };
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

// The top-level block mapping `key` of a YAML file: { lines, head, end, child, children } or { snippet }. `lines` are
// the file's lines as they are, `head` the key's line, `end` the block's last line, `child` its children's indentation
// and `children` their text by name (line ends as "\n"). The lines of a block scalar (after `|` or `>`) are its text,
// never a key or a comment.
function yamlBlock(text, key) {
  const lines = text.split("\n");
  const plain = lines.map((l) => l.replace(/\r$/, ""));
  const significant = (l) => l.trim() !== "" && !/^\s*#/.test(l);
  if (plain.some((l) => /^\t/.test(l) || /^(---|\.\.\.)(\s|$)/.test(l))) return { snippet: "it uses tabs or several documents" };
  const top = plain.findIndex(significant);
  if (top >= 0 && !/^[A-Za-z_"'][^:#]*:(\s|$)/.test(plain[top])) return { snippet: "its top level is not a mapping" };
  const name = `(?:${key}|"${key}"|'${key}')`;
  const heads = plain.map((l, n) => (new RegExp(`^${name}\\s*:`).test(l) ? n : -1)).filter((n) => n >= 0);
  if (heads.length > 1) return { snippet: `it has "${key}" twice` };
  const head = heads[0];
  if (head !== undefined && !new RegExp(`^${name}\\s*:\\s*(#.*)?$`).test(plain[head])) return { snippet: `its "${key}" is written in a form Genter does not extend` };
  // The block under the key: its lines until the next line at the left edge.
  let end = head ?? -1;
  let child = null;
  let current = null;
  let scalar = null; // the indentation of the line a block scalar starts on, while its text goes on
  const children = {};
  if (head !== undefined) {
    for (let n = head + 1; n < plain.length; n++) {
      const l = plain[n];
      const indent = /^ */.exec(l)[0].length;
      if (scalar !== null && (l.trim() === "" || indent > scalar)) {
        if (l.trim() !== "") {
          children[current] += `${l}\n`;
          end = n;
        }
        continue;
      }
      scalar = null;
      if (!significant(l)) continue;
      if (indent === 0) break;
      child ??= indent;
      if (indent < child) return { snippet: `its "${key}" is indented unevenly` };
      if (indent === child) {
        if (/^ *-(\s|$)/.test(l)) return { snippet: `its "${key}" is a list, not a mapping` };
        const named = /^ *("[^"]*"|'[^']*'|[^:#]+?)\s*:/.exec(l)?.[1]?.replace(/^(["'])(.*)\1$/, "$2");
        if (named === undefined) return { snippet: `its "${key}" is not a mapping` };
        current = named;
        children[named] = "";
      }
      children[current] += `${l}\n`;
      end = n;
      const block = /(?::|^ *-) +([|>][1-9+-]{0,2}) *(#.*)?$/.exec(l);
      if (block?.[1].includes("+")) return { snippet: `its "${key}" holds a block scalar that keeps its last blank lines` };
      if (block) scalar = indent;
    }
  }
  return { lines, head, end, child, children };
}

// The YAML file with `wanted` as children of its top-level block mapping `key` ("extensions").
export function editYaml(text, key, wanted) {
  const block = yamlBlock(text, key);
  if (block.snippet) return { kept: [], snippet: block.snippet };
  const { lines, head, end, child, children } = block;
  const indent = " ".repeat(child ?? 2);
  const kept = [];
  const add = [];
  for (const w of wanted) {
    const entry = renderYaml(w.name, w.value, indent);
    const other = Object.entries(children).find(([name, body]) => name !== w.name && w.is(body));
    if (Object.hasOwn(children, w.name)) kept.push({ name: w.name, how: children[w.name] === `${entry}\n` ? "same" : "differs" });
    else if (other) kept.push({ name: w.name, how: `as ${other[0]}` });
    else add.push({ name: w.name, entry });
  }
  if (!add.length) return { kept };
  const body = `${add.map((a) => a.entry).join("\n")}\n`;
  let at = text.length;
  let inserted;
  if (head === undefined) inserted = `${text === "" || text.endsWith("\n") ? "" : "\n"}${key}:\n${body}`;
  else {
    // After the block's last line (its newline included), so comments and blank lines that follow it stay after it.
    at = lines.slice(0, end + 1).join("\n").length + 1;
    inserted = at > text.length ? `\n${body}` : body;
    at = Math.min(at, text.length);
  }
  const after = text.slice(0, at) + inserted + text.slice(at);
  // The proof that nothing else moved: the block reads as the same children, then Genter's.
  const again = yamlBlock(after, key);
  const names = [...Object.keys(children), ...add.map((a) => a.name)];
  if (again.snippet || !same(Object.keys(again.children), names) || Object.entries(children).some(([n, t]) => again.children[n] !== t)) return { kept, snippet: "the edit would change more than Genter's entries" };
  return { kept, at, inserted, text: after };
}

// ---- Taking Genter's entries out again (genter install --undo, when the file was saved since) ----

// The JSON (or JSONC) file without the members `entries` ({ name: value }) of its top-level object `key`, each taken
// out with its comma and every comment kept: { text } or { why }. Each must still be what genter install wrote.
export function removeJson(text, key, entries) {
  let root;
  try {
    root = parseJsonc(text);
  } catch (error) {
    return { why: `it does not read as JSON (${error.message})` };
  }
  const found = root.type === "object" ? root.members.filter((m) => m.key === key) : [];
  if (found.length !== 1 || found[0].node.type !== "object") return { why: `its "${key}" is not one object` };
  const container = found[0].node;
  const names = container.members.map((m) => m.key).filter((k) => Object.hasOwn(entries, k));
  if (new Set(names).size < names.length) return { why: `it has "${names[0]}" twice` };
  for (const m of container.members) if (names.includes(m.key) && !same(m.node.value, entries[m.key])) return { why: `"${m.key}" in it is not as genter install wrote it` };
  let after = text;
  try {
    for (const name of names) {
      const object = parseJsonc(after).members.find((m) => m.key === key).node;
      after = cutMember(after, object.members, object.members.findIndex((m) => m.key === name));
    }
    // The proof that nothing else moved: the file reads as it did, without Genter's entries.
    const rest = Object.fromEntries(Object.entries(container.value).filter(([k]) => !names.includes(k)));
    if (!same(parseJsonc(after).value, { ...root.value, [key]: rest })) throw new Error();
  } catch {
    return { why: "taking Genter's entries out would change more than them" };
  }
  return { text: after };
}

// The text without member k of an object and its comma: from its key to the next one, or, for the last member, from
// the end of what is before it (the comma before it too, unless it has a trailing comma of its own).
function cutMember(text, members, k) {
  const m = members[k];
  const next = members[k + 1];
  const prev = members[k - 1];
  const space = (c) => c === " " || c === "\t" || c === "\n" || c === "\r";
  let back = m.keyStart;
  while (back > 0 && space(text[back - 1])) back--;
  if (next) {
    let on = m.comma + 1;
    while (space(text[on])) on++;
    return text.slice(0, m.keyStart) + text.slice(on);
  }
  if (m.comma >= 0 || !prev) return text.slice(0, back) + text.slice(m.comma >= 0 ? m.comma + 1 : m.end);
  return text.slice(0, prev.comma) + text.slice(prev.comma + 1, back) + text.slice(m.end);
}

// The file without the run of text genter install added, when it is there once as it was written: { text } or { why }.
export function removeRun(text, run) {
  const at = text.indexOf(run);
  if (!run || at < 0 || text.indexOf(run, at + 1) >= 0) return { why: "Genter's lines in it are not as genter install wrote them" };
  return { text: text.slice(0, at) + text.slice(at + run.length) };
}
