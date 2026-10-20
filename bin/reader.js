// genter reader: make a reader for a text format, and check readers the way CI does. A reader is a folder in readers/:
// reader.json (the manifest, data that is never run: src/readers.js), fixtures/ (documents shaped like the real ones,
// with invented content, where the reader's globs find them) and expected.json (what each fixture gives).
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { compileReader, lintReader, lintRules, pattern, readWith } from "../src/readers.js";

// Secret-looking names a reader is given next to a fixture: it must read none of them.
const SECRETS = [".env", "id_rsa", "server.pem", "tls.key"];

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
function filesUnder(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) out.push(relative(dir, full).split(sep).join("/"));
    }
  };
  walk(dir);
  return out;
}
// The line numbers an expected output names (date, status, marks, entries).
const linesIn = (x) => (Array.isArray(x) ? x.flatMap(linesIn) : x && typeof x === "object" ? Object.entries(x).flatMap(([k, v]) => (k === "line" && Number.isInteger(v) ? [v] : linesIn(v))) : []);

// One reader's folder, checked: the manifest lints; every fixture gives exactly what expected.json says (null: the
// reader does not take that file); blanking a line it read changes what it gives; and a secret-looking file next to a
// fixture is never read. { name, fixtures, problems }.
export function checkReader(folder) {
  const name = basename(folder);
  const problems = [];
  let manifest;
  try {
    manifest = readJson(join(folder, "reader.json"));
  } catch (e) {
    return { name, fixtures: 0, problems: [`reader.json: ${e.code === "ENOENT" ? "missing" : e.message}`] };
  }
  const lint = lintReader(manifest, { folder: name });
  if (lint.length) return { name, fixtures: 0, problems: lint.map((p) => `reader.json: ${p}`) };
  const reader = compileReader(manifest);
  let expected;
  try {
    expected = readJson(join(folder, "expected.json"));
    if (!expected || typeof expected !== "object" || Array.isArray(expected)) throw new Error("an object of fixture paths");
  } catch (e) {
    return { name, fixtures: 0, problems: [`expected.json: ${e.code === "ENOENT" ? "missing: what each fixture gives" : e.message}`] };
  }
  const fixtures = existsSync(join(folder, "fixtures")) ? filesUnder(join(folder, "fixtures")) : [];
  for (const f of fixtures) if (!(f in expected)) problems.push(`expected.json: nothing for fixtures/${f}`);
  for (const f of Object.keys(expected)) if (!fixtures.includes(f)) problems.push(`expected.json: fixtures/${f} is not there`);
  let read = 0;
  for (const f of fixtures.filter((x) => x in expected)) {
    const text = readFileSync(join(folder, "fixtures", f), "utf8");
    const got = readWith(reader, f, text);
    if (got && Object.keys(got).length) read++;
    if (!isDeepStrictEqual(got, expected[f])) {
      problems.push(`fixtures/${f}: gives ${JSON.stringify(got)}, expected.json says ${JSON.stringify(expected[f])}`);
      continue;
    }
    const lines = text.split("\n");
    for (const n of [...new Set(linesIn(expected[f]))]) {
      const edited = lines.map((l, k) => (k === n - 1 ? "" : l)).join("\n");
      if (isDeepStrictEqual(readWith(reader, f, edited), got)) problems.push(`fixtures/${f}: blanking line ${n} changes nothing it gives`);
    }
    if (got) {
      for (const secret of SECRETS) {
        const path = dirname(f) === "." ? secret : `${dirname(f)}/${secret}`;
        if (readWith(reader, path, text) !== null) problems.push(`${path}: a secret-looking file is read`);
      }
    }
  }
  if (!read) problems.push("fixtures: none gives a date, a status, a mark or an entry");
  return { name, fixtures: fixtures.length, problems };
}

// A language's rules (rules/<lang>.json), checked: the schema, the patterns, each phrase against its own lines, and
// every phrase's "misses" against every phrase of every language (a line no phrase may mark). { files, problems }.
export function checkRules(dir) {
  const problems = [];
  const all = [];
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  for (const file of files) {
    let data;
    try {
      data = readJson(join(dir, file));
    } catch (e) {
      problems.push(`${file}: ${e.message}`);
      continue;
    }
    const lint = lintRules(data, { lang: basename(file, ".json") });
    if (lint.length) problems.push(...lint.map((p) => `${file}: ${p}`));
    else for (const p of data.marks) all.push({ file, ...p, re: pattern(p.pattern) });
  }
  for (const p of all) for (const line of p.misses) for (const q of all) if (q.re.exec(line)) problems.push(`${p.file} "${p.marker}": its miss ${JSON.stringify(line)} is marked by "${q.marker}" (${q.file})`);
  return { files, problems };
}

const NAME = /^[a-z0-9][a-z0-9-]{1,39}$/;

// readers/<name>/ in a folder: a manifest that reads "Date:" and "Status:" lines and a "Status: superseded by" mark, two
// fixtures, and the output expected of them, which `genter reader check` passes as it is. { folder, files }.
export function newReader(cwd, name) {
  if (!NAME.test(name ?? "")) throw new Error("genter reader new <name>: a name of 2 to 40 lowercase letters, digits and -, like madr or sphinx-deprecated");
  const folder = resolve(cwd, "readers", name);
  if (existsSync(folder)) throw new Error(`${relative(cwd, folder)} is there already: pick another name, or edit it`);
  const manifest = {
    $schema: "../reader.schema.json",
    dsl: 1,
    name,
    owner: "@your-github-handle",
    matches: { files: [`**/${name}/*.md`] },
    lines: 40,
    fields: {
      date: [{ in: "top", pattern: "^date: {0,3}(\\d{4}-\\d{2}-\\d{2})" }],
      status: [{ in: "top", pattern: "^status: {0,3}([a-z]{3,20})" }],
      marks: [{ kind: "superseded", in: "top", pattern: "^status: {0,3}superseded by:? {0,3}\\[([^\\]]{1,120})\\]\\(([^)\\s]{1,200})\\)", name: 1, by: 2 }],
    },
  };
  const fixtures = {
    [`docs/${name}/0001-first-way.md`]: "# Use the first way\n\nDate: 2026-01-15\nStatus: superseded by [Use the second way](0002-second-way.md)\n\nWhat was decided, and why.\n",
    [`docs/${name}/0002-second-way.md`]: "# Use the second way\n\nDate: 2026-06-01\nStatus: accepted\n\nWhat changed, and why.\n",
  };
  const reader = compileReader(manifest);
  const expected = Object.fromEntries(Object.entries(fixtures).map(([path, text]) => [path, readWith(reader, path, text)]));
  const files = { "reader.json": `${JSON.stringify(manifest, null, 2)}\n`, ...Object.fromEntries(Object.entries(fixtures).map(([p, t]) => [`fixtures/${p}`, t])), "expected.json": `${JSON.stringify(expected, null, 2)}\n` };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true });
    writeFileSync(join(folder, path), text, { flag: "wx" });
  }
  return { folder, files: Object.keys(files) };
}

const USAGE = `genter reader new <name>           make readers/<name>/: a manifest, two fixtures and what they give
genter reader check [folder ...]   lint each reader (every one in ./readers, and ./rules, when none is named) and
                                   check its fixtures against expected.json`;

// `genter reader <new|check> ...`: the exit code.
export function readerCommand(words, { cwd = process.cwd(), print = console.log, error = console.error } = {}) {
  const [what, ...rest] = words;
  if (what === "new") {
    try {
      const { folder, files } = newReader(cwd, rest[0]);
      const at = relative(cwd, folder).split(sep).join("/");
      print(`Made ${at}/: ${files.join(", ")}`);
      print(`Next: set "owner" and "matches" in ${at}/reader.json, put documents shaped like the real ones (invented content) under ${at}/fixtures/ where its globs find them, write what each gives in ${at}/expected.json, then: genter reader check ${at}`);
      return 0;
    } catch (e) {
      error(e.message);
      return 1;
    }
  }
  if (what !== "check") {
    error(USAGE);
    return 1;
  }
  let folders = rest.map((f) => resolve(cwd, f));
  let rules = null;
  if (!folders.length) {
    const dir = join(cwd, "readers");
    if (!existsSync(dir)) {
      error("No readers/ folder here: run this where readers/ is, or name a reader's folder");
      return 1;
    }
    folders = readdirSync(dir).filter((n) => existsSync(join(dir, n, "reader.json"))).map((n) => join(dir, n)).sort();
    if (existsSync(join(cwd, "rules"))) rules = join(cwd, "rules");
  }
  let failed = false;
  for (const folder of folders) {
    if (!existsSync(folder) || !statSync(folder).isDirectory()) {
      error(`${relative(cwd, folder) || folder}: not a folder`);
      failed = true;
      continue;
    }
    const { name, fixtures, problems } = checkReader(folder);
    if (problems.length) {
      failed = true;
      for (const p of problems) error(`${name}: ${p}`);
    } else print(`ok ${name}: ${fixtures} fixtures`);
  }
  if (rules) {
    const { files, problems } = checkRules(rules);
    if (problems.length) {
      failed = true;
      for (const p of problems) error(`rules: ${p}`);
    } else print(`ok rules: ${files.join(", ")}`);
  }
  return failed ? 1 : 0;
}
