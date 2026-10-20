// The old-answer test (step 1.7 of Genter's open-source plan): for each pair of a document that says of itself that it
// is replaced and the document that replaces it, one question whose current answer lives in the replacing document,
// asked of two arms over the SAME sections of the same files:
//   plain    BM25 over the sections, what an agent's own grep or ranking finds: no marks, no reordering (the engine's
//            own sections, ranking and two sections per place at most, src/anchor.js pieces and src/lexical.js bm25)
//   genter   the local engine as shipped: createLocal().add(folder), then find(question) (src/local.js)
// counted per arm: "old answer first" (the first result is the replaced document) and "old answer unmarked in the first
// five" (a section of the replaced document among the first five, with no replaced mark on it), with every loss listed.
// Inputs: DriftBench's deprecated kind (bench/drift, the docs after its edits, offline) and the public archives of
// questions.json, each at the commit it names (fetched once with git into --cache, the same checkout as bench/repos).
// Usage: node bench/old-answer/run.mjs [--offline] [--cache dir] [--out results.json] [--md report.md] [--from results.json]
//          [--before results.json] [--guard]
// With no --out and no --md it writes results/<date>.json and RESULTS.md beside this file; with --offline it writes only
// what --out and --md name (the published files hold the archives too). --guard fails the run when Genter leaves the old
// answer unmarked in its first five or does worse than plain ranking on any question. --before names an earlier run,
// whose first results RESULTS.md shows beside this run's, question by question.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { pieces } from "../../src/anchor.js";
import { bm25, prepare } from "../../src/lexical.js";
import { createLocal, LIMITS, listFolder } from "../../src/local.js";
import { applyChanges } from "../drift/check.mjs";
import { checkout, textOf } from "../repos/run.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const drift = join(here, "..", "drift");
const version = JSON.parse(readFileSync(join(here, "..", "..", "package.json"), "utf8")).version;
export const K = 5;
export const LEAD = 0.9; // plain ranking puts the current answer first on this share or more: the local picture is not the lead
const rel = (dir, path) => relative(dir, path).split(sep).join("/");

// ---- the arms ----

// Plain ranking: the sections of every file the engine reads in the folder (its own listing and cut), ranked by BM25 as
// the engine ranks them, two sections per place at most; nothing marked, nothing moved. Per question: [{ place, marked }].
// The sections of a folder as the engine cuts them: [{ place, from, to, doc }] (from and to: lines, from 1).
export function sectionsOf(dir) {
  const sections = [];
  for (const path of listFolder(dir).files) {
    const text = textOf(path);
    if (text == null) continue;
    const place = rel(dir, path);
    const lineAt = (offset) => text.slice(0, offset).split("\n").length;
    for (const [start, end, headings] of pieces(path, text, { chunk: LIMITS.chunkChars })) {
      const body = text.slice(start, end);
      if (body.trim()) sections.push({ place, from: lineAt(start), to: lineAt(Math.max(start, end - 1)), doc: prepare({ head: `${basename(path)} ${headings.join(" ")}`, body }) });
    }
  }
  return sections;
}

export function plainArm(dir, questions, sections = sectionsOf(dir)) {
  return questions.map((q) => {
    const scores = bm25(q.question, sections.map((s) => s.doc));
    const order = sections.map((s, i) => [s, scores[i]]).filter(([, x]) => x > 0).sort((a, b) => b[1] - a[1]);
    const per = new Map();
    const out = [];
    for (const [s] of order) {
      const n = per.get(s.place) ?? 0;
      if (n >= LIMITS.perPlace) continue;
      per.set(s.place, n + 1);
      out.push({ place: s.place, marked: false });
      if (out.length >= K) break;
    }
    return out;
  });
}

// Genter: the folder added to a fresh store (no key, no notes, nothing switched off), then each question searched.
// { results: per question [{ place, marked, lines }], sections: how many sections the engine ranked (find's searched) }.
export async function genterArm(dir, questions) {
  const home = mkdtempSync(join(tmpdir(), "old-answer-home-"));
  try {
    const local = createLocal({ home, secret: "bench", cwd: dir });
    await local.add(dir);
    const results = [];
    let sections = 0;
    for (const q of questions) {
      const found = await local.find(q.question, { limit: K });
      sections = Math.max(sections, found.searched.sections);
      results.push(found.results.map((r) => ({ place: rel(dir, r.path ?? ""), marked: Boolean(r.superseded), lines: r.lines })));
    }
    return { results, sections };
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

// One question's counts from an arm's first five: old first, old unmarked in the first five, current first, current in
// the first five. A question's current answer may live in more than one document (current: a list).
const currents = (q) => [].concat(q.current);
export function score(results, q) {
  const top = results.slice(0, K);
  return {
    old_first: top[0]?.place === q.replaced,
    old_unmarked: top.some((r) => r.place === q.replaced && !r.marked),
    current_first: currents(q).includes(top[0]?.place),
    current_top5: top.some((r) => currents(q).includes(r.place)),
  };
}

export function tally(rows) {
  const t = { n: rows.length, old_first: 0, old_unmarked: 0, current_first: 0, current_top5: 0 };
  for (const r of rows) for (const k of ["old_first", "old_unmarked", "current_first", "current_top5"]) if (r[k]) t[k]++;
  return t;
}

// ---- the inputs ----

// DriftBench's deprecated kind: its docs after the edits, each question's replaced and replacing file.
function driftSource(base) {
  const dir = join(base, "driftbench", "northwind");
  mkdirSync(dirname(dir), { recursive: true });
  cpSync(join(drift, "corpus"), dir, { recursive: true });
  applyChanges(dir, JSON.parse(readFileSync(join(drift, "changes.json"), "utf8")));
  const questions = JSON.parse(readFileSync(join(drift, "questions.json"), "utf8"))
    .filter((q) => q.kind === "deprecated")
    .map((q) => ({ id: `driftbench/${q.id}`, source: "driftbench", question: q.question, replaced: q.file_t0, current: q.file_t1, reviewed: "DriftBench's own question (bench/drift/questions.json)" }));
  return { id: "driftbench", title: "DriftBench, deprecated kind", url: "https://github.com/Genterai/genter/tree/main/bench/drift", dir, questions };
}

// Both arms over one source: per question, its counts in each arm and what each arm put first. The run stops when the
// engine ranked another number of sections than the plain arm (the arms would not see the same text).
export async function runSource(src) {
  const sections = sectionsOf(src.dir);
  const plain = plainArm(src.dir, src.questions, sections);
  const { results: genter, sections: ranked } = await genterArm(src.dir, src.questions);
  if (src.questions.length && ranked !== sections.length) throw new Error(`${src.id}: Genter ranked ${ranked} sections, plain ranking ${sections.length}`);
  src.sections = sections.length;
  return src.questions.map((q, i) => ({ ...q, plain: { ...score(plain[i], q), first: plain[i][0]?.place ?? null }, genter: { ...score(genter[i], q), first: genter[i][0]?.place ?? null, first_marked: Boolean(genter[i][0]?.marked), top: genter[i].map((r) => `${r.place}${r.marked ? " (marked)" : ""}`) } }));
}

export async function run({ offline = false, cache = join(tmpdir(), "genter-bench-repos") } = {}) {
  const spec = JSON.parse(readFileSync(join(here, "questions.json"), "utf8"));
  const base = mkdtempSync(join(tmpdir(), "old-answer-"));
  const sources = [];
  const skipped = [];
  try {
    sources.push(driftSource(base));
    for (const s of spec.sources) {
      if (offline) {
        skipped.push({ id: s.repo, why: "--offline" });
        continue;
      }
      const co = checkout(cache, s.repo, s.commit);
      sources.push({ id: s.repo, title: s.title, url: `https://github.com/${s.repo}/tree/${s.commit}`, commit: s.commit, committed: co.committed, dir: co.dir, questions: spec.questions.filter((q) => q.source === s.repo) });
    }
    const rows = [];
    for (const src of sources) rows.push(...(await runSource(src)));
    const bySource = sources.map((s) => {
      const rs = rows.filter((r) => r.source === s.id);
      return { id: s.id, title: s.title, url: s.url, ...(s.commit && { commit: s.commit, committed: s.committed }), sections: s.sections, plain: tally(rs.map((r) => r.plain)), genter: tally(rs.map((r) => r.genter)) };
    });
    const plain = tally(rows.map((r) => r.plain));
    const genter = tally(rows.map((r) => r.genter));
    return { date: new Date().toISOString().slice(0, 10), version, k: K, offline, skipped, totals: { plain, genter }, lead: { plain_current_first: plain.n ? plain.current_first / plain.n : 0, local_picture_leads: plain.n ? plain.current_first / plain.n < LEAD : null }, sources: bySource, questions: rows };
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

// ---- the report ----

const pct = (x, n) => (n ? `${Math.round((100 * x) / n)}%` : "–");
const cell = (t, k) => `${t[k]} of ${t.n} (${pct(t[k], t.n)})`;
const link = (src, place) => [].concat(place).map((p) => (src?.commit ? `[${p}](https://github.com/${src.id}/blob/${src.commit}/${p})` : `\`${p}\``)).join(", ");
const firstOf = (q, arm) => (arm.first === q.replaced ? "old" : currents(q).includes(arm.first) ? "current" : (arm.first ?? "nothing"));

// What the decision rule rests on, as bullets: what each arm puts first (the old answer, the current one, another
// document), on how many questions Genter's first result differs from plain ranking's, in all and on the public archives,
// and whether Genter's gain there is the order or the marks.
function rests(results) {
  const qs = results.questions;
  const archived = new Set(results.sources.filter((s) => s.commit).map((s) => s.id));
  const kind = (q, arm) => (q[arm].first === q.replaced ? "old" : currents(q).includes(q[arm].first) ? "current" : "other");
  const c = (arm) => {
    const out = { old: 0, current: 0, other: 0 };
    for (const q of qs) out[kind(q, arm)]++;
    return out;
  };
  const firsts = (arm) => `the old answer on ${c(arm).old}, the current one on ${c(arm).current}, another document (or nothing) on ${c(arm).other}`;
  const others = qs.filter((q) => kind(q, "plain") === "other" && kind(q, "genter") === "other").map((q) => q.id);
  const moved = qs.filter((q) => q.genter.first !== q.plain.first);
  const arch = qs.filter((q) => archived.has(q.source));
  const archMoved = moved.filter((q) => archived.has(q.source));
  const a = { plain: tally(arch.map((q) => q.plain)), genter: tally(arch.map((q) => q.genter)) };
  const out = [
    `* What each arm puts first, of ${qs.length}: plain ranking ${firsts("plain")}; Genter ${firsts("genter")}. Where plain ranking does not put the current answer first, the old answer is first on ${c("plain").old} and another document on ${c("plain").other}.${others.length ? ` Another document ranks first in both arms on ${others.join(", ")}: a review of the questions starts there (that document may state the current answer too).` : ""}`,
    `* Genter's first result differs from plain ranking's on ${moved.length} of ${qs.length} questions${moved.length ? ` (${moved.map((q) => q.id).join(", ")})` : ""}${arch.length ? `, ${archMoved.length} of them among the ${arch.length} questions of the public archives` : ""}.`,
  ];
  if (arch.length)
    out.push(
      archMoved.length
        ? `* On the public archives: current answer first, plain ranking ${a.plain.current_first} and Genter ${a.genter.current_first}; old answer unmarked in the first five, plain ranking ${a.plain.old_unmarked} and Genter ${a.genter.old_unmarked}.`
        : `* On the public archives Genter's gain is the marks, not the order: the old answer unmarked in the first five goes from ${a.plain.old_unmarked} (plain ranking) to ${a.genter.old_unmarked}, while the current answer comes first on ${a.genter.current_first} of ${arch.length} in both arms (old answer first: ${a.plain.old_first} in both). The current answer brought first, the other half of the local picture, ${moved.length ? `changes a first result only outside the archives (${moved.map((q) => q.id).join(", ")})` : "changes no first result here"}; on the archives it waits for marks that link a replacing file (README.md, Limits).`,
    );
  return out;
}

// The losses: every question where Genter puts the old answer first or leaves it unmarked in the first five, and every
// question where Genter does worse than plain ranking on any count.
export function losses(results) {
  const worse = (q) => (q.genter.old_first && !q.plain.old_first) || (q.genter.old_unmarked && !q.plain.old_unmarked) || (!q.genter.current_first && q.plain.current_first) || (!q.genter.current_top5 && q.plain.current_top5);
  return results.questions.filter((q) => q.genter.old_first || q.genter.old_unmarked || worse(q)).map((q) => ({ ...q, worse: worse(q), why: why(q) }));
}
// Why Genter lost a question, from what it returned.
function why(q) {
  if (q.genter.old_first && q.genter.first_marked) return "Genter shows the old document's own mark, quoted, but keeps the order: the mark names no replacing document by its place in the archive, and the current answer comes first only for a replacing file Genter reads";
  if (q.genter.old_unmarked) return "the replaced document carries no mark the readers read";
  if (q.genter.old_first) return "the old document ranks first and carries no mark";
  return "the ranking differs from plain ranking's";
}

// What the weekly run is held to: Genter never leaves the old answer unmarked in its first five, and is nowhere worse
// than plain ranking. [] when it holds, else one line per problem.
export function guard(results) {
  const out = [];
  if (results.totals.genter.old_unmarked) out.push(`Genter leaves the old answer unmarked in its first five on ${results.totals.genter.old_unmarked} questions`);
  for (const q of losses(results).filter((x) => x.worse)) out.push(`Genter does worse than plain ranking on ${q.id}`);
  return out;
}

// An earlier run, as a run keeps it to show beside its own: its totals and what each arm put first on each question.
export function beforeOf(earlier, file) {
  return { file, date: earlier.date, version: earlier.version, totals: earlier.totals, questions: earlier.questions.map((q) => ({ id: q.id, replaced: q.replaced, current: q.current, plain: { first: q.plain.first }, genter: { first: q.genter.first } })) };
}

// The earlier run beside this one: the totals, then every question, what each arm put first then and now.
function beforeLines(results) {
  const b = results.before;
  if (!b) return [];
  const was = new Map(b.questions.map((q) => [q.id, q]));
  const t = (x) => `${x.old_first} old first, ${x.old_unmarked} old unmarked in five, ${x.current_first} current first, ${x.current_top5} current in five`;
  const changed = results.questions.filter((q) => {
    const w = was.get(q.id);
    return !w || w.plain.first !== q.plain.first || w.genter.first !== q.genter.first || JSON.stringify(w.current) !== JSON.stringify(q.current);
  });
  return [
    "## Before and after",
    "",
    `The same questions in the run of ${b.date} (genter-cli ${b.version}, [${b.file}](${b.file})): plain ranking ${t(b.totals.plain)}, then; now ${t(results.totals.plain)}. Genter ${t(b.totals.genter)}, then; now ${t(results.totals.genter)}. ${changed.length} of ${results.questions.length} questions changed what an arm puts first, or their current answer (in bold); the rest put first what they did. Old: the replaced document; current: the replacing one; else the document an arm put first.`,
    "",
    "| question | plain first, then | plain first, now | Genter first, then | Genter first, now |",
    "| -- | -- | -- | -- | -- |",
    ...results.questions.map((q) => {
      const w = was.get(q.id);
      const id = changed.includes(q) ? `**${q.id}**` : q.id;
      return `| ${id}${w && corrected(w, q) ? " (its current answer corrected: below)" : ""} | ${w ? firstOf(w, w.plain) : "–"} | ${firstOf(q, q.plain)} | ${w ? firstOf(w, w.genter) : "–"} | ${firstOf(q, q.genter)} |`;
    }),
    "",
    // A question whose current answer was corrected since: why, and how this run scores with its first current answer.
    ...results.questions
      .filter((q) => was.has(q.id) && corrected(was.get(q.id), q))
      .map((q) => {
        const then = currents(was.get(q.id));
        const p = then.includes(q.plain.first);
        const g = then.includes(q.genter.first);
        return `* **${q.id}**: ${q.note ?? "its current answer was corrected."} Scored with its first current answer (${then.join(", ")}), this run's plain ranking ${p ? "puts it first" : "does not put it first"} and Genter ${g ? "puts it first" : `does not (Genter's first: ${q.genter.first ?? "nothing"})`}${p && !g ? ": by that scoring Genter would do worse than plain ranking on this question, a loss" : ""}.`;
      }),
    ...(results.questions.some((q) => was.has(q.id) && corrected(was.get(q.id), q)) ? [""] : []),
  ];
}
const corrected = (w, q) => JSON.stringify(w.current) !== JSON.stringify(q.current);

export function resultsMd(results, file) {
  const { plain, genter } = results.totals;
  const srcOf = Object.fromEntries(results.sources.map((s) => [s.id, s]));
  const lost = losses(results);
  const share = Math.round(results.lead.plain_current_first * 100);
  const lines = [
    "# The old-answer test: results",
    "",
    `Written by \`node bench/old-answer/run.mjs\` on ${results.date} with genter-cli ${results.version}${file ? `; the numbers are in [${file}](${file})` : ""}. The method is in [README.md](README.md); the questions, ${results.questions.length} of them, in [questions.json](questions.json).${results.skipped.length ? ` Not run: ${results.skipped.map((s) => `${s.id} (${s.why})`).join(", ")}.` : ""}`,
    "",
    "| arm | old answer first | old answer unmarked in the first five | current answer first | current answer in the first five |",
    "| -- | --: | --: | --: | --: |",
    `| plain ranking (BM25 over the same sections, no marks, no reordering) | ${cell(plain, "old_first")} | ${cell(plain, "old_unmarked")} | ${cell(plain, "current_first")} | ${cell(plain, "current_top5")} |`,
    `| **Genter** (the local engine as shipped, no key) | **${cell(genter, "old_first")}** | **${cell(genter, "old_unmarked")}** | **${cell(genter, "current_first")}** | **${cell(genter, "current_top5")}** |`,
    "",
    "## The plan's decision rule",
    "",
    results.lead.local_picture_leads === null
      ? "No question ran."
      : results.lead.local_picture_leads
        ? `Plain ranking puts the current answer first on ${share}% of the questions, under 90%: by the plan's rule the local picture can lead. That is the rule applied as written; what it rests on:`
        : `Plain ranking already puts the current answer first on ${share}% of the questions, 90% or more: **the local picture is not the lead**; the hero leads with the hosted try page (step 1.10 of the plan). What that rests on:`,
    ...(results.questions.length ? ["", ...rests(results)] : []),
    "",
    "## Per source",
    "",
    "| source | questions | sections (both arms) | plain: old first | plain: old unmarked in five | Genter: old first | Genter: old unmarked in five | plain: current first | Genter: current first |",
    "| -- | --: | --: | --: | --: | --: | --: | --: | --: |",
    ...results.sources.map((s) => `| [${s.title}](${s.url})${s.commit ? ` at ${s.commit.slice(0, 7)} (${s.committed.slice(0, 10)})` : ""} | ${s.plain.n} | ${s.sections ?? "–"} | ${s.plain.old_first} | ${s.plain.old_unmarked} | ${s.genter.old_first} | ${s.genter.old_unmarked} | ${s.plain.current_first} | ${s.genter.current_first} |`),
    "",
    ...beforeLines(results),
    "## Losses",
    "",
    lost.length ? `${lost.length} questions where Genter puts the old answer first, leaves it unmarked in the first five, or does worse than plain ranking:` : "None: Genter never puts the old answer first, never leaves it unmarked in the first five, and is nowhere worse than plain ranking.",
    ...(lost.length ? [""] : []),
    ...lost.map((q) => `* **${q.id}** "${q.question}" — ${[q.genter.old_first && "Genter puts the old answer first", q.genter.old_unmarked && "the old answer is unmarked in Genter's first five", q.worse && "worse than plain ranking"].filter(Boolean).join("; ")}: ${q.why}. ${q.pair ? `The pair: ${q.pair}. ` : ""}Replaced: ${link(srcOf[q.source], q.replaced)}; current: ${link(srcOf[q.source], q.current)}. Genter's first five: ${q.genter.top.join(", ") || "nothing"}.${q.note ? ` ${q.note}` : ""}`),
    "",
    "## Every question",
    "",
    "| question | replaced | current | plain first | Genter first | reviewed |",
    "| -- | -- | -- | -- | -- | -- |",
    ...results.questions.map((q) => `| ${q.id}: ${q.question.replace(/\|/g, "\\|")} | ${link(srcOf[q.source], q.replaced)} | ${link(srcOf[q.source], q.current)} | ${firstOf(q, q.plain)} | ${firstOf(q, q.genter)} | ${q.reviewed} |`),
    "",
    "Out of scope here: memory layers (mem0 and others) and a real agent with its own grep are arms of step 3.5 of the plan, each in its own recommended configuration.",
  ];
  return `${lines.join("\n")}\n`;
}

// ---- main ----

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
  const from = option("--from");
  const results = from ? JSON.parse(readFileSync(from, "utf8")) : await run({ offline: args.includes("--offline"), ...(option("--cache") && { cache: option("--cache") }) });
  if (option("--before") && !from) results.before = beforeOf(JSON.parse(readFileSync(option("--before"), "utf8")), relative(here, option("--before")).split(sep).join("/"));
  const defaults = !option("--out") && !option("--md") && !from && !results.offline;
  const out = option("--out") ?? (defaults ? join(here, "results", `${results.date}.json`) : null);
  const md = option("--md") ?? (defaults || from ? join(here, "RESULTS.md") : null);
  if (out && !from) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
  }
  const file = from ?? out;
  if (md) writeFileSync(md, resultsMd(results, file && relative(dirname(md), file).split(sep).join("/")));
  const { plain, genter } = results.totals;
  const problems = args.includes("--guard") ? guard(results) : [];
  for (const p of problems) console.error(`guard: ${p}`);
  if (problems.length) process.exitCode = 1;
  console.log(`${genter.n} questions · old answer first: plain ${plain.old_first}, Genter ${genter.old_first} · old answer unmarked in the first five: plain ${plain.old_unmarked}, Genter ${genter.old_unmarked} · current first: plain ${plain.current_first}, Genter ${genter.current_first}`);
}
