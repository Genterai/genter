import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { checkReader, checkRules } from "../bin/reader.js";
import { supersededOf } from "../src/drift.js";
import { createLocal } from "../src/local.js";
import { decisionReaders } from "../src/page.js";
import { compileReader, findPlace, isoDate, KINDS, LIMITS, lintPattern, lintReader, loadReaders, loadRules, pattern, phrases, readDocument, readerSchema, readWith, secretLooking } from "../src/readers.js";
import { cipher } from "../src/seal.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const READERS = join(root, "readers");
const NAMES = readdirSync(READERS).filter((n) => existsSync(join(READERS, n, "reader.json"))).sort();
const manifestOf = (name) => JSON.parse(readFileSync(join(READERS, name, "reader.json"), "utf8"));
const expectedOf = (name) => JSON.parse(readFileSync(join(READERS, name, "expected.json"), "utf8"));
const bin = join(root, "bin/genter.js");
const genter = (args, cwd) => spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8", env: { PATH: process.env.PATH, HOME: cwd, GENTER_HOME: join(cwd, ".genter") } });

describe("the pattern language", () => {
  it("[rl:readers/restricted-patterns] refuses nested quantifiers, unbounded repeats, backreferences, lookarounds and what it does not have, saying where", () => {
    const refused = [
      ["(a+)+", /unbounded repeat \+/],
      ["(a{1,3}){1,3}", /nested quantifier .*, at 13/],
      ["(?:x{0,5})?", /nested quantifier/],
      ["(?:(?:ab)?c){1,4}", /nested quantifier/],
      ["(a)\\1", /backreference, at 3/],
      ["(?<n>a)\\k<n>", /group other than/],
      ["a\\k<n>", /backreference/],
      ["(?=a)b", /lookaround, at 1/],
      ["(?!a)b", /lookaround/],
      ["(?<=a)b", /lookaround/],
      ["(?<!a)b", /lookaround/],
      ["a*", /unbounded repeat \*/],
      ["a{2,}", /unbounded repeat \{2,\}/],
      ["a{0,201}", /repeat above 200/],
      ["a??", /quantifier after a quantifier/],
      ["\\p{L}", /Unicode property/],
      ["\\x41", /does not have/],
      ["[\\n]", /does not have/],
      ["x".repeat(301), /longer than 300 characters/],
      [".{0,200}".repeat(11), /more than 2000 steps/],
      ["(a)(b)(c)(d)(e)(f)(g)", /more than 6 groups/],
      ["[]", /empty class/],
      ["[z-a]", /runs backwards/],
      ["a|", /empty alternative/],
      ["(a", /not closed/],
      ["a)", /closes no group/],
      ["^?", /nothing to repeat/],
      ["\\b{2}", /nothing to repeat/],
    ];
    for (const [src, why] of refused) assert.match(lintPattern(src) ?? "accepted", why, src);
    for (const src of ["^status: {0,3}([a-z]{3,20})", "\\bsuperseded by\\b", "(?:is|was)?\\s{1,3}x", "[^)\\s]{1,200}", "(?:ab){1,3}", "(?:^|[\\s>])устарел[а-яё]{0,2}"]) assert.equal(lintPattern(src), null, src);
    // In a manifest, with where.
    const m = manifestOf("adr");
    m.fields.status[0].pattern = "^status: (a+)+";
    assert.deepEqual(lintReader(m, { folder: "adr" }), ["fields.status[0].pattern: an unbounded repeat + (write {0,N} or {1,N}, N at most 200), at 11"]);
    m.fields.status[0].pattern = "^status: (\\w{1,9})\\1";
    assert.deepEqual(lintReader(m, { folder: "adr" }), ["fields.status[0].pattern: a backreference, at 18"]);
  });

  it("[rl:readers/restricted-patterns] matches as JavaScript would, without case, and knows every alphabet", () => {
    const same = [
      ["superseded by \\[([^\\]]{1,120})\\]\\(([^)\\s]{1,200})\\)", "Status: Superseded by [ADR-11](0011-redis.md) ok"],
      ["^[-*]? {0,3}\\*{0,2}status\\*{0,2}:\\*{0,2} {0,3}([a-z]{3,20})", "**Status:** Accepted"],
      ["(ab|a)(b?)c", "xabc"],
      ["a{0,3}b", "xxaaab"],
      ["(x{1,3})(x{1,3})", "xxxxx"],
      ["^(.{1,200}) \\((\\d{4}-\\d{2}-\\d{2})\\)$", "Jobs run on Redis (2026-09-24)"],
      ["\\bno longer (?:maintained|supported)\\b", "This is no longer maintained."],
      ["[^\\w(`\\-]", "deprecated_x(`-) y"],
      ["\\d{2}\\s\\S", "a 12 b"],
      ["^$", ""],
      ["c$", "abc"],
      ["(a)|(b)", "b"],
    ];
    for (const [src, line] of same) {
      const mine = pattern(src).exec(line);
      const js = new RegExp(src, "i").exec(line);
      assert.equal(mine?.index, js?.index, `${src} on ${line}`);
      if (js) for (let n = 0; n < js.length; n++) assert.equal(n ? mine.group(n) : line.slice(mine.index, mine.end), js[n], `${src} group ${n}`);
    }
    // \w and \b are every alphabet's (JavaScript's \w is ASCII, so "устарело" never matched the old patterns).
    assert.equal(pattern("\\bустарел\\w{0,3}\\b").exec("Документ УСТАРЕЛО давно")?.index, 9);
    assert.equal(pattern("^\\w{1,10}$").exec("Регламент")?.end, 9);
    assert.equal(pattern("замен[её]н\\b").exec("заменённый"), null);
    assert.equal(pattern("[А-Я]{2}").exec("ок")?.index, 0);
  });

  it("[rl:readers/restricted-patterns] runs in time linear in the line, even on a pattern backtracking takes exponential time on", () => {
    const ambiguous = pattern("(?:a|a){1,200}[xy]");
    const widest = pattern(".{0,200}.{0,200}.{0,200}.{0,200}.{0,190}[xy]");
    const started = Date.now();
    for (const p of [ambiguous, widest]) assert.equal(p.exec("a".repeat(400)), null);
    assert.ok(Date.now() - started < 2000, `${Date.now() - started} ms`);
  });

  it("[rl:readers/restricted-patterns] a reader of many wide patterns over every line gives up on a document past its work limit, the same way every time", () => {
    const wide = { in: "any", pattern: "(.{0,200}.{0,200}.{0,200}.{0,200}.{0,190}[xy])" };
    const m = { dsl: 1, name: "wide", owner: "@someone", fallback: true, matches: { files: ["**/*.md"] }, lines: 400, fields: { date: Array(16).fill(wide), status: Array(16).fill(wide) } };
    assert.deepEqual(lintReader(m, { folder: "wide" }), []);
    const reader = compileReader(m);
    const doc = Array.from({ length: 400 }, () => "a".repeat(399)).join("\n");
    const started = Date.now();
    assert.equal(readWith(reader, "docs/x.md", doc), null);
    assert.equal(readWith(reader, "docs/x.md", doc), null);
    assert.ok(Date.now() - started < 2000, `${Date.now() - started} ms`);
    // Within its limit it reads as ever.
    assert.deepEqual(readWith(reader, "docs/x.md", "ab x"), { status: { value: "ab x", line: 1 } });
  });
});

describe("manifests", () => {
  it("[rl:readers/declarative] every reader in readers/ passes lint, named as its folder, format readers before fallback ones", () => {
    assert.deepEqual(NAMES, ["adr", "banners", "changelog", "decisions", "eip", "kep", "nep", "obsidian", "pep", "pip", "proposals", "rfc", "rfd"]);
    for (const name of NAMES) assert.deepEqual(lintReader(manifestOf(name), { folder: name }), [], name);
    const { readers, problems } = loadReaders();
    assert.deepEqual(problems, []);
    assert.deepEqual(readers.map((r) => r.name), ["adr", "changelog", "decisions", "eip", "kep", "nep", "pep", "pip", "proposals", "rfc", "rfd", "banners", "obsidian"]);
    assert.deepEqual(lintReader(manifestOf("adr"), { folder: "madr" }), ['name: "adr" is not the name of its folder, "madr"']);
  });

  it("[rl:readers/declarative] a key or value outside the schema is refused, and the same document always gives the same output", () => {
    const m = manifestOf("adr");
    assert.deepEqual(lintReader({ ...m, extra: 1 }), ['extra: not a key of a reader']);
    assert.deepEqual(lintReader({ ...m, dsl: 2 }), ["dsl: must be 1"]);
    assert.deepEqual(lintReader({ ...m, lines: 401 }), ["lines: at most 400"]);
    assert.deepEqual(lintReader({ ...m, owner: "Genterai" }), ["owner: must match ^@[A-Za-z0-9][A-Za-z0-9-]{0,38}$"]);
    const bad = structuredClone(m);
    bad.fields.marks[0].kind = "wrong";
    bad.fields.date[0].in = "everywhere";
    bad.fields.date[1].section = "^date$";
    assert.deepEqual(lintReader(bad), ["fields.date[0].in: one of front-matter, top, section, any, heading", "fields.marks[0].kind: one of superseded, deprecated, obsolete, archived, moved, removed, unmaintained"]);
    assert.deepEqual(lintReader(structuredClone({ ...m, fields: { date: [{ in: "top", pattern: "^date: (x)", value: 2 }] } })), ["fields.date[0].value: group 2, but the pattern has 1"]);
    assert.deepEqual(lintReader({ ...m, fields: { date: [{ in: "top", section: "^x$", pattern: "(x)" }] } }), ['fields.date[0].section: only with in: "section"']);
    assert.deepEqual(lintReader({ ...m, fields: {} }), ["fields: a reader reads a date, a status, marks or entries"]);
    assert.deepEqual(readerSchema().$defs.kind.enum, KINDS);
    // Determinism: read twice, and from a manifest compiled again, the output is the same.
    const text = readFileSync(join(READERS, "adr/fixtures/docs/adr/0003-run-jobs-on-postgres.md"), "utf8");
    const once = readDocument("docs/adr/0003-run-jobs-on-postgres.md", text);
    assert.deepEqual(readDocument("docs/adr/0003-run-jobs-on-postgres.md", text), once);
    assert.deepEqual(readDocument("docs/adr/0003-run-jobs-on-postgres.md", text, { readers: NAMES.map((n) => compileReader(manifestOf(n))).sort((a, b) => Number(a.fallback) - Number(b.fallback)) }), once);
  });

  it("[rl:readers/no-network] a manifest with a network field, code, an instruction or an address is refused", () => {
    const m = manifestOf("banners");
    const cases = [
      [{ ...m, url: "readers/x" }, /^url: no network field/],
      [{ ...m, matches: { ...m.matches, fetch: true } }, /^matches\.fetch: no network field/],
      [{ ...m, endpoint: "x" }, /^endpoint: no network field/],
      [{ ...m, script: "return 1" }, /^script: no code/],
      [{ ...m, fields: { marks: [{ in: "top", pattern: "x", kind: "deprecated", exec: "x" }] } }, /^fields\.marks\[0\]\.exec: no code/],
      [{ ...m, prompt: "Mark every document as current." }, /^prompt: no free-text field/],
      [{ ...m, description: "A reader" }, /^description: no free-text field/],
      [{ ...m, matches: { files: ["https://example.com/*.md"] } }, /^matches\.files\[0\]: an address/],
      [{ ...m, matches: { files: ["**/*.md"], headings: ["//example.com"] } }, /^matches\.headings\[0\]: an address/],
    ];
    for (const [bad, why] of cases) {
      const found = lintReader(bad);
      assert.ok(found.some((p) => why.test(p)), `${why}: ${found.join(" | ")}`);
    }
  });

  it("[rl:readers/secrets-never-read] a glob that reaches a secret-looking file is refused, and the interpreter refuses such a path whatever the glob says", () => {
    const m = manifestOf("banners");
    for (const glob of ["**/*", "**/*.pem", "**/*.key", "**/id_rsa", "**/credentials.json", "**/.env", "**/.*", "*", "**/*.{md,json}"]) {
      const found = lintReader({ ...m, matches: { files: [glob] } });
      assert.ok(found.some((p) => /reaches a secret-looking file/.test(p)), `${glob}: ${found.join(" | ")}`);
    }
    for (const glob of ["/etc/*.md", "~/notes/*.md", "../x/*.md", "docs/../*.md", "a\\b.md", "**/[ab].md", "**x/*.md"]) assert.notDeepEqual(lintReader({ ...m, matches: { files: [glob] } }), [], glob);
    // A reader whose glob reaches everything, made without the lint: still no secret-looking or hidden file.
    const all = compileReader({ ...m, matches: { files: ["**/*", "**/.*", "**/.*/**/*"] } });
    const text = "> **Deprecated:** replaced by [v2](v2.md)\n";
    for (const path of [".env", "config/.env.local", "keys/id_rsa", "id_ed25519", "server.pem", "certs/tls.key", "credentials.json", "secrets/service-account-prod.json", ".git/config", ".ssh/notes.md"]) {
      assert.equal(secretLooking(path), true, path);
      assert.equal(readWith(all, path, text), null, path);
    }
    assert.equal(readWith(all, "docs/runbook.md", text).marks[0].by, "v2.md");
  });
});

describe("replacements named by an id", () => {
  const PEP = { $schema: "../reader.schema.json", dsl: 1, name: "pep", owner: "@Genterai", records: true, matches: { files: ["**/peps/pep-*.rst"] }, fields: { marks: [{ kind: "superseded", in: "top", pattern: "^superseded-by: {0,3}(\\d{1,5})\\b", name: 1, id: 1, place: "pep-{id:04}.*" }] } };
  const withPlace = (place, extra = {}) => ({ ...PEP, fields: { marks: [{ ...PEP.fields.marks[0], place, ...extra }] } });

  it("[rl:readers/by-id] a mark's id becomes a place by its manifest's template, and a template that could leave the project, reach an address, a hidden or a secret-looking file is refused, saying why", () => {
    assert.deepEqual(lintReader(PEP), []);
    const pep = compileReader(PEP);
    const mark = (text) => readWith(pep, "peps/pep-0438.rst", `PEP: 438\n${text}\n`)?.marks?.[0];
    assert.deepEqual(mark("Superseded-By: 470"), { kind: "superseded", line: 2, quote: "Superseded-By: 470", name: "470", place: "pep-0470.*" });
    assert.equal(mark("Superseded-By: 12345").place, "pep-12345.*", "wider than its width, as written");
    assert.equal(mark("Superseded-By: 0007").place, "pep-0007.*");
    // {id} as written; an id is letters, digits and -, at most 32; {id:0N} takes digits only.
    const named = compileReader({ ...PEP, fields: { marks: [{ kind: "superseded", in: "top", pattern: "^replaced by ([a-z0-9-]{1,40}|\\S{1,40})$", id: 1, place: "../notes/{id}.md" }] } });
    const placeOf = (word) => readWith(named, "peps/pep-0001.rst", `replaced by ${word}\n`)?.marks?.[0];
    assert.equal(placeOf("release-v2").place, "../notes/release-v2.md");
    assert.equal(placeOf("../../etc").place, undefined, "a / or a . is no id");
    assert.equal(placeOf("a".repeat(33)).place, undefined, "an id of more than 32");
    assert.equal(placeOf("x%2F..").place, undefined);
    assert.equal(placeOf("release-v2").name, "release-v2", "the id names it when nothing else does");
    const padded = compileReader(withPlace("pep-{id:04}.*", { pattern: "^superseded-by: {0,3}([a-z0-9]{1,8})\\b" }));
    assert.equal(readWith(padded, "peps/pep-0001.rst", "Superseded-By: abc\n").marks[0].place, undefined, "{id:0N} takes digits only");
    const refused = [
      ["/etc/{id}", /a path from the document's folder/],
      ["~/{id}.md", /a path from the document's folder/],
      ["C:/{id}.md", /a path from the document's folder/],
      ["a\\{id}.md", /a path from the document's folder/],
      ["{id}.pem", /secret-looking file \(server\.pem\)/],
      ["{id}*", /secret-looking file \(id_rsa\)/],
      ["x/{id}/../y.md", /climbs \(\.\.\) only at its start/],
      ["../../../../{id}.md", /at most 3 folders/],
      [".hidden/{id}.md", /no empty or hidden folder or name/],
      ["x//{id}.md", /a path from the document's folder/],
      ["a*/{id}.md", /a \* only in the file's name/],
      ["*{id}*x*.md", /at most two \*/],
      ["{id}-{id}.md", /holds \{id\} or \{id:0N\}/],
      ["notes.md", /holds \{id\} or \{id:0N\}/],
      ["{id:00}.md", /holds \{id\} or \{id:0N\}/],
      ["{id}.{md,rst}", /no \{ or \} but its \{id\}/],
      ["{id}?.md", /a path from the document's folder/],
      ["https://example.com/{id}", /an address/],
    ];
    // {id} in a folder's name (an archive of one folder per document) is a place too, as the red line says.
    assert.deepEqual(lintReader(withPlace("../{id:04}/README.adoc")), []);
    for (const [place, why] of refused) {
      const found = lintReader(withPlace(place));
      assert.ok(found.some((p) => why.test(p)), `${place}: ${found.join(" | ")}`);
    }
    const { place: _, ...noPlace } = PEP.fields.marks[0];
    assert.deepEqual(lintReader({ ...PEP, fields: { marks: [noPlace] } }), ["fields.marks[0].place: an id and its place go together"]);
    assert.deepEqual(lintReader(withPlace("pep-{id}.rst", { id: 2 })), ["fields.marks[0].id: group 2, but the pattern has 1"]);
    assert.ok(lintReader({ ...PEP, fields: { marks: [{ in: "top", phrases: true, id: 1, place: "x-{id}.md" }] } }).some((p) => /id: not with phrases/.test(p)));
  });

  it("[rl:readers/by-id] a place names one file of the folder it leads to, never above the project, never the document itself, a hidden or a secret-looking one; none or two, and it names nothing", () => {
    const files = { peps: ["pep-0438.rst", "pep-0470.rst", "PEP-0471.RST", "pep-0480.rst", "pep-0480.txt", ".pep-0490.rst", "pep-0500.pem"], "": ["README.md"], notes: ["release-v2.md"] };
    const list = (folder) => files[folder] ?? [];
    assert.equal(findPlace("peps/pep-0438.rst", "pep-0470.*", list), "peps/pep-0470.rst");
    assert.equal(findPlace("peps/pep-0438.rst", "pep-0471.*", list), "peps/PEP-0471.RST", "without case");
    assert.equal(findPlace("peps/pep-0438.rst", "pep-0480.*", list), null, "two files: none");
    assert.equal(findPlace("peps/pep-0438.rst", "pep-0438.*", list), null, "never the document itself");
    assert.equal(findPlace("peps/pep-0438.rst", "pep-0490.*", list), null, "never a hidden file");
    assert.equal(findPlace("peps/pep-0438.rst", "pep-0500.*", list), null, "never a secret-looking file");
    assert.equal(findPlace("peps/pep-0438.rst", "pep-9999.*", list), null);
    assert.equal(findPlace("peps/pep-0438.rst", "../notes/release-v2.md", list), "notes/release-v2.md");
    assert.equal(findPlace("peps/pep-0438.rst", "../README.md", list), "README.md");
    assert.equal(findPlace("peps/pep-0438.rst", "../../README.md", list), null, "above the project's root");
    for (const bad of ["/etc/passwd", "https://example.com/x", "..\\x", "a/../b.md", ".git/config", "x/.env"]) assert.equal(findPlace("peps/pep-0438.rst", bad, () => ["passwd", "x", "b.md", "config", ".env"]), null, bad);
    assert.equal(findPlace("peps/pep-0438.rst", "pep-0470.*", () => {
      throw new Error("no folder");
    }), null);
  });

  it("[rl:readers/by-id] [rl:local-search/reader-marks] [rl:local-search/current-first] a PEP superseded by a number: the replacing PEP comes first, its notice quoted; a number that names no file, one switched off, a link out of the project or a file genter.json leaves out brings nothing and the mark stays", async () => {
    const base = mkdtempSync(join(tmpdir(), "genter-by-id-"));
    const dir = join(base, "project");
    const pep = (n, status, extra, body) => `PEP: ${n}\nTitle: Exporting invoices\nStatus: ${status}\nCreated: 05-Jul-2021\n${extra}\nAbstract\n========\n\n${body}\n`;
    const files = {
      "peps/pep-0042.rst": pep(42, "Superseded", "Superseded-By: 57\n", "Invoices are exported as one file per month, in CSV."),
      "peps/pep-0057.rst": pep(57, "Final", "Replaces: 42\n", "Invoices are exported as one file per customer, in Parquet."),
      "peps/pep-0060.rst": pep(60, "Superseded", "Superseded-By: 61\n", "Refunds are exported as one file per month, in CSV."),
      "peps/pep-0070.rst": pep(70, "Superseded", "Superseded-By: 71\n", "Credits are exported as one file per month, in CSV."),
      "peps/pep-0071.rst": pep(71, "Final", "", "Credits are exported per customer."),
    };
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    const home = join(base, "home");
    mkdirSync(home, { recursive: true });
    try {
      const g = createLocal({ home, secret: "s", cwd: dir });
      const out = await g.find("invoices exported one file per month CSV", { limit: 4 });
      const old = out.results.find((r) => r.path === join(dir, "peps/pep-0042.rst"));
      assert.deepEqual(old.anchor.superseded, { marker: "superseded", line: 5, reader: "pep", by: join(dir, "peps/pep-0057.rst") });
      const before = out.results[out.results.indexOf(old) - 1];
      assert.equal(before.path, join(dir, "peps/pep-0057.rst"), "the replacing PEP comes right before it");
      assert.equal(before.replaces, old.ref);
      assert.ok(old.facts.some((f) => f.includes('says at line 5: "Superseded-By: 57"')), old.facts.join(" | "));
      // PEP 61 is not there: the mark shows, names no place, and nothing moves.
      const refunds = await g.find("refunds exported one file per month CSV", { limit: 2 });
      assert.equal(refunds.results[0].path, join(dir, "peps/pep-0060.rst"));
      assert.deepEqual(refunds.results[0].anchor.superseded, { marker: "superseded", line: 5, reader: "pep" });
      // PEP 71 switched off: never named, never brought.
      writeFileSync(join(home, "config.json"), JSON.stringify({ secret: "s", off: [join(dir, "peps/pep-0071.rst")] }));
      const credits = await createLocal({ home, secret: "s", cwd: dir }).find("credits exported one file per month CSV", { limit: 3 });
      assert.equal(credits.results[0].path, join(dir, "peps/pep-0070.rst"));
      assert.deepEqual(credits.results[0].anchor.superseded, { marker: "superseded", line: 5, reader: "pep" });
      assert.ok(!credits.results.some((r) => r.path === join(dir, "peps/pep-0071.rst")));
      // In a project of its own: PEP 81 is a link to a file outside the project, PEP 91 is left out by the project's
      // genter.json. Neither is named or brought, and each mark stays.
      const other = join(base, "other");
      const outside = join(base, "outside");
      for (const d of [join(other, "peps"), outside, join(base, "home2")]) mkdirSync(d, { recursive: true });
      writeFileSync(join(other, "peps/pep-0080.rst"), pep(80, "Superseded", "Superseded-By: 81\n", "Payouts are exported as one file per month, in CSV."));
      writeFileSync(join(outside, "notes.rst"), pep(81, "Final", "", "Payouts are exported as one file per customer."));
      symlinkSync(join(outside, "notes.rst"), join(other, "peps/pep-0081.rst"));
      writeFileSync(join(other, "peps/pep-0090.rst"), pep(90, "Superseded", "Superseded-By: 91\n", "Taxes are exported as one file per month, in CSV."));
      writeFileSync(join(other, "peps/pep-0091.rst"), pep(91, "Final", "", "Taxes are exported as one file per customer."));
      writeFileSync(join(other, "genter.json"), JSON.stringify({ exclude: ["peps/pep-0091.rst"] }));
      const g2 = createLocal({ home: join(base, "home2"), secret: "s", cwd: other });
      for (const [q, n] of [["payouts exported one file per month CSV", 80], ["taxes exported one file per month CSV", 90]]) {
        const got = await g2.find(q, { limit: 3 });
        assert.equal(got.results[0].path, join(other, `peps/pep-00${n}.rst`), q);
        assert.deepEqual(got.results[0].anchor.superseded, { marker: "superseded", line: 5, reader: "pep" }, q);
        assert.ok(!got.results.some((r) => r.path === join(other, `peps/pep-00${n + 1}.rst`)), q);
      }
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("[rl:readers/records] a manifest says whether its documents are decision records, never with fallback, and no reader's name is written in the engine", () => {
    assert.deepEqual(decisionReaders(), ["adr", "decisions", "eip", "kep", "nep", "pep", "pip", "proposals", "rfc", "rfd"]);
    for (const name of NAMES) assert.equal(manifestOf(name).records === true, decisionReaders().includes(name), name);
    assert.deepEqual(lintReader({ ...manifestOf("banners"), records: true }), ["records: not with fallback (a reader of any document of a kind reads no decision records)"]);
    assert.deepEqual(lintReader({ ...manifestOf("adr"), records: "yes" }), ["records: must be a boolean"]);
    const page = readFileSync(join(root, "src/page.js"), "utf8");
    for (const name of NAMES) assert.ok(!new RegExp(`["']${name}["']`).test(page), `src/page.js names the ${name} reader`);
  });
});

describe("the language rules", () => {
  const files = readdirSync(join(root, "rules")).filter((f) => f.endsWith(".json")).sort();
  it("[rl:readers/language-rules] rules/ holds English and Russian, every file lints and no phrase marks another's misses", () => {
    assert.deepEqual(files, ["en.json", "ru.json"]);
    assert.deepEqual(loadRules().problems, []);
    assert.deepEqual(checkRules(join(root, "rules")).problems, []);
    // The phrases that were code (src/drift.js) are data now, in the same order.
    assert.deepEqual(loadRules().phrases.map((p) => p.marker), ["deprecated", "obsolete", "superseded", "replaced by", "moved to", "no longer maintained", "archived", "устарел", "заменён", "перенесён"]);
    // Rules that cannot be read are an error, never every document left unmarked.
    const empty = mkdtempSync(join(tmpdir(), "genter-rules-"));
    try {
      assert.throws(() => phrases(empty), /language rules cannot be read/);
      assert.throws(() => phrases(join(empty, "nowhere")), /language rules cannot be read: no rules in/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
  for (const file of files) {
    for (const p of JSON.parse(readFileSync(join(root, "rules", file), "utf8")).marks) {
      it(`[rl:readers/language-rules] ${file} "${p.marker}": marks the top of a document with each of its lines, and none of its misses`, () => {
        const re = pattern(p.pattern);
        for (const line of p.hits) {
          assert.ok(re.exec(line), `${p.marker} must mark ${line}`);
          assert.ok(supersededOf({ text: `${line}\n\nBody.` }), `a document whose top says ${line} is marked`);
        }
        for (const line of p.misses) {
          assert.equal(re.exec(line), null, `${p.marker} must not mark ${line}`);
          assert.equal(supersededOf({ text: `${line}\n\nBody.` }), null, `a document whose top says ${line} is not marked`);
        }
      });
    }
  }
});

// A reader's fixtures as a project of their own, with a Genter home beside it.
function project(name) {
  const base = mkdtempSync(join(tmpdir(), `genter-reader-${name}-`));
  const dir = join(base, "project");
  cpSync(join(READERS, name, "fixtures"), dir, { recursive: true });
  return { base, dir, home: join(base, "home"), done: () => rmSync(base, { recursive: true, force: true }) };
}
// Words a fixture surely holds: those of its first lines.
const questionOf = (text) => [...new Set(text.split("\n").slice(0, 8).join(" ").match(/\p{L}{3,}/gu) ?? [])].slice(0, 12).join(" ");

describe("each reader's contract", () => {
  for (const name of NAMES) {
    const expected = expectedOf(name);
    const read = Object.entries(expected).filter(([, out]) => out && Object.keys(out).length);

    it(`[rl:readers/contract-tested] ${name}: its fixtures give exactly what expected.json says, and blanking a line it read changes that`, () => {
      assert.ok(read.length >= 1, "a fixture that gives something");
      assert.deepEqual(checkReader(join(READERS, name)).problems, []);
    });

    it(`[rl:readers/contract-tested] [rl:readers/off-honoured] ${name}: the engine reads its fixtures with it, and never gives one the person switched off to a reader`, async () => {
      const box = project(name);
      // A reader beside the engine's own (loadReaders() is what it reads with) that only notes each path it is given.
      const given = [];
      const spy = { name: "spy", files: [(p) => given.push(p) < 0], headings: [] };
      const readers = loadReaders().readers;
      readers.push(spy);
      try {
        const [path, out] = read[0];
        const file = join(box.dir, path);
        const question = questionOf(readFileSync(file, "utf8"));
        mkdirSync(box.home, { recursive: true });
        writeFileSync(join(box.home, "config.json"), JSON.stringify({ secret: "s", off: [file] }));
        const off = await createLocal({ home: box.home, secret: "s", cwd: box.dir }).find(question, { limit: 20 });
        assert.ok(!off.results.some((r) => r.path === file), "a switched-off fixture never answers");
        assert.ok(!given.includes(path), `${path} is given to a reader while it is off`);
        writeFileSync(join(box.home, "config.json"), JSON.stringify({ secret: "s" }));
        const on = await createLocal({ home: box.home, secret: "s", cwd: box.dir }).find(question, { limit: 20 });
        const hit = on.results.find((r) => r.path === file);
        assert.ok(hit, `${path} answers once it is on`);
        assert.ok(given.includes(path), `${path} is given to the readers once it is on`);
        assert.ok(hit.anchor.document.readers.includes(name), JSON.stringify(hit.anchor.document));
        if (out.date) assert.equal(hit.anchor.document.date, out.date.value);
      } finally {
        readers.splice(readers.indexOf(spy), 1);
        box.done();
      }
    });

    it(`[rl:readers/restricted-patterns] ${name}: its fixtures, each repeated up to the lines it reads, need far less than its work limit`, () => {
      const reader = loadReaders().readers.find((r) => r.name === name);
      for (const [path] of Object.entries(expected)) {
        const text = readFileSync(join(READERS, name, "fixtures", path), "utf8");
        let long = text;
        while (long.split("\n").length < reader.lines) long += `\n${text}`;
        const limited = readWith(reader, path, long);
        const saved = LIMITS.work;
        try {
          LIMITS.work = LIMITS.work / 10;
          assert.deepEqual(readWith(reader, path, long), limited, `${path} with a tenth of the work`);
        } finally {
          LIMITS.work = saved;
        }
      }
    });

    it(`[rl:readers/secrets-never-read] ${name}: secret-looking files beside its fixtures, holding what it marks, are never read`, async () => {
      const box = project(name);
      try {
        const [path] = read[0];
        const text = readFileSync(join(box.dir, path), "utf8");
        const secrets = [".env", "id_rsa", "server.pem", "tls.key"].map((s) => join(dirname(join(box.dir, path)), s));
        for (const s of secrets) writeFileSync(s, text);
        for (const s of secrets) assert.equal(readWith(loadReaders().readers.find((r) => r.name === name), s.slice(box.dir.length + 1), text), null);
        const out = await createLocal({ home: box.home, secret: "s", cwd: box.dir }).find(questionOf(text), { limit: 20 });
        assert.ok(out.results.length, "the fixture itself answers");
        assert.ok(!out.results.some((r) => secrets.includes(r.path)), out.results.map((r) => r.path).join(", "));
      } finally {
        box.done();
      }
    });
  }
});

describe("the engine reads with the readers", () => {
  const ADR_OLD = "# 3. Run background jobs on Postgres\n\nDate: 2026-03-03\nDeciders: Priya, Omar\nTechnical story: month-end exports\n\n## Status\n\nSuperseded by [11. Run background jobs on Redis](0011-run-jobs-on-redis.md)\n\n## Decision\n\nBackground jobs run on Postgres with SKIP LOCKED.\n";
  const ADR_NEW = "# 11. Run background jobs on Redis\n\nDate: 2026-09-24\n\n## Status\n\nAccepted\n\n## Decision\n\nBackground jobs run on Redis streams.\n";

  it("[rl:local-search/reader-marks] [rl:local-search/follow-replaced] [rl:local-search/current-first] an ADR marked in its Status section, past its first lines, comes right after what replaces it; the same words outside a reader's files mark nothing", async () => {
    const base = mkdtempSync(join(tmpdir(), "genter-readers-"));
    const dir = join(base, "project");
    for (const [path, text] of Object.entries({ "docs/adr/0003-run-jobs-on-postgres.md": ADR_OLD, "docs/adr/0011-run-jobs-on-redis.md": ADR_NEW, "docs/notes/0003-run-jobs-on-postgres.md": ADR_OLD.replace("Postgres with", "Postgres (a copy) with") })) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    try {
      const g = createLocal({ home: join(base, "home"), secret: "s", cwd: dir });
      const out = await g.find("background jobs run on Postgres SKIP LOCKED", { limit: 3 });
      const adr = out.results.find((r) => r.path === join(dir, "docs/adr/0003-run-jobs-on-postgres.md"));
      assert.deepEqual(adr.anchor.superseded, { marker: "superseded", line: 9, reader: "adr", by: join(dir, "docs/adr/0011-run-jobs-on-redis.md") });
      assert.ok(adr.facts.includes('docs/adr/0003-run-jobs-on-postgres.md says at line 9: "Superseded by 11. Run background jobs on Redis"'), adr.facts.join(" | "));
      const before = out.results[out.results.indexOf(adr) - 1];
      assert.equal(before.path, join(dir, "docs/adr/0011-run-jobs-on-redis.md"));
      assert.equal(before.replaces, adr.ref);
      // Not in an ADR folder, the Status section is a paragraph like any other: past the first lines, no mark.
      const copy = out.results.find((r) => r.path === join(dir, "docs/notes/0003-run-jobs-on-postgres.md"));
      assert.equal(copy.anchor.superseded, undefined);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("[rl:local-search/reader-marks] a file carries the date and status its readers read, read again when it changes, and none of it is kept in the store", async () => {
    const base = mkdtempSync(join(tmpdir(), "genter-readers-"));
    const dir = join(base, "project");
    const home = join(base, "home");
    mkdirSync(join(dir, "docs/adr"), { recursive: true });
    writeFileSync(join(dir, "docs/adr/0003-run-jobs-on-postgres.md"), ADR_OLD);
    writeFileSync(join(dir, "docs/adr/0011-run-jobs-on-redis.md"), ADR_NEW);
    try {
      const g = createLocal({ home, secret: "s", cwd: dir });
      const first = await g.find("background jobs Redis streams", { limit: 1 });
      assert.deepEqual(first.results[0].anchor.document, { readers: ["adr"], date: "2026-09-24", status: "accepted" });
      writeFileSync(join(dir, "docs/adr/0011-run-jobs-on-redis.md"), ADR_NEW.replace("2026-09-24", "2026-10-02").replace("Accepted", "Proposed"));
      const again = await g.find("background jobs Redis streams", { limit: 1 });
      assert.deepEqual(again.results[0].anchor.document, { readers: ["adr"], date: "2026-10-02", status: "proposed" });
      const store = cipher("s:default:local").open(JSON.parse(readFileSync(join(home, "local.json"), "utf8")).blob);
      assert.ok(Object.values(store.anchors).every((a) => !("document" in a)));
      assert.ok(!JSON.stringify(store).includes("proposed"));
      // A file no reader reads has no document.
      writeFileSync(join(dir, "plain.txt"), "Background jobs and Redis streams, in plain words.\n");
      const plain = await g.find("plain words background jobs Redis streams", { limit: 1 });
      assert.equal(plain.results[0].anchor.document, undefined);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("[rl:local-search/reader-marks] a store made before the readers shows their marks, and the language rules', without the files being edited", async () => {
    const base = mkdtempSync(join(tmpdir(), "genter-readers-"));
    const dir = join(base, "project");
    const home = join(base, "home");
    mkdirSync(join(dir, "docs/adr"), { recursive: true });
    writeFileSync(join(dir, "docs/adr/0003-run-jobs-on-postgres.md"), ADR_OLD);
    writeFileSync(join(dir, "docs/adr/0011-run-jobs-on-redis.md"), ADR_NEW);
    writeFileSync(join(dir, "regulations.md"), "# Регламент выгрузок\n\nУстарело: см. [новый регламент](https://example.com/new)\n\nВыгрузки идут в конце месяца.\n");
    try {
      const q = "background jobs run on Postgres SKIP LOCKED";
      await createLocal({ home, secret: "s", cwd: dir }).find(q, { limit: 3 });
      // The store as a version before readers kept it: the same digests, no mark from a reader or from "устарело".
      const box = cipher("s:default:local");
      const file = join(home, "local.json");
      const store = box.open(JSON.parse(readFileSync(file, "utf8")).blob);
      for (const a of Object.values(store.anchors)) delete a.superseded;
      writeFileSync(file, JSON.stringify({ v: 1, blob: box.seal(store) }));
      const g = createLocal({ home, secret: "s", cwd: dir });
      const out = await g.find(q, { limit: 3 });
      const adr = out.results.find((r) => r.path === join(dir, "docs/adr/0003-run-jobs-on-postgres.md"));
      assert.deepEqual(adr.anchor.superseded, { marker: "superseded", line: 9, reader: "adr", by: join(dir, "docs/adr/0011-run-jobs-on-redis.md") });
      assert.equal(out.results[out.results.indexOf(adr) - 1].replaces, adr.ref);
      const ru = await g.find("регламент выгрузок конце месяца", { limit: 1 });
      assert.equal(ru.results[0].anchor.superseded?.marker, "устарел");
      // and the store keeps what it found, so the next look starts from it.
      const kept = box.open(JSON.parse(readFileSync(file, "utf8")).blob);
      assert.ok(Object.values(kept.anchors).some((a) => a.superseded?.reader === "adr"));
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("[rl:local-search/reader-marks] [rl:anchor-drift/mark-link] a reader's mark that names no place there has none: a link at the file's top is not what replaces it", async () => {
    const base = mkdtempSync(join(tmpdir(), "genter-readers-"));
    const dir = join(base, "project");
    const files = {
      "docs/adr/0005-cache-sessions-in-memcached.md": "# 5. Cache sessions in Memcached\n\nDate: 2026-02-01\nTechnical story: [month-end load](../stories/month-end-load.md)\n\n## Status\n\nDeprecated\n\n## Decision\n\nSessions are cached in Memcached with a one hour expiry.\n",
      "docs/adr/0006-queue-exports.md": "# 6. Queue exports\n\nDate: 2026-02-02\nTechnical story: [month-end load](../stories/month-end-load.md)\n\n## Status\n\nSuperseded by [9. Stream exports](0009-stream-exports.md)\n\n## Decision\n\nExports wait in a queue until the night run.\n",
      "docs/stories/month-end-load.md": "# Month-end load\n\nAt month end the export job and sessions compete for memory. Sessions cached expiry hour, exports queue night.\n",
    };
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    try {
      const g = createLocal({ home: join(base, "home"), secret: "s", cwd: dir });
      const out = await g.find("sessions cached in Memcached one hour expiry", { limit: 3 });
      const adr = out.results.find((r) => r.path === join(dir, "docs/adr/0005-cache-sessions-in-memcached.md"));
      assert.deepEqual(adr.anchor.superseded, { marker: "deprecated", line: 8, reader: "adr" });
      assert.ok(adr.facts.includes('docs/adr/0005-cache-sessions-in-memcached.md says at line 8: "Deprecated"'), adr.facts.join(" | "));
      assert.ok(out.results.every((r) => r.replaces === undefined));
      // Its own link, to a file that is not there, is no replacement either.
      const queued = await g.find("exports wait in a queue until the night run", { limit: 3 });
      const six = queued.results.find((r) => r.path === join(dir, "docs/adr/0006-queue-exports.md"));
      assert.deepEqual(six.anchor.superseded, { marker: "superseded", line: 8, reader: "adr" });
      assert.ok(queued.results.every((r) => r.replaces === undefined));
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("[rl:local-search/reader-marks] a link with a % that is no escape, where a reader marks, is taken as written and never stops a search", async () => {
    const base = mkdtempSync(join(tmpdir(), "genter-readers-"));
    const dir = join(base, "project");
    mkdirSync(join(dir, "docs/adr"), { recursive: true });
    writeFileSync(join(dir, "docs/adr/0003-x.md"), "# 3. Run jobs on Postgres\n\nDate: 2026-03-03\n\nSome context line one.\n\nSome context line two.\n\n## Status\n\nSuperseded by [11. Redis at 100%](0011-redis-100%.md)\n\n## Decision\n\nJobs run on Postgres.\n");
    writeFileSync(join(dir, "docs/adr/0004-y.md"), "# 4. Keep logs\n\n> Deprecated: replaced by [v2](v2-100%.md)\n\nLogs are kept on Postgres for jobs.\n");
    try {
      const g = createLocal({ home: join(base, "home"), secret: "s", cwd: dir });
      const out = await g.find("jobs run on Postgres", { limit: 5 });
      const three = out.results.find((r) => r.path === join(dir, "docs/adr/0003-x.md"));
      assert.deepEqual(three.anchor.superseded, { marker: "superseded", line: 11, reader: "adr" });
      writeFileSync(join(dir, "docs/adr/0011-redis-100%.md"), "# 11. Run jobs on Redis\n\nJobs run on Redis.\n");
      const again = await g.find("jobs run on Postgres", { limit: 5 });
      assert.equal(again.results.find((r) => r.path === join(dir, "docs/adr/0003-x.md")).anchor.superseded.by, join(dir, "docs/adr/0011-redis-100%.md"));
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("dates as documents write them, and only real days", () => {
    assert.equal(isoDate("2026-03-03"), "2026-03-03");
    assert.equal(isoDate("2026/3/3"), "2026-03-03");
    assert.equal(isoDate("03.03.2026"), "2026-03-03");
    assert.equal(isoDate("05-Jul-2021"), "2021-07-05");
    assert.equal(isoDate("3 March 2026"), "2026-03-03");
    assert.equal(isoDate("March 3, 2026"), "2026-03-03");
    for (const bad of ["2026-02-30", "2026-13-01", "1969-12-31", "soon", "", "20260303"]) assert.equal(isoDate(bad), null, bad);
  });
});

describe("genter reader", () => {
  it("[rl:cli/reader-commands] [rl:readers/ac-reader] genter reader new makes a reader that genter reader check passes once its owner is set, never over one that is there; check says each problem and exits 1", () => {
    const cwd = mkdtempSync(join(tmpdir(), "genter-reader-cli-"));
    try {
      assert.match(genter(["reader", "check"], cwd).stderr, /No readers\/ folder here/);
      const made = genter(["reader", "new", "sample"], cwd);
      assert.equal(made.status, 0, made.stderr);
      assert.match(made.stdout, /Made readers\/sample\/: reader\.json, fixtures\/docs\/sample\/0001-first-way\.md, fixtures\/docs\/sample\/0002-second-way\.md, expected\.json/);
      // Its owner is a placeholder until it is set.
      const file = join(cwd, "readers/sample/reader.json");
      const unowned = genter(["reader", "check"], cwd);
      assert.equal(unowned.status, 1);
      assert.match(unowned.stderr, /sample: reader\.json: owner: set it to your GitHub handle/);
      writeFileSync(file, readFileSync(file, "utf8").replace("@your-github-handle", "@sample-owner"));
      const checked = genter(["reader", "check"], cwd);
      assert.equal(checked.status, 0, checked.stderr);
      assert.equal(checked.stdout, "ok sample: 2 fixtures\n");
      const again = genter(["reader", "new", "sample"], cwd);
      assert.equal(again.status, 1);
      assert.match(again.stderr, /readers\/sample is there already/);
      assert.equal(genter(["reader", "new", "Bad_Name"], cwd).status, 1);
      assert.equal(genter(["reader", "new"], cwd).status, 1);
      // A broken manifest, and a fixture that no longer gives what expected.json says.
      const m = JSON.parse(readFileSync(file, "utf8"));
      writeFileSync(file, JSON.stringify({ ...m, url: "https://example.com/reader" }));
      const bad = genter(["reader", "check", "readers/sample"], cwd);
      assert.equal(bad.status, 1);
      assert.match(bad.stderr, /sample: reader\.json: url: no network field/);
      writeFileSync(file, JSON.stringify({ ...m, fields: { ...m.fields, status: [{ in: "top", pattern: "^status: (a+)+" }] } }));
      const catastrophic = genter(["reader", "check", "readers/sample"], cwd);
      assert.equal(catastrophic.status, 1);
      assert.match(catastrophic.stderr, /sample: reader\.json: fields\.status\[0\]\.pattern: an unbounded repeat \+ .*, at 11/);
      writeFileSync(file, JSON.stringify(m));
      writeFileSync(join(cwd, "readers/sample/fixtures/docs/sample/0002-second-way.md"), "# Use the second way\n\nDate: 2026-06-02\nStatus: accepted\n");
      const drifted = genter(["reader", "check"], cwd);
      assert.equal(drifted.status, 1);
      assert.match(drifted.stderr, /fixtures\/docs\/sample\/0002-second-way\.md: gives .*2026-06-02.*expected\.json says .*2026-06-01/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("[rl:readers/contract-tested] genter reader check passes on this repository's readers and rules, as CI runs it", () => {
    const out = spawnSync(process.execPath, [bin, "reader", "check"], { cwd: root, encoding: "utf8" });
    assert.equal(out.status, 0, out.stderr);
    for (const name of NAMES) assert.match(out.stdout, new RegExp(`^ok ${name}: \\d+ fixtures$`, "m"));
    assert.match(out.stdout, /^ok rules: en\.json, ru\.json$/m);
  });
});

describe("the package", () => {
  it("src/ finds its own files from its path, never by new URL(<relative>, import.meta.url), which a bundler of genter-cli/local takes for a file it cannot find", () => {
    const files = readdirSync(join(root, "src"), { recursive: true }).filter((f) => f.endsWith(".js"));
    assert.ok(files.includes("readers.js"));
    for (const f of files) assert.doesNotMatch(readFileSync(join(root, "src", f), "utf8"), /new URL\(\s*["'`][^"'`]*["'`]\s*,\s*import\.meta\.url/, f);
  });
});
