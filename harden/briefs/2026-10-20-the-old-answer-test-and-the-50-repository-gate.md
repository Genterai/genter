# The old-answer test and the 50-repository gate

Status: shipped
Request: the product owner (dan), 2026-10-20, accepting Genter's open-source plan: "по всему что предлагаешь" (on
everything you propose). This is steps 1.10 and 1.7 of that plan. 1.10, a gate before launch: run the readers on 50
popular repositories and publish the counts; it passes if the median repository has 5 or more decision records and 15
of 50 have an explicit replaced mark (if not, the hero leads with the hosted try page); pick the three archives for the
launch pages and for 1.7. 1.7, the old-answer test, the proof of the promise: inputs DriftBench's deprecated kind plus
two or three archives picked in 1.10; two arms, a plain ranking over the same sections (what an agent's grep finds: no
marks, no reordering) and Genter; counts "old answer first" and "old answer unmarked in the first five"; one question
per replaced/replacing pair, reviewed by a person and published; one command rebuilds the tables; losses published; if
plain ranking already puts the current answer first on 90% or more of the questions, the local picture is not the
lead. Memory-layer arms (mem0 and others) are step 3.5's, not this one's.

Intent: anyone can see, on public decision archives and with every loss listed, whether an agent's own ranking quotes
the replaced document and whether Genter does, and whether real repositories hold the records the readers need —
success: `node bench/repos/run.mjs` publishes per-repository counts for 50 public repositories at pinned commits and the
gate's verdict, and `node bench/old-answer/run.mjs` publishes both arms' counts over the same sections, its losses and
the plan's decision rule, the same numbers on every run.
Searched: `npx -y genter-cli@0.3 ask "how does DriftBench count old first on the deprecated kind, and which arms does
it have?"` (run from a folder outside the package with this worktree added as a source, because npx inside the
genter-cli package resolves to the local copy): `harden/redlines/driftbench.md` [old-first] and `bench/drift/README.md`
(old first, the index-once arm with two sections per place), the source of the plain arm's shape; `ask "which reader
reads a PEP header Superseded-By and a KEP status replaced"`: `readers/rfc/reader.json` (PEP and KEP globs; a PEP's
mark names a number, not a place) and the readers brief (the formats as their documents publish them).
Sources: `src/readers.js` (`loadReaders`, `readDocument`); `readers/*/reader.json`; `src/local.js` (`createLocal`,
`find`, `listFolder`, `readable`, `LIMITS`, current-first: a replaced place moves only for a replacing file inside the
project read in the search); `src/anchor.js` (`splitMarkdown`, now `pieces` and `blocks`); `src/lexical.js` (`bm25`,
`prepare`); `bench/drift/` (the deprecated kind, `applyChanges`, the index-once arm's two sections per place);
`.github/workflows/bench.yml`; `harden/redlines/{driftbench,local-search,readers}.md`; the 50 repositories, each at the
commit in `bench/repos/repos.json` on github.com (cited with URLs in `bench/repos/RESULTS.md`); stars from GitHub's
repository search API on 2026-10-20; codeload.github.com tarballs were refused by this session's proxy (403) while git
clones of public repositories went through, so the bench fetches with git.
Red lines: new area `old-answer` ([same-sections], [counts], [losses-published], [decision-rule],
[questions-reviewed], [one-command], [never-worse], [repos-gate]); driftbench/old-first stays true (genter 0 old first
on the deprecated kind, tested again here); local-search/* stay true (the engine's cut moved to `src/anchor.js` with no
change: DriftBench gives the same numbers); zero runtime dependencies (the benches use Node's built-ins and `git`).
Open:
* **The gate does not pass as shipped.** The median repository has 0 decision records the readers read (the adr and
  rfc readers read records in 4 of 50: python/peps 746, kubernetes/enhancements 691, cockroachdb/cockroach 183,
  jaegertracing/jaeger 32); 28 of 50 have an explicit replaced mark (15 needed). The records are there: by each group's
  own pattern the median repository holds 33, but in folders and forms no reader takes yet (Swift Evolution's
  `proposals/`, the `text/` of Rust's and React's RFCs, EIPs' front matter, NEPs, RFDs, PIPs…; RESULTS.md lists 28).
  By the plan, the hero then leads with the hosted try page. → Proposal: before step 1.9 decides the hero, a readers
  pull request (data only, outside harden's Sources: the rfc reader's globs and a status form for those folders), then
  `node bench/repos/run.mjs` again; the lead and the owner decide between that and the try page. [non-blocking here:
  this step publishes the measurement; the hero is step 1.9's]
* **The two gates point different ways.** Where documents do carry marks, plain ranking puts the current answer first
  on only 19 of 39 questions (49%, under 90%), so the local picture can lead on 1.7's rule; 1.10's rule says few
  repositories carry readable records today. Both results are published as they came. [non-blocking, for the lead]
* **The questions wait for a person.** The 34 archive questions were written by the agent that built the test, one per
  pair, each with its two documents, the mark that pairs them and what the replacing document says; all are
  `reviewed: pending owner`. The root README does not quote these numbers until they are reviewed (the README is step
  1.9's). [non-blocking, decided here]
* **A mark that names a number.** A PEP's `Superseded-By: 470` names PEP 470, not its file, so Genter shows the mark
  but cannot bring the replacing PEP first: all 7 of Genter's "old answer first" losses (plain ranking: 8). Turning a
  name into a place (`pep-0470.rst`) is a reader-language feature, a change to the readers schema with its own brief.
  → Proposal: a later step. [non-blocking]
* **Marks are per document.** Jaeger's RFC 0002 and RFC 0012 say only a part of them is superseded; Genter's mark is
  on the whole document, quoted as written, and RFC 0008 comes first for any question that finds them. The README of
  the test says so. [non-blocking]
* **The 50 were named by hand.** Three groups (18 decision archives, 1,000 stars or more; 16 projects with records in
  their own tree, 1,000 or more; 16 projects with deprecation notices in a changelog, 10,000 or more), most stars first,
  the first that pass a check on whether the records are in the tree. The first pick had two bugs in the check
  (Carbon's `p000024-…` names; Traefik's changelog over the engine's 1 MB limit), fixed before any count was taken.
  [non-blocking]
* **The same text for both arms.** A checkout is shallow and sparse: text documents, `kep.yaml` and changelogs, the
  files a reader can take, the same for both arms; code files are not in it. In 11 repositories the whole tree holds
  more than the engine's 5,000-file cap; RESULTS.md marks them. [non-blocking]
* **The engine's cut, shared.** `blocks` and the choice between it and `splitMarkdown` moved from `src/local.js` to
  `src/anchor.js` as `pieces` (not a package export), so the plain arm cuts sections with the engine's own code instead
  of a copy. No behaviour changes. [non-blocking, decided here]
* **Weekly.** The old-answer test joins the weekly `bench.yml` run with `--guard`; the 50-repository gate stays on
  demand (its numbers change only when the readers or the pinned commits do). `.claude/AGENTS.md`'s map does not list
  the new area yet. [non-blocking]
Proof: `test/old-answer.test.js` "[rl:old-answer/same-sections] [rl:old-answer/counts]": on a fixture ADR pair, plain
ranking puts ADR 3 (superseded) first and unmarked; Genter puts ADR 11 first and ADR 3 after it, marked; every passage
Genter returns lies inside a section the plain arm ranks, and both return the same places / "[rl:old-answer/one-command]
[rl:old-answer/never-worse] [rl:driftbench/old-first]": two offline runs give the same numbers; Genter 0 old first and
0 unmarked on DriftBench's deprecated kind, plain ranking leaves it unmarked; the guard holds /
"[rl:old-answer/losses-published] [rl:old-answer/decision-rule]": a loss is listed with its places and why; the rule
reads "can lead" under 90% and "not the lead" at 90% / "[rl:old-answer/never-worse]": the guard fails on an unmarked
old answer and on any question worse than plain ranking / "[rl:old-answer/questions-reviewed]": the archives are the
three the gate picked, at the commits it read; every question names its documents and pair and is "pending owner" /
"[rl:old-answer/repos-gate]": the readers' counts on the fixture, the gate's median and mark thresholds and the pick
order on made-up rows, the candidates' takes make 50 and run most stars first, repos.json pins 50, and RESULTS.md is
exactly what the published results give. / The runs: `node bench/repos/run.mjs` (50 of 50 read; does not pass: median
0 decision records read, 33 in the tree; 28 of 50 with a replaced mark, 7 with one naming a document there; picks
jaegertracing/jaeger, python/peps, kubernetes/enhancements); `node bench/old-answer/run.mjs --guard` (39 questions;
old answer first: plain 8, Genter 7; old answer unmarked in the first five: plain 31, Genter 0; current answer first:
plain 19, Genter 20; guard green). `npm test` (163 pass, 0 fail), `npm run lint` (exit 0; the one warning is the size
of `bench/drift/results/2026-10-10.json`, as on main), `node --test .github/scripts/test-report.test.mjs` (5 pass),
every export imports, the packed package installs alone and imports in a clean folder, `node bench/drift/check.mjs`,
`node bench/drift/run.mjs --no-takes --guard README.md` (green, the same numbers: genter 50 of 65 current and 0 stale
after the edits, deprecated 3 fresh · 0 stale · 0 old first; an index built once 24 old first), `node bin/genter.js
reader check`, `harden check`.

## Red lines after

- old-answer/same-sections (new)
- old-answer/counts (new)
- old-answer/losses-published (new)
- old-answer/decision-rule (new)
- old-answer/questions-reviewed (new)
- old-answer/one-command (new)
- old-answer/never-worse (new)
- old-answer/repos-gate (new)
