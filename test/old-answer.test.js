import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { beforeOf, genterArm, guard, LEAD, laterMissing, losses, plainArm, resultsMd, run, score, sectionsOf, tally, writtenOnly } from "../bench/old-answer/run.mjs";
import { countFolder, GATE, pick, resultsMd as reposMd, verdict } from "../bench/repos/run.mjs";

const bench = fileURLToPath(new URL("../bench/", import.meta.url));
const json = (path) => JSON.parse(readFileSync(join(bench, path), "utf8"));
// The results file a published RESULTS.md names.
const resultsOf = (dir) => readFileSync(join(bench, dir, "RESULTS.md"), "utf8").match(/\((results\/[\w-]+\.json)\)/)[1];
const fixture = join(bench, "old-answer", "fixtures", "decisions");
const OLD = "docs/adr/0003-run-background-jobs-on-postgres.md";
const NEW = "docs/adr/0011-run-background-jobs-on-redis.md";
const question = { id: "fixture/adr-3", question: "Where do background jobs run, and how do workers poll for them?", replaced: OLD, current: NEW };

// The fixture in a folder of its own (a project of its own: no genter.json or .git above it).
async function inCopy(fn) {
  const dir = mkdtempSync(join(tmpdir(), "old-answer-test-"));
  try {
    cpSync(fixture, dir, { recursive: true });
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Results as run() gives them, for the report and the guard, from per-question counts.
function results(rows) {
  const plain = tally(rows.map((r) => r.plain));
  const genter = tally(rows.map((r) => r.genter));
  return { date: "2026-10-20", version: "0", skipped: [], totals: { plain, genter }, lead: { plain_current_first: plain.current_first / plain.n, local_picture_leads: plain.current_first / plain.n < LEAD }, sources: [{ id: "fixture", title: "Fixture", url: "https://example.org", plain, genter }], questions: rows };
}
const row = (id, plain, genter) => ({ id, source: "fixture", question: `question ${id}?`, replaced: OLD, current: NEW, reviewed: "pending owner", plain: { ...plain, first: plain.current_first ? NEW : OLD }, genter: { ...genter, first: genter.current_first ? NEW : OLD, first_marked: true, top: [] } });
const won = { old_first: false, old_unmarked: false, current_first: true, current_top5: true, written_first: true, written_top5: true };
const lost = { old_first: true, old_unmarked: true, current_first: false, current_top5: true, written_first: false, written_top5: true };
// A question whose current document is itself replaced: ADR 11 by ADR 12 (later), as the archive's own mark says.
const LATER = "docs/adr/0012-run-background-jobs-on-kafka.md";
const chainQuestion = { ...question, id: "c", later: [{ place: LATER, in: NEW, mark: "Superseded by [ADR 12](0012-run-background-jobs-on-kafka.md)" }] };
// Plain ranking puts the written current document first, Genter the later one: scored as run() scores them.
function chainRow() {
  const plain = [{ place: NEW, marked: false }, { place: OLD, marked: false }];
  const genter = [{ place: LATER, marked: false }, { place: NEW, marked: true }, { place: OLD, marked: true }];
  return { ...chainQuestion, source: "fixture", question: "question c?", reviewed: "pending owner", plain: { ...score(plain, chainQuestion), first: NEW }, genter: { ...score(genter, chainQuestion), first: LATER, first_marked: false, top: [LATER, `${NEW} (marked)`, `${OLD} (marked)`] } };
}

describe("the old-answer test", () => {
  it("[rl:old-answer/same-sections] [rl:old-answer/counts] on a replaced ADR, plain ranking puts the old answer first and leaves it unmarked; Genter, over the same sections, puts the current one first and marks the old one", async () => {
    await inCopy(async (dir) => {
      const [plain] = plainArm(dir, [question]);
      const { results: [genter], sections: ranked } = await genterArm(dir, [question]);
      assert.deepEqual(score(plain, question), lost);
      assert.deepEqual(score(genter, question), won);
      assert.equal(genter[0].place, NEW);
      assert.ok(genter.some((r) => r.place === OLD && r.marked), "the replaced ADR follows, marked");
      assert.ok(plain.every((r) => !r.marked), "plain ranking marks nothing");
      // The same sections: the engine ranked as many as the plain arm, and every passage Genter returns lies inside a
      // section the plain arm ranks, of the same file.
      const sections = sectionsOf(dir);
      assert.equal(ranked, sections.length);
      for (const r of genter) assert.ok(sections.some((s) => s.place === r.place && s.from <= r.lines[0] && r.lines[1] <= s.to), `${r.place}:${r.lines}`);
    });
  });

  it("[rl:old-answer/counts] a document later in the current answer's chain counts as current, the replaced document never does, and the count as written is reported beside it", () => {
    const top = [{ place: LATER, marked: false }, { place: NEW, marked: true }, { place: OLD, marked: true }];
    assert.deepEqual(score(top, chainQuestion), { old_first: false, old_unmarked: false, current_first: true, current_top5: true, written_first: false, written_top5: true });
    assert.deepEqual(score(top, question), { old_first: false, old_unmarked: false, current_first: false, current_top5: true, written_first: false, written_top5: true }, "without later, only the written document");
    // A chain that names the replaced document again (two documents that name each other) never makes it current.
    const loop = { ...chainQuestion, later: [...chainQuestion.later, { place: OLD, in: LATER, mark: "Superseded by ADR 3" }] };
    assert.deepEqual(score([{ place: OLD, marked: false }, { place: LATER, marked: false }], loop), { old_first: true, old_unmarked: true, current_first: false, current_top5: true, written_first: false, written_top5: false });
    // Both counts are tallied and published; the losses and the guard take the chain.
    const r = results([chainRow(), row("a", won, won)]);
    assert.deepEqual([r.totals.genter.current_first, r.totals.genter.written_first, r.totals.plain.current_first, r.totals.plain.written_first], [2, 1, 2, 2]);
    assert.deepEqual(losses(r), []);
    const md = resultsMd(r);
    assert.match(md, /\| \*\*Genter\*\* \| \*\*1 of 2 \(50%\)\*\* \| \*\*2 of 2 \(100%\)\*\* \| \*\*2 of 2 \(100%\)\*\* \| \*\*2 of 2 \(100%\)\*\* \|/);
    assert.match(md, new RegExp(`\\* \\*\\*c\\*\\*: \`${NEW}\`, then \`${LATER}\` \\(${NEW} says "Superseded by \\[ADR 12\\]\\(0012-run-background-jobs-on-kafka\\.md\\)"\\)\\. Here plain ranking puts ${NEW} \\(the current answer as written\\) first, Genter ${LATER} \\(later in its chain\\)\\.`));
    assert.match(md, /Counted as written, Genter does worse than plain ranking on 1 question\(s\) that with the chain are no loss: \*\*c\*\*/);
    assert.match(md, /None: Genter never puts the old answer first/);
    assert.match(md, new RegExp(`\\| c: question c\\? \\| \`${OLD}\` \\| \`${NEW}\`, then \`${LATER}\` \\(later in its chain\\) \\| current \\| current, later in its chain \\(${LATER}\\) \\|`));
  });

  it("[rl:old-answer/same-sections] with the replaced mark taken out, the two arms rank the same number of sections and return the same places in the same order", async () => {
    await inCopy(async (dir) => {
      const old = join(dir, OLD);
      const text = readFileSync(old, "utf8");
      writeFileSync(old, text.replace(/^Superseded by .*\n/m, ""));
      assert.notEqual(readFileSync(old, "utf8"), text, "the Status line is gone");
      const [plain] = plainArm(dir, [question]);
      const { results: [genter], sections: ranked } = await genterArm(dir, [question]);
      assert.equal(ranked, sectionsOf(dir).length);
      assert.ok(genter.every((r) => !r.marked), "nothing is marked");
      assert.ok(plain.length > 1);
      assert.deepEqual(genter.map((r) => r.place), plain.map((r) => r.place));
    });
  });

  it("[rl:old-answer/one-command] [rl:old-answer/never-worse] [rl:driftbench/old-first] the run is deterministic: twice over DriftBench's deprecated kind, the same numbers; Genter never puts its old answer first or leaves it unmarked, and the guard holds", async () => {
    const strip = (r) => JSON.stringify({ totals: r.totals, sources: r.sources, questions: r.questions });
    const a = await run({ offline: true });
    const b = await run({ offline: true });
    assert.equal(strip(a), strip(b));
    assert.equal(a.totals.genter.n, 5);
    assert.equal(a.totals.genter.old_first, 0);
    assert.equal(a.totals.genter.old_unmarked, 0);
    assert.ok(a.totals.plain.old_unmarked > 0, "plain ranking leaves the old answer unmarked");
    assert.deepEqual(guard(a), []);
    assert.deepEqual(a.skipped.map((s) => s.id), json("old-answer/questions.json").sources.map((s) => s.repo));
  });

  it("[rl:old-answer/losses-published] [rl:old-answer/decision-rule] RESULTS.md lists every loss with its places and why, and says the plan's decision rule either way", () => {
    const leads = results([row("a", lost, won), row("b", won, lost), row("c", won, won)]);
    const md = resultsMd(leads, "results/x.json");
    assert.match(md, /## Losses\n\n1 questions where Genter puts the old answer first/);
    assert.match(md, /\*\*b\*\* "question b\?" — Genter puts the old answer first; the old answer is unmarked in Genter's first five; worse than plain ranking: /);
    assert.match(md, new RegExp(`Replaced: \`${OLD}\`; current: \`${NEW}\``));
    assert.match(md, /Plain ranking puts the current answer first on 67% of the questions, under 90%/);
    assert.match(md, /Out of scope here: memory layers \(mem0 and others\)/);
    assert.equal(losses(leads).length, 1);
    // The current answer's own document marked as replaced, and a later document of its chain first: said so.
    const chain = results([{ ...row("d", won, { ...won, current_first: false }), genter: { ...won, current_first: false, first: "docs/adr/0012-x.md", first_marked: false, top: ["docs/adr/0012-x.md", `${NEW} (marked)`, `${OLD} (marked)`] } }]);
    assert.match(resultsMd(chain), /\*\*d\*\* "question d\?" — worse than plain ranking: the current answer's own document is marked as replaced too, and Genter follows the replacements among the sections it found, so a document further along that chain \(docs\/adr\/0012-x\.md\) comes first, one the question's `later` does not name\./);
    const notLead = results(Array.from({ length: 10 }, (_, i) => row(`q${i}`, i < 9 ? won : lost, won)));
    assert.match(resultsMd(notLead), /already puts the current answer first on 90% of the questions, 90% or more: \*\*the local picture is not the lead\*\*/);
    assert.match(resultsMd(notLead), /None: Genter never puts the old answer first/);
  });

  it("[rl:old-answer/one-command] [rl:old-answer/losses-published] the published RESULTS.md is what the published results give, and --offline leaves both alone", () => {
    const md = join(bench, "old-answer", "RESULTS.md");
    const before = readFileSync(md, "utf8");
    const file = resultsOf("old-answer");
    const published = readFileSync(join(bench, "old-answer", file), "utf8");
    assert.equal(before, resultsMd(JSON.parse(published), file));
    const offline = spawnSync(process.execPath, [join(bench, "old-answer", "run.mjs"), "--offline"], { encoding: "utf8" });
    assert.equal(offline.status, 0, offline.stderr);
    assert.match(offline.stdout, /^5 questions/);
    assert.equal(readFileSync(md, "utf8"), before, "RESULTS.md untouched");
    assert.equal(readFileSync(join(bench, "old-answer", file), "utf8"), published, `${file} untouched`);
    // A run from before the chain rule counted only as written: --from refuses it and writes nothing.
    const old = spawnSync(process.execPath, [join(bench, "old-answer", "run.mjs"), "--from", join(bench, "old-answer", "results", "2026-10-20-by-id.json")], { encoding: "utf8" });
    assert.equal(old.status, 1);
    assert.match(old.stderr, /was written before the chain rule/);
    assert.equal(readFileSync(md, "utf8"), before, "RESULTS.md untouched");
  });

  it("[rl:old-answer/never-worse] the guard fails a run on any loss: Genter leaves the old answer unmarked in its first five, puts it first, or does worse than plain ranking, the current answer counted with its chain", () => {
    assert.deepEqual(guard(results([row("a", lost, won)])), []);
    assert.deepEqual(guard(results([row("a", won, lost)])), ["Genter leaves the old answer unmarked in its first five on 1 questions", "Genter does worse than plain ranking on a"]);
    assert.deepEqual(guard(results([row("a", won, { ...won, current_first: false })])), ["Genter does worse than plain ranking on a"]);
    // The old answer first, marked, where plain ranking puts it first too: no worse, but a loss, so the guard fails.
    const both = results([row("a", lost, { ...lost, old_unmarked: false })]);
    assert.deepEqual(losses(both).map((q) => q.id), ["a"]);
    assert.deepEqual(guard(both), ["Genter puts the old answer first on a"]);
    // A later document of the current answer's chain first is no loss; counted as written it would be, and is said so.
    const chained = results([chainRow()]);
    assert.deepEqual(guard(chained), []);
    assert.deepEqual(writtenOnly(chained).map((q) => q.id), ["c"]);
  });

  it("[rl:old-answer/questions-reviewed] every question names a public archive at a commit, its replaced and current documents, the mark that pairs them and who reviewed it", () => {
    const spec = json("old-answer/questions.json");
    const repos = new Map(json("repos/repos.json").repos.map((r) => [r.repo, r]));
    // The three archives step 1.10's run picked: its own results file, whatever run RESULTS.md names now.
    const picks = json("repos/results/2026-10-20.json").verdict?.picks;
    assert.ok(picks, "bench/repos/results/2026-10-20.json is step 1.10's run, which picked the archives: a later run replaced it (restore it with git)");
    assert.deepEqual(spec.sources.map((s) => s.repo).sort(), [...picks].sort(), "the archives are the three bench/repos picked");
    for (const s of spec.sources) {
      assert.match(s.repo, /^[\w.-]+\/[\w.-]+$/);
      assert.match(s.commit, /^[0-9a-f]{40}$/);
      assert.equal(s.commit, repos.get(s.repo).commit, "the commit the readers ran over");
    }
    const ids = new Set();
    for (const q of spec.questions) {
      assert.ok(!ids.has(q.id), q.id);
      ids.add(q.id);
      assert.ok(spec.sources.some((s) => s.repo === q.source), q.id);
      assert.match(q.question, /\?$/);
      for (const p of [q.replaced, ...[].concat(q.current)]) assert.match(p, /^[\w./-]+$/);
      assert.ok(![].concat(q.current).includes(q.replaced), q.id);
      assert.ok(q.pair.includes(q.replaced), `${q.id}: the pair names the replaced document`);
      assert.ok(q.current_says, q.id);
      assert.equal(q.reviewed, "pending owner", q.id);
    }
    assert.equal(spec.reviewed, "pending owner");
  });

  it("[rl:old-answer/questions-reviewed] [rl:old-answer/counts] every later document of a chain names the document whose mark leads to it and quotes that mark's line, written by hand; the run checks each line is in its document", () => {
    const spec = json("old-answer/questions.json");
    assert.match(spec.current_rule, /written current document or any later document reached from it by the archive's own explicit replacement marks/);
    assert.match(spec.current_rule, /showed one question affected, peps\/0241/);
    // Every question whose current document carries a replacement mark of its own, checked by hand at the pinned commits.
    const chained = spec.questions.filter((q) => q.later);
    assert.deepEqual(chained.map((q) => q.id), ["peps/0241", "peps/0314"]);
    for (const q of chained) {
      assert.ok(q.later.length > 0, q.id);
      const seen = new Set([q.replaced, ...[].concat(q.current)]);
      q.later.forEach((l, i) => {
        assert.deepEqual(Object.keys(l).sort(), ["in", "mark", "place"], q.id);
        assert.match(l.place, /^[\w./-]+$/, q.id);
        assert.ok(!seen.has(l.place), `${q.id}: ${l.place} once, never the replaced or a written current document`);
        seen.add(l.place);
        assert.ok(i ? l.in === q.later[i - 1].place : [].concat(q.current).includes(l.in), `${q.id}: ${l.place} follows the document before it in the chain`);
        assert.match(l.mark, /^\S(?:[^\n]*\S)?$/, `${q.id}: the mark is one quoted line`);
        if (q.source === "python/peps") assert.equal(l.mark, `Superseded-By: ${Number(/pep-(\d+)\./.exec(l.place)[1])}`, `${q.id}: a PEP header names ${l.place}`);
      });
    }
    // The check the run makes at each pinned commit, on plain text: a mark's line is in its document, else it stops.
    const dir = mkdtempSync(join(tmpdir(), "old-answer-later-"));
    try {
      mkdirSync(join(dir, "peps"));
      writeFileSync(join(dir, "peps/pep-0314.rst"), "PEP: 314\nStatus: Superseded\nSuperseded-By: 345\n\nAbstract\n");
      const q = (mark, at = "peps/pep-0314.rst") => [{ id: "peps/0241", later: [{ place: "peps/pep-0345.rst", in: at, mark }] }];
      assert.deepEqual(laterMissing(dir, q("Superseded-By: 345")), []);
      assert.deepEqual(laterMissing(dir, q("Superseded-By: 34")), ['peps/0241: peps/pep-0314.rst has no line "Superseded-By: 34"']);
      assert.deepEqual(laterMissing(dir, q("Superseded-By: 345", "peps/pep-9999.rst")), ['peps/0241: peps/pep-9999.rst has no line "Superseded-By: 345"']);
      assert.deepEqual(laterMissing(dir, [{ id: "x" }]), []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("[rl:old-answer/repos-gate] the readers' counts per repository, the gate and the three picks follow their stated rules; the 50 were picked and pinned before the count", () => {
    const counts = countFolder(fixture);
    assert.equal(counts.records, 2);
    assert.equal(counts.dated, 2);
    assert.equal(counts.marked, 1);
    assert.equal(counts.placed, 1);
    assert.deepEqual(counts.pairs.map((p) => [p.replaced, p.by, p.reader]), [[OLD, NEW, "adr"]]);
    assert.deepEqual(counts.by_kind, { superseded: 1 });
    assert.deepEqual([...new Set(counts.marks.map((m) => `${m.doc} ${m.kind}`))], [`${OLD} superseded`]);
    assert.ok(counts.marks.some((m) => m.reader === "adr"), "the adr reader reads its status");
    const base = { group: "archives", files: 1, records: 0, marked: 0, named: 0, placed: 0, stars: 1, present: 10 };
    const rows = Array.from({ length: 50 }, (_, i) => ({ ...base, repo: `o/r${i}`, records: i < 25 ? 0 : 6, marked: i < 15 ? 1 : 0 }));
    assert.equal(verdict(rows).median_records, 3);
    assert.equal(verdict(rows).passes, false);
    const kinds = verdict(rows.map((r, i) => ({ ...r, by_kind: i < 3 ? { superseded: 1 } : i < 5 ? { moved: 1, deprecated: 1 } : i < 15 ? { deprecated: 1 } : {} })));
    assert.deepEqual([kinds.with_kind.superseded, kinds.with_kind.moved, kinds.with_kind.deprecated, kinds.with_replaced], [3, 2, 12, 5]);
    const passing = rows.map((r, i) => ({ ...r, records: i < 24 ? 0 : 6 }));
    assert.equal(verdict(passing).passes, true);
    assert.equal(verdict(passing.map((r, i) => ({ ...r, marked: i < 14 ? 1 : 0 }))).passes, false, `${GATE.marked} with a mark`);
    const picked = verdict(passing.map((r, i) => ({ ...r, placed: i === 30 ? 2 : i === 40 ? 1 : 0, named: i === 45 ? 3 : 0 }))).picks;
    assert.deepEqual(picked, ["o/r30", "o/r40", "o/r45"]);
    // The candidates: three groups whose takes make 50, most stars first; the 50 pinned at commits.
    const candidates = json("repos/candidates.json");
    assert.equal(candidates.groups.reduce((n, g) => n + g.take, 0), 50);
    for (const g of candidates.groups) assert.deepEqual(g.candidates.map((c) => c.stars), [...g.candidates.map((c) => c.stars)].sort((a, b) => b - a), g.id);
    const { repos } = json("repos/repos.json");
    assert.equal(repos.length, 50);
    for (const g of candidates.groups) assert.equal(repos.filter((r) => r.group === g.id).length, g.take, g.id);
    for (const r of repos) assert.match(r.commit, /^[0-9a-f]{40}$/);
    // The held-out sample: the same groups and takes, none of the first 50, each group most stars first and at most its
    // take, every repository pinned and none twice.
    const held = json("repos/heldout.json");
    assert.deepEqual(candidates.heldout.groups.map((g) => [g.id, g.take]), candidates.groups.map((g) => [g.id, g.take]));
    for (const g of candidates.heldout.groups) {
      assert.deepEqual(g.candidates.map((c) => c.stars), [...g.candidates.map((c) => c.stars)].sort((a, b) => b - a), g.id);
      assert.ok(held.repos.filter((r) => r.group === g.id).length <= g.take, g.id);
    }
    const first = new Set(repos.map((r) => r.repo));
    assert.ok(held.repos.every((r) => !first.has(r.repo) && /^[0-9a-f]{40}$/.test(r.commit)));
    assert.equal(new Set(held.repos.map((r) => r.repo)).size, held.repos.length);
    // The published run: both samples, every repository at its pinned commit, the verdict on the held-out sample, and
    // RESULTS.md written from it.
    const published = json(`repos/${resultsOf("repos")}`);
    const sample = (id) => published.samples.find((x) => x.id === id);
    assert.deepEqual(sample("first").repos.map((r) => [r.repo, r.commit]), repos.map((r) => [r.repo, r.commit]));
    assert.deepEqual(sample("heldout").repos.map((r) => [r.repo, r.commit]), held.repos.map((r) => [r.repo, r.commit]));
    const md = readFileSync(join(bench, "repos", "RESULTS.md"), "utf8");
    assert.equal(md, reposMd(published));
    assert.match(md, new RegExp(`## The gate, on the ${held.repos.length} held out\\n\\n\\*\\*${sample("heldout").verdict.passes ? "Passes" : "Does not pass"}\\.\\*\\*`));
    assert.match(md, /## The first 50, after the readers were widened\n\n\*\*Would (not )?pass\*\* on the first 50 .*a biased number/);
  });

  it("[rl:old-answer/repos-gate] [rl:readers/by-id] a replacement named by a number counts as there when the file its id names is, as the engine resolves it: never through a link", () => {
    const dir = mkdtempSync(join(tmpdir(), "repos-by-id-"));
    try {
      const pep = (n, extra) => `PEP: ${n}\nTitle: Exporting invoices\nStatus: ${extra ? "Superseded" : "Final"}\nCreated: 05-Jul-2021\n${extra}\nAbstract\n========\n\nInvoices are exported.\n`;
      mkdirSync(join(dir, "peps"));
      mkdirSync(join(dir, "elsewhere"));
      writeFileSync(join(dir, "peps/pep-0042.rst"), pep(42, "Superseded-By: 57\n"));
      writeFileSync(join(dir, "peps/pep-0057.rst"), pep(57, ""));
      writeFileSync(join(dir, "peps/pep-0060.rst"), pep(60, "Superseded-By: 61\n"));
      writeFileSync(join(dir, "elsewhere/notes.rst"), pep(61, ""));
      symlinkSync(join(dir, "elsewhere/notes.rst"), join(dir, "peps/pep-0061.rst"));
      const counts = countFolder(dir);
      assert.equal(counts.marked, 2);
      assert.equal(counts.named, 2);
      assert.equal(counts.placed, 1, "PEP 61 is a link: not there");
      assert.deepEqual(counts.pairs.map((p) => [p.replaced, p.by, p.reader]), [["peps/pep-0042.rst", "peps/pep-0057.rst", "pep"]]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("[rl:old-answer/repos-gate] a sample is picked by the check alone, most stars first, the first `take` that pass, none of the first 50 and none twice; a group short of candidates takes fewer", () => {
    const trees = {
      "o/a": ["proposals/0001-x.md"],
      "o/b": ["README.md"],
      "o/c": ["proposals/0002-y.md"],
      "o/d": ["proposals/0003-z.md"],
      "o/log": ["CHANGELOG.md"],
      "o/quiet": ["docs/CHANGES.txt"],
    };
    const text = { "o/log": "## 2.0\n- `old()` is deprecated\n", "o/quiet": "## 2.0\n- faster\n" };
    const tree = (_, repo) => ({ dir: repo, commit: "a".repeat(40), committed: "2026-10-20T00:00:00Z", tree: trees[repo] ?? [] });
    const read = (dir) => text[dir] ?? "";
    const groups = [
      { id: "archives", take: 2, candidates: ["o/a", "o/b", "o/c", "o/d"].map((repo, i) => ({ repo, stars: 10 - i, records: "^proposals/.+\\.md$", what: "proposals" })) },
      { id: "changelogs", take: 3, changelog: true, candidates: ["o/c", "o/quiet", "o/log"].map((repo, i) => ({ repo, stars: 5 - i })) },
    ];
    const { picked, skipped } = pick("cache", groups, new Set(["o/a"]), { tree, read });
    assert.deepEqual(picked.map((p) => [p.group, p.repo]), [["archives", "o/c"], ["archives", "o/d"], ["changelogs", "o/log"]]);
    assert.deepEqual(skipped.map((x) => [x.repo, x.why]), [["o/a", "in the first 50"], ["o/b", "no proposals (^proposals/.+\\.md$)"], ["o/c", "taken by an earlier group"], ["o/quiet", "no changelog that says deprecat"]]);
    for (const p of picked) assert.match(p.commit, /^[0-9a-f]{40}$/);
  });

  it("[rl:old-answer/one-command] an earlier run beside this one: what each arm put first then and now, and a question whose current answer was corrected says how this run scores with its first one", () => {
    const now = results([row("a", won, won), { ...row("b", won, won), current: [OLD.replace("0003", "0012")], note: "Corrected: ADR 11 is itself replaced." }]);
    now.questions[1].genter.first = OLD.replace("0003", "0012");
    now.questions[1].plain.first = NEW;
    const then = results([row("a", lost, lost), row("b", won, won)]);
    now.before = beforeOf({ ...then, date: "2026-10-19", version: "0" }, "results/then.json");
    const md = resultsMd(now, "results/now.json");
    assert.match(md, /## Before and after\n\nThe same questions in the run of 2026-10-19 \(genter-cli 0, \[results\/then\.json\]\(results\/then\.json\)\)/);
    assert.match(md, /\| \*\*a\*\* \| old \| current \| old \| current \|/);
    assert.match(md, /\| \*\*b\*\* \(its current answer corrected: below\) \| current \| docs\/adr\/0011-run-background-jobs-on-redis\.md \| current \| current \|/);
    assert.match(md, /\* \*\*b\*\*: Corrected: ADR 11 is itself replaced\. Scored with its first current answer \(docs\/adr\/0011-run-background-jobs-on-redis\.md\), this run's plain ranking puts it first and Genter does not \(Genter's first: docs\/adr\/0012-run-background-jobs-on-postgres\.md\): by that scoring Genter would do worse than plain ranking on this question, a loss\./);
  });
});
