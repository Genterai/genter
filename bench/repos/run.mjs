// The 50-repository gate (step 1.10 of Genter's open-source plan): the readers (src/readers.js and readers/) over two
// samples of 50 public repositories that keep decision records or deprecation notices, each at a pinned commit, and per
// repository how many decision records they find, how many documents say of themselves that they are replaced, and how
// many documents carry a date of their own. The gate passes when the median repository has 5 or more decision records
// and 15 repositories have an explicit replaced mark, and it is judged on the held-out sample: the first 50
// (repos.json) are the ones the readers were widened looking at; the held-out sample (heldout.json) was picked by the
// same rule from
// other repositories and committed before the readers ran on them.
//   node bench/repos/run.mjs --pick     checks candidates.json at each repository's HEAD and writes repos.json: the
//                                       first `take` of each group that pass its check, with the commit they were at
//   ... --pick --heldout                the same from candidates.json's held-out lists, none of repos.json's: heldout.json
//   node bench/repos/run.mjs            the readers over both samples' commits: results/<date>.json and RESULTS.md
//   --cache <dir>                       where the checkouts are kept (default: <tmp>/genter-bench-repos)
//   --out <results.json>                where the run's numbers go (default: results/<date>.json)
//   --before <results.json>             an earlier run of the first 50, shown beside this one (its readers, its counts)
//   --from <results.json>               writes RESULTS.md again from a run's numbers (no network)
// A checkout is shallow and holds only the files a reader can take (sparse: text documents, kep.yaml, changelogs), from
// https://github.com/<owner>/<name>; nothing in it is ever run (git's symlinks off; the readers read text).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { LIMITS, listFolder, readable } from "../../src/local.js";
import { findPlace, loadReaders, readDocument } from "../../src/readers.js";

const here = dirname(fileURLToPath(import.meta.url));
const version = JSON.parse(readFileSync(join(here, "..", "..", "package.json"), "utf8")).version;
export const GATE = { records: 5, marked: 15 }; // the median repository's decision records; repositories with a replaced mark
// The readers that read a decision record, as their manifests say (records: true): a document one of them reads a date,
// a status or a mark in (an ADR, an RFC, a PEP, a proposal), and each entry of one that reads entries (a decision log).
export function recordReaders(readers = loadReaders().readers) {
  return { docs: new Set(readers.filter((r) => r.records && !r.entries).map((r) => r.name)), logs: new Set(readers.filter((r) => r.records && r.entries).map((r) => r.name)) };
}
// The kinds of mark a reader gives a document; superseded and moved name a replacement or a new place.
const KINDS = ["superseded", "moved", "deprecated", "obsolete", "archived", "removed", "unmaintained"];
const REPLACED = new Set(["superseded", "moved"]);
const SPARSE = ["/.gitignore", "*.md", "*.mdx", "*.markdown", "*.txt", "*.rst", "*.adoc", "kep.yaml", ...["CHANGELOG", "Changelog", "changelog", "CHANGES", "Changes", "changes", "HISTORY", "History", "history", "RELEASES", "Releases", "releases"].map((n) => `${n}*`)];
const CHANGELOG = /(^|\/)(changelog|changes|history|releases)(\.[a-z0-9]+)?$/i;

function git(cwd, args) {
  const out = spawnSync("git", ["-c", "core.symlinks=false", "-c", "advice.detachedHead=false", "-c", "core.hooksPath=/dev/null", ...args], { cwd, encoding: "utf8", timeout: 900_000, maxBuffer: 1 << 29 });
  if (out.status !== 0) throw new Error(`git ${args.slice(0, 2).join(" ")} in ${cwd}: ${(out.stderr || out.error?.message || "").trim().slice(0, 300)}`);
  return out.stdout;
}

// The repository's tree at `commit` (else at its HEAD), its files' names only, nothing checked out: { dir, commit,
// committed, tree }. A name is owner/name and a commit a full hash, so neither can reach git as an option.
export function treeOf(cache, repo, commit) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || repo.includes("..")) throw new Error(`not a repository's owner/name: ${repo}`);
  if (commit !== undefined && !/^[0-9a-f]{40}$/.test(commit)) throw new Error(`not a commit: ${commit}`);
  const dir = join(cache, repo.replace("/", "__"));
  if (!existsSync(join(dir, ".git"))) {
    mkdirSync(cache, { recursive: true });
    git(cache, ["clone", "-q", "--depth", "1", "--filter=blob:none", "--no-checkout", `https://github.com/${repo}.git`, dir]);
  }
  // No commit: the default branch's tip, fetched now.
  let want = commit;
  if (!want) {
    git(dir, ["fetch", "-q", "--depth", "1", "--filter=blob:none", "origin", "HEAD"]);
    want = git(dir, ["rev-parse", "FETCH_HEAD^{commit}"]).trim();
  }
  if (spawnSync("git", ["cat-file", "-e", `${want}^{commit}`], { cwd: dir }).status !== 0) git(dir, ["fetch", "-q", "--depth", "1", "--filter=blob:none", "origin", want]);
  const tree = git(dir, ["ls-tree", "-r", "-z", "--name-only", want]).split("\0").filter(Boolean);
  return { dir, commit: want, committed: git(dir, ["show", "-s", "--format=%cI", want]).trim(), tree };
}

// The repository's files a reader can take, checked out at `commit` (else at its HEAD): treeOf's { dir, commit,
// committed, tree }.
export function checkout(cache, repo, commit) {
  const co = treeOf(cache, repo, commit);
  git(co.dir, ["sparse-checkout", "set", "--no-cone", ...SPARSE]);
  git(co.dir, ["checkout", "-q", "--detach", co.commit]);
  return co;
}

// A file's text as the engine reads it (local.js readText): none over its size limit, binary or holding a private key.
// The old-answer test reads its files with this too.
const PRIVATE_KEY = /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY/;
export function textOf(path) {
  try {
    if (statSync(path).size > LIMITS.fileBytes) return null;
    const buf = readFileSync(path);
    if (buf.subarray(0, 8000).includes(0)) return null;
    const text = buf.toString("utf8");
    return PRIVATE_KEY.test(text) ? null : text;
  } catch {
    return null;
  }
}

// A file's whole text at a commit, for a group's check, whatever its size ("" when it cannot be read): the one blob
// fetched, nothing checked out. The path comes from the commit's own tree.
function readAt(dir, commit, path) {
  const out = spawnSync("git", ["cat-file", "blob", `${commit}:${path}`], { cwd: dir, encoding: "utf8", timeout: 300_000, maxBuffer: 1 << 28 });
  return out.status === 0 ? out.stdout : "";
}

// A mark's place, as the engine resolves it: a relative link to a file that is there, from the marked document's folder
// and inside the repository (local.js localLink), else the file its id names (readers.js findPlace, over the files the
// engine reads in that folder); null for an address or a place that is not there.
function placeOf(dir, rel, m) {
  return linkOf(dir, rel, m.by) ?? (m.place ? findPlace(rel, m.place, (folder) => namesIn(join(dir, ...folder.split("/").filter(Boolean)))) : null);
}
function namesIn(folder) {
  try {
    return readdirSync(folder, { withFileTypes: true }).filter((e) => e.isFile() && readable(e.name)).map((e) => e.name);
  } catch {
    return [];
  }
}
function linkOf(dir, rel, by) {
  if (!by || /^[a-z][a-z0-9+.-]*:/i.test(by)) return null;
  let clean = by.replace(/[#?].*$/, "");
  try {
    clean = decodeURIComponent(clean);
  } catch {}
  if (!clean) return null;
  const target = resolve(dir, dirname(rel), clean);
  const out = relative(dir, target).split(sep).join("/");
  if (!out || out.startsWith("..")) return null;
  try {
    return statSync(target).isFile() ? out : null;
  } catch {
    return null;
  }
}

// What the readers read in a folder (a repository's checkout): the counts the gate is made of, the documents per kind of
// mark, every mark read (its document, kind, reader, line and quote), and the pairs of a replaced document and the
// document its mark names as what replaces it.
export function countFolder(dir, { readers = loadReaders().readers } = {}) {
  const { docs: RECORD_READERS, logs: LOG_READERS } = recordReaders(readers);
  const { files, complete } = listFolder(dir);
  const out = { files: files.length, complete, records: 0, dated: 0, marked: 0, superseded: 0, named: 0, placed: 0, changelog_deprecations: 0, by_reader: {}, by_kind: {}, marks: [], pairs: [] };
  for (const path of files) {
    const rel = relative(dir, path).split(sep).join("/");
    const text = textOf(path);
    if (text == null) continue;
    const got = readDocument(rel, text, { readers });
    if (!got) continue;
    for (const r of got.readers) out.by_reader[r] = (out.by_reader[r] ?? 0) + 1;
    if (got.readers.some((r) => RECORD_READERS.has(r))) out.records++;
    out.records += (got.entries ?? []).filter((e) => LOG_READERS.has(e.reader)).length;
    if (got.date) out.dated++;
    for (const e of got.entries ?? []) if (e.reader === "changelog") out.changelog_deprecations += (e.marks ?? []).length;
    const marks = got.marks ?? [];
    if (!marks.length) continue;
    out.marked++;
    if (marks.some((m) => m.kind === "superseded")) out.superseded++;
    for (const k of new Set(marks.map((m) => m.kind))) out.by_kind[k] = (out.by_kind[k] ?? 0) + 1;
    for (const m of marks) out.marks.push({ doc: rel, kind: m.kind, reader: m.reader, line: m.line, quote: m.quote });
    if (marks.some((m) => m.by || m.name)) out.named++;
    const placed = marks.map((m) => ({ m, place: placeOf(dir, rel, m) })).find((x) => x.place && x.place !== rel);
    if (placed) {
      out.placed++;
      out.pairs.push({ replaced: rel, by: placed.place, kind: placed.m.kind, reader: placed.m.reader, line: placed.m.line, quote: placed.m.quote });
    }
  }
  return out;
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};

// The gate and the three archives for the launch pages and the old-answer test: among the repositories with 5 or more
// decision records, the most documents whose mark names a replacing document that is there, then the most whose mark
// names what replaces them, then the most marked, then the most stars.
export function verdict(rows) {
  const ran = rows.filter((r) => !r.error);
  const records = median(ran.map((r) => r.records));
  const marked = ran.filter((r) => r.marked > 0).length;
  const placed = ran.filter((r) => r.placed > 0).length;
  const present = median(ran.map((r) => r.present ?? 0));
  const withKind = (r, kinds) => Object.keys(r.by_kind ?? {}).some((k) => kinds.has(k));
  const picks = ran
    .filter((r) => r.records >= GATE.records)
    .sort((a, b) => b.placed - a.placed || b.named - a.named || b.marked - a.marked || b.stars - a.stars)
    .slice(0, 3)
    .map((r) => r.repo);
  const groups = {};
  for (const r of ran) (groups[r.group] ??= []).push(r);
  return {
    repos: rows.length,
    ran: ran.length,
    median_records: records,
    median_present: present,
    with_records: ran.filter((r) => r.records >= GATE.records).length,
    with_marks: marked,
    with_kind: Object.fromEntries(KINDS.map((k) => [k, ran.filter((r) => withKind(r, new Set([k]))).length])),
    with_replaced: ran.filter((r) => withKind(r, REPLACED)).length,
    with_placed_marks: placed,
    passes: ran.length === rows.length && records >= GATE.records && marked >= GATE.marked,
    records_ok: records >= GATE.records,
    marks_ok: marked >= GATE.marked,
    by_group: Object.fromEntries(Object.entries(groups).map(([g, rs]) => [g, { repos: rs.length, median_records: median(rs.map((r) => r.records)), median_present: median(rs.map((r) => r.present ?? 0)), with_records: rs.filter((r) => r.records >= GATE.records).length, with_marks: rs.filter((r) => r.marked > 0).length, with_placed_marks: rs.filter((r) => r.placed > 0).length }])),
    picks,
  };
}

const n = (x) => (x == null ? "–" : String(x));
const SAMPLES = { heldout: { title: "the held-out sample", list: "heldout.json" }, first: { title: "the first 50", list: "repos.json" } };

// The marked documents of a picked archive that only a fallback reader marked (a status line or a banner, no record's
// own status field), each with its first mark quoted: Genter applies a mark to its whole document, so a line that
// supersedes a part of one marks all of it.
function picksRead(sample, records) {
  const out = [];
  for (const repo of sample.verdict.picks) {
    const r = sample.repos.find((x) => x.repo === repo);
    const byDoc = new Map();
    for (const m of r?.marks ?? []) byDoc.set(m.doc, [...(byDoc.get(m.doc) ?? []), m]);
    const loose = [...byDoc.values()].filter((ms) => !ms.some((m) => records.has(m.reader))).map((ms) => ms[0]);
    if (!loose.length) continue;
    out.push(`* **${repo}**: ${loose.length} of its ${byDoc.size} marked documents were marked by a fallback reader alone, not by a record's own status: ${loose.slice(0, 6).map((m) => `[${m.doc}](https://github.com/${repo}/blob/${r.commit}/${m.doc}#L${m.line}) (${m.reader}, ${m.kind}) "${m.quote}"`).join("; ")}${loose.length > 6 ? `; and ${loose.length - 6} more (results file)` : ""}. Genter applies each mark to its whole document, so a line that supersedes only a part of one marks all of it; a launch page built on these marks waits for the owner's review of each.`);
  }
  return out.length ? [...out, ""] : [];
}

// The gate's lines for one sample: the median, the marks, the marks by kind, what could not be read, and the groups.
function gateLines(sample, groups) {
  const v = sample.verdict;
  return [
    `* The median repository has **${n(v.median_records)}** decision records the readers read (${v.records_ok ? "at least" : "below"} ${GATE.records}); ${v.with_records} of the ${v.repos} have ${GATE.records} or more read, and the median needs half of them to. By each group's own pattern for its records (candidates.json), whatever their format, the median repository holds ${n(v.median_present)} (the changelog group holds none by definition).`,
    `* **${v.with_marks} of ${v.repos}** have at least one document that carries a mark the readers read (${v.marks_ok ? "at least" : "below"} ${GATE.marked}); in ${v.with_placed_marks} of them a mark names a replacing document that is in the repository (where Genter puts the current answer first).`,
    `* The gate counts a mark of any kind, from any reader, the fallback ones (banners, front matter) included, as the readers read it: a heading or a sentence a fallback reader takes for a document's own mark counts too. By kind, the repositories with a mark: ${KINDS.filter((k) => v.with_kind[k]).map((k) => `${k} ${v.with_kind[k]}`).join(", ") || "none"}; with a superseded or moved mark (one that names a replacement or a new place) ${v.with_replaced}, ${v.with_replaced >= GATE.marked ? "at least" : "below"} ${GATE.marked}; with a superseded mark alone ${v.with_kind.superseded}, ${v.with_kind.superseded >= GATE.marked ? "at least" : "below"} ${GATE.marked}.`,
    ...(v.ran < v.repos ? [`* ${v.repos - v.ran} repositories could not be read: ${sample.repos.filter((r) => r.error).map((r) => `${r.repo} (${r.error})`).join("; ")}.`] : []),
    "",
    "| group | repositories | median decision records read | median records in the tree | with 5 or more read | with a replaced mark | with a mark naming a document there |",
    "| -- | --: | --: | --: | --: | --: | --: |",
    ...Object.entries(v.by_group).map(([g, x]) => `| ${groups[g]?.title ?? g} | ${x.repos} | ${x.median_records} | ${g === "changelogs" ? "–" : x.median_present} | ${x.with_records} | ${x.with_marks} | ${x.with_placed_marks} |`),
    "",
  ];
}

// One sample's table, a row per repository; `before`: an earlier run's decision records per repository, when given.
function tableLines(sample, groups, before) {
  const was = new Map((before?.repos ?? []).map((r) => [r.repo, r]));
  const extra = before ? " | decision records before" : "";
  const lines = [
    `| repository | stars | commit | files read | decision records${extra} | in the tree | replaced | named | there | dated | changelog deprecations | readers that read something |`,
    `| -- | --: | -- | --: | --: | --: | --: | --: | --: | --: | --: |${before ? " --: |" : ""} -- |`,
  ];
  const cols = 12 + (before ? 1 : 0);
  for (const g of groups) {
    const rows = sample.repos.filter((x) => x.group === g.id);
    if (!rows.length) continue;
    lines.push(`| **${g.title}** |${" |".repeat(cols - 1)}`);
    for (const r of rows) {
      if (r.error) {
        lines.push(`| [${r.repo}](https://github.com/${r.repo}) | ${r.stars} | – | could not be read: ${r.error} |${" |".repeat(cols - 4)}`);
        continue;
      }
      const readers = Object.entries(r.by_reader).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([k, x]) => `${k} ${x}`).join(", ");
      const files = `${r.files}${r.complete ? "" : " (cut)"}${r.tree_readable > 5000 ? "¹" : ""}`;
      const then = before ? ` | ${n(was.get(r.repo)?.records)}` : "";
      lines.push(`| [${r.repo}](https://github.com/${r.repo}) | ${r.stars} | [${r.commit.slice(0, 7)}](https://github.com/${r.repo}/tree/${r.commit}) ${r.committed.slice(0, 10)} | ${files} | ${r.records}${then} | ${r.present ?? "–"} | ${r.marked} | ${r.named} | ${r.placed} | ${r.dated} | ${r.changelog_deprecations} | ${readers || "–"} |`);
    }
  }
  return [...lines, ""];
}

function missedLines(sample) {
  const missed = sample.repos.filter((r) => !r.error && r.present >= GATE.records && r.records < r.present / 2);
  return [`${missed.length} repositories hold ${GATE.records} or more records in the tree that the readers read less than half of: their records are in a place or a form no reader in readers/ takes yet, or carry no date, status or mark a reader reads (a reader is data: readers/<name>/reader.json, outside harden's Sources).`, "", ...missed.map((r) => `* **${r.repo}**: ${r.present} ${r.what ?? "records"} (\`${r.pattern}\`), ${r.records} read.`), ""];
}

function pairLines(sample) {
  const all = sample.repos.flatMap((r) => r.pairs ?? []);
  const lines = [`${all.length} in all; each links the replaced document at its commit, then the one its mark names.`, ""];
  for (const r of sample.repos.filter((x) => x.pairs?.length)) {
    lines.push(`* **${r.repo}** (${r.pairs.length}): ${r.pairs.slice(0, 12).map((p) => `[${p.replaced}](https://github.com/${r.repo}/blob/${r.commit}/${p.replaced}) → [${p.by}](https://github.com/${r.repo}/blob/${r.commit}/${p.by})`).join("; ")}${r.pairs.length > 12 ? `; and ${r.pairs.length - 12} more (results file)` : ""}`);
  }
  return [...lines, ""];
}

export function resultsMd(results) {
  const groups = Object.fromEntries(results.groups.map((g) => [g.id, g]));
  const sample = Object.fromEntries(results.samples.map((s) => [s.id, s]));
  const held = sample.heldout;
  const first = sample.first;
  const before = results.before;
  const records = new Set(results.record_readers);
  const v = held.verdict;
  const H = held.repos.length;
  // A group of the held-out sample that took fewer than its take: the sample is smaller than the first 50.
  const short = results.groups.filter((g) => (v.by_group[g.id]?.repos ?? 0) < g.take).map((g) => `${v.by_group[g.id]?.repos ?? 0} of the ${g.take} ${g.title.toLowerCase()} the rule takes`);
  const lines = [
    `# 50 repositories, and ${H} held out: what the readers find`,
    "",
    `Written by \`node bench/repos/run.mjs\` on ${results.date} with genter-cli ${results.version} and the readers ${results.readers.join(", ")} (those of decision records: ${results.record_readers.join(", ")}). The method is in [README.md](README.md); the numbers are in [${results.file}](${results.file}).`,
    "",
    `## The gate, on the ${H} held out`,
    "",
    `**${v.passes ? "Passes" : "Does not pass"}.** The gate (step 1.10 of Genter's open-source plan) passes when the median repository has ${GATE.records} or more decision records and ${GATE.marked} repositories have an explicit replaced mark. It is judged on the held-out sample ([${held.list}](${held.list}), picked on ${held.picked_on}): the same rule and groups as the first 50 (candidates.json), over repositories not among them, picked and committed before the readers ran on any of them. The first 50 are not a fair test any more: the readers were widened looking at them (below).${short.length ? ` The held-out sample holds ${H} repositories, not 50: only ${short.join(" and ")} passed the check outside the first 50 (candidates.json lists every one named, and those left out as not of the kind). The thresholds are applied as written: the median of the ${H}, and ${GATE.marked} repositories with a mark.` : ""}`,
    "",
    ...gateLines(held, groups),
    "## The first 50, after the readers were widened",
    "",
    `**${first.verdict.passes ? "Would pass" : "Would not pass"}** on the first 50 ([${first.list}](${first.list})), the repositories the readers were written for: a biased number, shown so the two can be compared.${before ? ` With the readers of [${before.file}](${before.file}) (${before.readers.join(", ")}), the median repository there had ${n(before.verdict.median_records)} decision records read, ${before.verdict.with_marks} of 50 a replaced mark and ${before.verdict.with_placed_marks} a mark naming a document there.` : ""}`,
    "",
    ...gateLines(first, groups),
    "## The three archives",
    "",
    `The old-answer test (bench/old-answer) keeps the three archives step 1.10 picked, at the commits it read them at: its questions are written per pair and wait for a person's review. With the readers as they are now, the same rule (among the repositories with ${GATE.records} or more decision records, the most documents whose mark names a replacing document that is there, then the most that name what replaces them, then the most marked, then the most stars) picks ${first.verdict.picks.map((r) => `[${r}](https://github.com/${r})`).join(", ") || "none"} among the first 50, and ${held.verdict.picks.map((r) => `[${r}](https://github.com/${r})`).join(", ") || "none"} among the held-out sample.`,
    "",
    ...picksRead(first, records),
    ...picksRead(held, records),
    "## Per repository",
    "",
    "Decision records: documents a reader of decision records (its manifest says `records: true`) reads a date, a status or a mark in, and entries of a decision log; in the tree: the files that match the group's own pattern for the repository's records (candidates.json), read or not. Replaced: documents that carry a mark the readers read (superseded, deprecated, obsolete, archived, moved, removed, unmaintained), from any reader; named: the mark names what replaces it; there: the replacing document it links, or its id names, is in the repository. Dated: documents a reader reads a date in. Changelog deprecations: entries' deprecated and removed items, not marks of a document.",
    "",
    `### The ${H} held out`,
    "",
    ...tableLines(held, results.groups),
    `### The first 50${before ? ", with the decision records step 1.10's readers read" : ""}`,
    "",
    ...tableLines(first, results.groups, before),
    "¹ The repository holds more than 5,000 files the engine reads (code included); Genter reads the first 5,000 of a folder in name order, so on a whole clone it may not reach every document counted here.",
    "",
    "## What the readers miss",
    "",
    `### The ${H} held out`,
    "",
    ...missedLines(held),
    "### The first 50",
    "",
    ...missedLines(first),
    "## Replaced documents whose mark names a replacing document there",
    "",
    `### The ${H} held out`,
    "",
    ...pairLines(held),
    "### The first 50",
    "",
    ...pairLines(first),
  ];
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

// The first `take` of each group that pass its check, from the candidates given, each pinned at the commit it was
// checked at, and every candidate checked and not taken, with why; `skip`: repositories never taken (the first 50, for
// the held-out sample), and none is taken twice. The check reads the tree's file names, and for a changelog the
// changelog files' text, never what a reader finds.
export function pick(cache, groups, skip = new Set(), { tree = treeOf, read = readAt } = {}) {
  const picked = [];
  const skipped = [];
  for (const g of groups) {
    let taken = 0;
    for (const c of g.candidates) {
      if (taken >= g.take) break;
      if (skip.has(c.repo) || picked.some((p) => p.repo === c.repo)) {
        const why = skip.has(c.repo) ? "in the first 50" : "taken by an earlier group";
        console.log(`${g.id} ${c.repo}: skipped, ${why}`);
        skipped.push({ repo: c.repo, group: g.id, why });
        continue;
      }
      let why;
      let co;
      try {
        co = tree(cache, c.repo);
        if (g.changelog) {
          const logs = co.tree.filter((p) => CHANGELOG.test(p));
          if (!logs.some((p) => /deprecat/i.test(read(co.dir, co.commit, p)))) why = "no changelog that says deprecat";
        } else if (!co.tree.some((p) => new RegExp(c.records).test(p))) why = `no ${c.what} (${c.records})`;
      } catch (e) {
        why = e.message;
      }
      console.log(`${g.id} ${c.repo}: ${why ? `skipped, ${why}` : `taken at ${co.commit.slice(0, 7)}`}`);
      if (why) {
        skipped.push({ repo: c.repo, group: g.id, why: why.slice(0, 200) });
        continue;
      }
      picked.push({ repo: c.repo, group: g.id, stars: c.stars, commit: co.commit, committed: co.committed });
      taken++;
    }
    if (taken < g.take) console.log(`${g.id}: only ${taken} of ${g.take} passed`);
  }
  return { picked, skipped };
}

// One sample over its pinned commits: a row per repository.
function runSample(cache, list, candidates, readers) {
  const rows = [];
  const all = [...candidates.groups, ...(candidates.heldout?.groups ?? [])].flatMap((g) => g.candidates);
  for (const r of list) {
    const started = Date.now();
    try {
      const co = checkout(cache, r.repo, r.commit);
      const tree_readable = co.tree.filter((p) => !p.split("/").some((s) => s.startsWith(".")) && readable(basename(p))).length;
      const c = all.find((x) => x.repo === r.repo);
      const present = c?.records ? co.tree.filter((p) => new RegExp(c.records).test(p)).length : null;
      rows.push({ ...r, committed: co.committed, tree_readable, present, ...(c?.records && { what: c.what, pattern: c.records }), ...countFolder(co.dir, { readers }) });
    } catch (e) {
      rows.push({ ...r, error: e.message.slice(0, 200) });
    }
    const x = rows.at(-1);
    console.log(`${r.repo}: ${x.error ? `error ${x.error}` : `${x.files} files, ${x.records} records, ${x.marked} replaced (${x.placed} there), ${x.dated} dated`} (${Date.now() - started} ms)`);
  }
  return rows;
}

// ---- main ----

const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cache = option("--cache") ?? join(tmpdir(), "genter-bench-repos");
  const candidates = JSON.parse(readFileSync(join(here, "candidates.json"), "utf8"));
  const from = option("--from");
  if (from) {
    const results = JSON.parse(readFileSync(from, "utf8"));
    writeFileSync(join(here, "RESULTS.md"), resultsMd(results));
    console.log(`RESULTS.md written from ${from}`);
  } else if (args.includes("--pick")) {
    const heldout = args.includes("--heldout");
    const first = heldout ? JSON.parse(readFileSync(join(here, "repos.json"), "utf8")).repos : [];
    const groups = heldout ? candidates.heldout.groups.map((g) => ({ ...candidates.groups.find((x) => x.id === g.id), ...g })) : candidates.groups;
    const { picked, skipped } = pick(cache, groups, new Set(first.map((r) => r.repo)));
    const file = heldout ? "heldout.json" : "repos.json";
    writeFileSync(join(here, file), `${JSON.stringify({ picked_on: new Date().toISOString().slice(0, 10), stars_on: (heldout ? candidates.heldout : candidates).stars_on, repos: picked, skipped }, null, 2)}\n`);
    console.log(`${file}: ${picked.length} repositories`);
  } else {
    const { readers } = loadReaders();
    const { docs, logs } = recordReaders(readers);
    const samples = [];
    for (const id of ["heldout", "first"]) {
      const list = JSON.parse(readFileSync(join(here, SAMPLES[id].list), "utf8"));
      const rows = runSample(cache, list.repos, candidates, readers);
      samples.push({ id, ...SAMPLES[id], picked_on: list.picked_on, verdict: verdict(rows), repos: rows });
    }
    const date = new Date().toISOString().slice(0, 10);
    const out = option("--out") ? resolve(option("--out")) : join(here, "results", `${date}.json`);
    const file = relative(here, out).split(sep).join("/");
    const was = option("--before") && JSON.parse(readFileSync(option("--before"), "utf8"));
    const before = was && { file: relative(here, resolve(option("--before"))).split(sep).join("/"), date: was.date, version: was.version, readers: was.readers, verdict: was.verdict ?? was.samples?.find((s) => s.id === "first")?.verdict, repos: (was.repos ?? was.samples?.find((s) => s.id === "first")?.repos ?? []).map((r) => ({ repo: r.repo, group: r.group, records: r.records, marked: r.marked, placed: r.placed })) };
    const results = { date, version, file, readers: readers.map((r) => r.name), record_readers: [...docs, ...logs].sort(), rule: candidates.rule, heldout_rule: candidates.heldout?.rule, groups: candidates.groups.map((g) => ({ id: g.id, title: g.title, rule: g.rule, take: g.take })), gate: GATE, samples, ...(before && { before }) };
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
    writeFileSync(join(here, "RESULTS.md"), resultsMd(results));
    const v = samples[0].verdict;
    console.log(`${file} and RESULTS.md written; on the ${samples[0].repos.length} held out the gate ${v.passes ? "passes" : "does not pass"} (median ${v.median_records}, ${v.with_marks} with a mark); on the first 50: median ${samples[1].verdict.median_records}, ${samples[1].verdict.with_marks} with a mark`);
  }
}
