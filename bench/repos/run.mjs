// The 50-repository gate (step 1.10 of Genter's open-source plan): the readers (src/readers.js and the six in readers/)
// over 50 public repositories that keep decision records or deprecation notices, each at a pinned commit, and per
// repository how many decision records they find, how many documents say of themselves that they are replaced, and how
// many documents carry a date of their own. The gate passes when the median repository has 5 or more decision records
// and 15 of the 50 have an explicit replaced mark.
//   node bench/repos/run.mjs --pick     checks candidates.json at each repository's HEAD and writes repos.json: the
//                                       first `take` of each group that pass its check, with the commit they were at
//   node bench/repos/run.mjs            the readers over repos.json's commits: results/<date>.json and RESULTS.md
//   --cache <dir>                       where the checkouts are kept (default: <tmp>/genter-bench-repos)
//   --from <results.json>               writes RESULTS.md again from a run's numbers (no network)
// A checkout is shallow and holds only the files a reader can take (sparse: text documents, kep.yaml, changelogs), from
// https://github.com/<owner>/<name>; nothing in it is ever run (git's symlinks off; the readers read text).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { LIMITS, listFolder, readable } from "../../src/local.js";
import { loadReaders, readDocument } from "../../src/readers.js";

const here = dirname(fileURLToPath(import.meta.url));
const version = JSON.parse(readFileSync(join(here, "..", "..", "package.json"), "utf8")).version;
export const GATE = { records: 5, marked: 15 }; // the median repository's decision records; repositories with a replaced mark
// The readers that read a decision record: an ADR, an RFC, PEP or KEP (their files), and each entry of a decision log.
const RECORD_READERS = new Set(["adr", "rfc"]);
const LOG_READERS = new Set(["decisions"]);
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

// The repository's files a reader can take, at `commit` (else at its HEAD): { dir, commit, committed, tree }.
// A name is owner/name and a commit a full hash, so neither can reach git as an option.
export function checkout(cache, repo, commit) {
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
  git(dir, ["sparse-checkout", "set", "--no-cone", ...SPARSE]);
  git(dir, ["checkout", "-q", "--detach", want]);
  const tree = git(dir, ["ls-tree", "-r", "-z", "--name-only", want]).split("\0").filter(Boolean);
  return { dir, commit: want, committed: git(dir, ["show", "-s", "--format=%cI", want]).trim(), tree };
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

// A file's whole text for a group's check, whatever its size ("" when it cannot be read).
function readOr(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

// A mark's place, as the engine resolves it (local.js localLink): a relative link to a file that is there, from the
// marked document's folder and inside the repository; null for an address or a place that is not there.
function placeOf(dir, rel, by) {
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
    const placed = marks.map((m) => ({ m, place: placeOf(dir, rel, m.by) })).find((x) => x.place && x.place !== rel);
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
    with_marks: marked,
    with_kind: Object.fromEntries(KINDS.map((k) => [k, ran.filter((r) => withKind(r, new Set([k]))).length])),
    with_replaced: ran.filter((r) => withKind(r, REPLACED)).length,
    with_placed_marks: placed,
    passes: ran.length === rows.length && records >= GATE.records && marked >= GATE.marked,
    records_ok: records >= GATE.records,
    marks_ok: marked >= GATE.marked,
    by_group: Object.fromEntries(Object.entries(groups).map(([g, rs]) => [g, { repos: rs.length, median_records: median(rs.map((r) => r.records)), median_present: median(rs.map((r) => r.present ?? 0)), with_marks: rs.filter((r) => r.marked > 0).length, with_placed_marks: rs.filter((r) => r.placed > 0).length }])),
    picks,
  };
}

const n = (x) => (x == null ? "–" : String(x));

// The marked documents of a picked archive that only a fallback reader marked (a status line or a banner, no record's
// own status field), each with its first mark quoted: Genter applies a mark to its whole document, so a line that
// supersedes a part of one marks all of it.
function picksRead(results) {
  const out = [];
  for (const repo of results.verdict.picks) {
    const r = results.repos.find((x) => x.repo === repo);
    const byDoc = new Map();
    for (const m of r?.marks ?? []) byDoc.set(m.doc, [...(byDoc.get(m.doc) ?? []), m]);
    const loose = [...byDoc.values()].filter((ms) => !ms.some((m) => RECORD_READERS.has(m.reader) || LOG_READERS.has(m.reader))).map((ms) => ms[0]);
    if (!loose.length) continue;
    out.push(`* **${repo}**: ${loose.length} of its ${byDoc.size} marked documents were marked by a fallback reader alone, not by a record's own status: ${loose.map((m) => `[${m.doc}](https://github.com/${repo}/blob/${r.commit}/${m.doc}#L${m.line}) (${m.reader}, ${m.kind}) "${m.quote}"`).join("; ")}. Genter applies each mark to its whole document, so a line that supersedes only a part of one marks all of it; a launch page built on these marks waits for the owner's review of each.`);
  }
  return out.length ? [...out, ""] : [];
}
export function resultsMd(results) {
  const v = results.verdict;
  const groups = Object.fromEntries(results.groups.map((g) => [g.id, g]));
  const lines = [
    `# 50 repositories: what the readers find`,
    "",
    `Written by \`node bench/repos/run.mjs\` on ${results.date} with genter-cli ${results.version} and the readers ${results.readers.join(", ")}. The method is in [README.md](README.md); the numbers are in [${results.file}](${results.file}).`,
    "",
    "## The gate",
    "",
    `**${v.passes ? "Passes" : "Does not pass"}.** The gate (step 1.10 of Genter's open-source plan) passes when the median repository has ${GATE.records} or more decision records and ${GATE.marked} of the 50 have an explicit replaced mark.`,
    "",
    `* The median repository has **${n(v.median_records)}** decision records the readers read (${v.records_ok ? "at least" : "below"} ${GATE.records}). The records are there: by each group's own pattern for its records (candidates.json), whatever their format, the median repository holds ${n(v.median_present)} (the changelog group holds none by definition); the readers as shipped take few of their formats (below).`,
    `* **${v.with_marks} of ${v.repos}** have at least one document that carries a mark the readers read (${v.marks_ok ? "at least" : "below"} ${GATE.marked}); in ${v.with_placed_marks} of them a mark names a replacing document that is in the repository (where Genter puts the current answer first).`,
    ...(v.with_kind
      ? [
          `* The gate counts a mark of any kind, from any reader, the fallback ones (banners, front matter) included, as the readers read it: a heading or a sentence a fallback reader takes for a document's own mark counts too. By kind, the repositories with a mark: ${KINDS.filter((k) => v.with_kind[k]).map((k) => `${k} ${v.with_kind[k]}`).join(", ")}; with a superseded or moved mark (one that names a replacement or a new place) ${v.with_replaced}, ${v.with_replaced >= GATE.marked ? "at least" : "below"} ${GATE.marked}; with a superseded mark alone ${v.with_kind.superseded}, ${v.with_kind.superseded >= GATE.marked ? "at least" : "below"} ${GATE.marked}.`,
        ]
      : []),
    ...(v.ran < v.repos ? [`* ${v.repos - v.ran} repositories could not be read: ${results.repos.filter((r) => r.error).map((r) => `${r.repo} (${r.error})`).join("; ")}.`] : []),
    "",
    "| group | repositories | median decision records read | median records in the tree | with a replaced mark | with a mark naming a document there |",
    "| -- | --: | --: | --: | --: | --: |",
    ...Object.entries(v.by_group).map(([g, x]) => `| ${groups[g]?.title ?? g} | ${x.repos} | ${x.median_records} | ${g === "changelogs" ? "–" : x.median_present} | ${x.with_marks} | ${x.with_placed_marks} |`),
    "",
    `**The three archives** for the launch pages and the old-answer test (bench/old-answer): ${v.picks.map((r) => `[${r}](https://github.com/${r})`).join(", ")}: among the repositories with ${GATE.records} or more decision records, the most documents whose mark names a replacing document that is there, then the most that name what replaces them, then the most marked.`,
    "",
    ...picksRead(results),
    "## Per repository",
    "",
    "Decision records: documents the adr or rfc reader reads a date, a status or a mark in, and entries of a decision log; in the tree: the files that match the group's own pattern for the repository's records (candidates.json), read or not. Replaced: documents that carry a mark the readers read (superseded, deprecated, obsolete, archived, moved, removed, unmaintained), from any reader; named: the mark names what replaces it; there: the replacing document it links is in the repository. Dated: documents a reader reads a date in. Changelog deprecations: entries' deprecated and removed items, not marks of a document.",
    "",
    "| repository | stars | commit | files read | decision records | in the tree | replaced | named | there | dated | changelog deprecations | readers that read something |",
    "| -- | --: | -- | --: | --: | --: | --: | --: | --: | --: | --: | -- |",
  ];
  for (const g of results.groups) {
    lines.push(`| **${g.title}** | | | | | | | | | | | |`);
    for (const r of results.repos.filter((x) => x.group === g.id)) {
      if (r.error) {
        lines.push(`| [${r.repo}](https://github.com/${r.repo}) | ${r.stars} | – | could not be read: ${r.error} | | | | | | | | |`);
        continue;
      }
      const readers = Object.entries(r.by_reader).sort((a, b) => b[1] - a[1]).map(([k, x]) => `${k} ${x}`).join(", ");
      const files = `${r.files}${r.complete ? "" : " (cut)"}${r.tree_readable > 5000 ? "¹" : ""}`;
      lines.push(`| [${r.repo}](https://github.com/${r.repo}) | ${r.stars} | [${r.commit.slice(0, 7)}](https://github.com/${r.repo}/tree/${r.commit}) ${r.committed.slice(0, 10)} | ${files} | ${r.records} | ${r.present ?? "–"} | ${r.marked} | ${r.named} | ${r.placed} | ${r.dated} | ${r.changelog_deprecations} | ${readers || "–"} |`);
    }
  }
  lines.push("", "¹ The repository holds more than 5,000 files the engine reads (code included); Genter reads the first 5,000 of a folder in name order, so on a whole clone it may not reach every document counted here.");
  const missed = results.repos.filter((r) => !r.error && r.present >= GATE.records && r.records < r.present / 2);
  lines.push("", "## What the readers miss", "", `${missed.length} repositories hold ${GATE.records} or more records in the tree that the readers read less than half of: their records are in a place or a form no reader in readers/ takes yet (a reader is data: readers/<name>/reader.json, outside harden's Sources).`, "");
  for (const r of missed) lines.push(`* **${r.repo}**: ${r.present} ${r.what ?? "records"} (\`${r.pattern}\`), ${r.records} read.`);
  const pairs = results.repos.flatMap((r) => (r.pairs ?? []).map((p) => ({ ...p, repo: r.repo, commit: r.commit })));
  lines.push("", "## Replaced documents whose mark names a replacing document there", "", `${pairs.length} in all; each links the replaced document at its commit, then the one its mark names.`, "");
  for (const r of results.repos.filter((x) => x.pairs?.length)) {
    lines.push(`* **${r.repo}** (${r.pairs.length}): ${r.pairs.slice(0, 12).map((p) => `[${p.replaced}](https://github.com/${r.repo}/blob/${r.commit}/${p.replaced}) → [${p.by}](https://github.com/${r.repo}/blob/${r.commit}/${p.by})`).join("; ")}${r.pairs.length > 12 ? `; and ${r.pairs.length - 12} more (results file)` : ""}`);
  }
  return `${lines.join("\n")}\n`;
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
    const picked = [];
    for (const g of candidates.groups) {
      let taken = 0;
      for (const c of g.candidates) {
        if (taken >= g.take) break;
        let why;
        let co;
        try {
          co = checkout(cache, c.repo);
          if (g.changelog) {
            const logs = co.tree.filter((p) => CHANGELOG.test(p)).filter((p) => /deprecat/i.test(readOr(join(co.dir, p))));
            if (!logs.length) why = "no changelog that says deprecat";
          } else if (!co.tree.some((p) => new RegExp(c.records).test(p))) why = `no ${c.what} (${c.records})`;
        } catch (e) {
          why = e.message;
        }
        console.log(`${g.id} ${c.repo}: ${why ? `skipped, ${why}` : `taken at ${co.commit.slice(0, 7)}`}`);
        if (why) continue;
        picked.push({ repo: c.repo, group: g.id, stars: c.stars, commit: co.commit, committed: co.committed });
        taken++;
      }
      if (taken < g.take) console.log(`${g.id}: only ${taken} of ${g.take} passed`);
    }
    writeFileSync(join(here, "repos.json"), `${JSON.stringify({ picked_on: new Date().toISOString().slice(0, 10), stars_on: candidates.stars_on, repos: picked }, null, 2)}\n`);
    console.log(`repos.json: ${picked.length} repositories`);
  } else {
    const { repos } = JSON.parse(readFileSync(join(here, "repos.json"), "utf8"));
    const { readers } = loadReaders();
    const rows = [];
    for (const r of repos) {
      const started = Date.now();
      try {
        const co = checkout(cache, r.repo, r.commit);
        const tree_readable = co.tree.filter((p) => !p.split("/").some((s) => s.startsWith(".")) && readable(basename(p))).length;
        const c = candidates.groups.flatMap((g) => g.candidates).find((x) => x.repo === r.repo);
        const present = c?.records ? co.tree.filter((p) => new RegExp(c.records).test(p)).length : null;
        rows.push({ ...r, committed: co.committed, tree_readable, present, ...(c?.records && { what: c.what, pattern: c.records }), ...countFolder(co.dir, { readers }) });
      } catch (e) {
        rows.push({ ...r, error: e.message.slice(0, 200) });
      }
      const x = rows.at(-1);
      console.log(`${r.repo}: ${x.error ? `error ${x.error}` : `${x.files} files, ${x.records} records, ${x.marked} replaced (${x.placed} there), ${x.dated} dated`} (${Date.now() - started} ms)`);
    }
    const date = new Date().toISOString().slice(0, 10);
    const file = `results/${date}.json`;
    const results = { date, version, file, readers: readers.map((r) => r.name), rule: candidates.rule, groups: candidates.groups.map((g) => ({ id: g.id, title: g.title, rule: g.rule, take: g.take })), gate: GATE, verdict: verdict(rows), repos: rows };
    mkdirSync(join(here, "results"), { recursive: true });
    writeFileSync(join(here, file), `${JSON.stringify(results, null, 2)}\n`);
    writeFileSync(join(here, "RESULTS.md"), resultsMd(results));
    console.log(`${file} and RESULTS.md written; the gate ${results.verdict.passes ? "passes" : "does not pass"}`);
  }
}
