import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { genterArm, guard, LEAD, losses, plainArm, resultsMd, run, score, sectionsOf, tally } from "../bench/old-answer/run.mjs";
import { countFolder, GATE, resultsMd as reposMd, verdict } from "../bench/repos/run.mjs";

const bench = fileURLToPath(new URL("../bench/", import.meta.url));
const json = (path) => JSON.parse(readFileSync(join(bench, path), "utf8"));
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
const won = { old_first: false, old_unmarked: false, current_first: true, current_top5: true };
const lost = { old_first: true, old_unmarked: true, current_first: false, current_top5: true };

describe("the old-answer test", () => {
  it("[rl:old-answer/same-sections] [rl:old-answer/counts] on a replaced ADR, plain ranking puts the old answer first and leaves it unmarked; Genter, over the same sections, puts the current one first and marks the old one", async () => {
    await inCopy(async (dir) => {
      const [plain] = plainArm(dir, [question]);
      const [genter] = await genterArm(dir, [question]);
      assert.deepEqual(score(plain, question), { old_first: true, old_unmarked: true, current_first: false, current_top5: true });
      assert.deepEqual(score(genter, question), { old_first: false, old_unmarked: false, current_first: true, current_top5: true });
      assert.equal(genter[0].place, NEW);
      assert.ok(genter.some((r) => r.place === OLD && r.marked), "the replaced ADR follows, marked");
      assert.ok(plain.every((r) => !r.marked), "plain ranking marks nothing");
      // The same sections: every passage Genter returns lies inside a section the plain arm ranks, of the same file.
      const sections = sectionsOf(dir);
      for (const r of genter) assert.ok(sections.some((s) => s.place === r.place && s.from <= r.lines[0] && r.lines[1] <= s.to), `${r.place}:${r.lines}`);
      // The same ranking: without the replaced mark the two arms return the same places in the same order.
      assert.deepEqual(new Set(genter.map((r) => r.place)), new Set(plain.map((r) => r.place)));
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
    const notLead = results(Array.from({ length: 10 }, (_, i) => row(`q${i}`, i < 9 ? won : lost, won)));
    assert.match(resultsMd(notLead), /already puts the current answer first on 90% of the questions, 90% or more: \*\*the local picture is not the lead\*\*/);
    assert.match(resultsMd(notLead), /None: Genter never puts the old answer first/);
  });

  it("[rl:old-answer/never-worse] the guard fails a run where Genter leaves the old answer unmarked in its first five or does worse than plain ranking", () => {
    assert.deepEqual(guard(results([row("a", lost, won)])), []);
    assert.deepEqual(guard(results([row("a", won, lost)])), ["Genter leaves the old answer unmarked in its first five on 1 questions", "Genter does worse than plain ranking on a"]);
    assert.deepEqual(guard(results([row("a", won, { ...won, current_first: false })])), ["Genter does worse than plain ranking on a"]);
  });

  it("[rl:old-answer/questions-reviewed] every question names a public archive at a commit, its replaced and current documents, the mark that pairs them and who reviewed it", () => {
    const spec = json("old-answer/questions.json");
    const repos = new Map(json("repos/repos.json").repos.map((r) => [r.repo, r]));
    const picks = json(`repos/${readFileSync(join(bench, "repos", "RESULTS.md"), "utf8").match(/\((results\/[\d-]+\.json)\)/)[1]}`).verdict.picks;
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

  it("[rl:old-answer/repos-gate] the readers' counts per repository, the gate and the three picks follow their stated rules; the 50 were picked and pinned before the count", () => {
    const counts = countFolder(fixture);
    assert.equal(counts.records, 2);
    assert.equal(counts.dated, 2);
    assert.equal(counts.marked, 1);
    assert.equal(counts.placed, 1);
    assert.deepEqual(counts.pairs.map((p) => [p.replaced, p.by, p.reader]), [[OLD, NEW, "adr"]]);
    const base = { group: "archives", files: 1, records: 0, marked: 0, named: 0, placed: 0, stars: 1, present: 10 };
    const rows = Array.from({ length: 50 }, (_, i) => ({ ...base, repo: `o/r${i}`, records: i < 25 ? 0 : 6, marked: i < 15 ? 1 : 0 }));
    assert.equal(verdict(rows).median_records, 3);
    assert.equal(verdict(rows).passes, false);
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
    // The published run: every repository at its pinned commit, and RESULTS.md written from it.
    const file = readFileSync(join(bench, "repos", "RESULTS.md"), "utf8").match(/\((results\/[\d-]+\.json)\)/)[1];
    const published = json(`repos/${file}`);
    assert.deepEqual(published.repos.map((r) => [r.repo, r.commit]), repos.map((r) => [r.repo, r.commit]));
    assert.equal(readFileSync(join(bench, "repos", "RESULTS.md"), "utf8"), reposMd(published));
  });
});
