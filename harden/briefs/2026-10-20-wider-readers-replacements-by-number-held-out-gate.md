# Readers the gate missed, replacements named by number, a held-out gate

Status: shipped
Request: the product owner (dan), 2026-10-20, accepting Genter's open-source plan: "по всему что предлагаешь" (on
everything you propose). This is the follow-up to steps 1.2, 1.7 and 1.10 of that plan that their published results
asked for (`bench/repos/RESULTS.md` "What the readers miss", `bench/old-answer/RESULTS.md` "Losses", and the
old-answer brief's Open lines): the 50-repository gate failed because the readers took decision records in only 4 of
the 50 repositories although the records are there (a median of 33 by each group's own file pattern), and Genter lost 7
old-answer questions because a PEP's "Superseded-By: 470" names its replacement by number, not by file. The step: (1) a
readers schema extension, so that a manifest says how a replacement named by an id becomes a path in the same project
(ids bounded, resolved only inside the project, never an address), and the engine can put the replacing document first;
(2) data-only readers, with fixtures and expected output, for the formats bench/repos found most often (Swift
Evolution, Rust/React/Vue-style RFC folders, EIPs/ERCs, NEPs, RFDs, PIPs, KEPs' kep.yaml status and the other families
with two or more repositories); (3) the gate re-run on a held-out sample of new repositories picked by the same written
rule, committed before the readers run on it, with both samples published and the pass rule applied to the held-out
one; (4) the old-answer test re-run with before and after per question; (5) DriftBench's guard green.

Intent: the readers take the decision records real repositories keep, a replacement named by number brings the
replacing document first, and whether the readers generalize is measured on repositories they were not written for —
success: `node bench/repos/run.mjs` publishes both samples and the gate's verdict on the held-out one, at pinned commits,
with the held-out list committed (and pushed) before any reader ran on it; `node bench/old-answer/run.mjs --before …`
shows every question's first result before and after; Genter loses no old-answer question to a number.
Searched: `npx -y genter-cli@0.3 ask "how does a reader's mark name the document that replaces it, and how is it
resolved to a file in the project?"` (run from a folder outside the package with this worktree added as a source,
because npx inside the genter-cli package resolves to the local copy): `src/page.js` `decisionsOf` (a row's `by` is the
file of the project, else the name or the link the notice gives) and `src/local.js` `documentsOf` (a mark's link is
resolved to one of the project's files, else nothing), the two places an id's file now resolves; `ask "how were the 50
repositories of the gate picked, and what does the gate's verdict count?"`: `bench/repos/run.mjs` `verdict`,
`harden/redlines/old-answer.md` [repos-gate] and the old-answer brief (the rule written before any count, the check
looks only at whether the records are in the tree), the rule the held-out sample repeats.
Sources: `src/readers.js` (`lintReader`, `placeLint`, `fillPlace`, `findPlace`, `compileReader` records, `marksIn`);
`readers/reader.schema.json` (`records`, a mark's `id` and `place`); `readers/*/reader.json` with their fixtures and
`expected.json` (adr, rfc widened; pep, kep, eip, nep, rfd, pip, proposals new; decisions gains `records`);
`src/local.js` (`placeLink`, `replacedMark`, `documentsOf`); `src/page.js` (`decisionReaders`, `decisionsOf`);
`bench/repos/` (`candidates.json` `heldout`, `heldout.json`, `run.mjs` `treeOf`, `pick`, `resultsMd`, `README.md`);
`bench/old-answer/` (`run.mjs` `beforeOf`, `questions.json`, `README.md`); `harden/redlines/{readers,old-answer,
local-search,decisions-page,driftbench}.md`; the repositories, each at the commit in `bench/repos/repos.json` or
`bench/repos/heldout.json`, cited with URLs in `bench/repos/RESULTS.md`; stars from GitHub's repository search on
2026-10-20 (the queries are in candidates.json).
Red lines: new readers/by-id (a mark's id becomes a place by its manifest's template: bounded, inside the project, never
an address, hidden or secret-looking; the engine takes the one readable file there) and readers/records (a manifest
says whether its documents are decision records); old-answer/repos-gate amended (two samples, the verdict on the
held-out one, committed before the readers ran on it) and old-answer/one-command (`--before`); decisions-page/
explicit-only and local-search/current-first name the new paths without changing what they promise. Stay true:
readers/declarative, restricted-patterns, no-network, secrets-never-read, off-honoured, contract-tested (every new reader
has fixtures and expected output, checked by `genter reader check` and `test/readers.test.js` in CI);
local-search/current-first (a replacement is brought first only for a file inside the project this search reads);
old-answer/never-worse; driftbench/old-first; zero runtime dependencies; nothing in `src/` spawns a process.
Open:
* **The gate does not pass on the held-out sample.** The median of the 46 held out has 0 decision records read (9 of
  46 have 5 or more: 3 of 14 decision archives, 5 of 16 projects with records in their tree, 1 changelog project); 20
  of 46 have a replaced mark (15 needed), 10 a superseded or moved one, 6 one naming a document that is there. On the
  first 50, which the readers were widened looking at, the same readers read 5 or more records in 24 of 50 (4 before)
  and the median is 1: a biased number, and still short. The readers' file globs name the first 50's folders, so most
  held-out records are not reached at all (MCP's `seps/`, OTEPs, AIPs, Edge explainers, IPIPs, JEPs, PDEPs, MEPs,
  Neon's RFCs; RESULTS.md lists 21 repositories), and 18 of the 20 held-out repositories with a mark were marked by a
  fallback reader alone. By the plan, the hero leads with the hosted try page. → Proposal: readers that find decision
  records by what they say (a status or date header in a folder of numbered documents) rather than by folder names, a
  reader-language change with its own brief, then a new held-out sample picked the same way (this one has now been
  seen). [non-blocking here: this step publishes the measurement; the hero is step 1.9's, the lead and the owner decide]
* **The held-out sample holds 46, not 50.** Under the written rule only 14 decision archives with 1,000 stars or more
  outside the first 50 could be named and passed the check (graphql/graphql-spec has no `rfcs/` at its tip; Godot's
  proposals are issues). The rule was kept: the group takes 14 of 18 and the thresholds apply as written (the median
  of the 46, 15 repositories with a mark). candidates.json lists every archive named and the 17 left out as not of the
  kind, with why (the text of one specification such as tc39/ecma262, lightning/bolts or libp2p/specs, meeting notes,
  one proposal's own repository), decided before any reader ran on them. → The owner may prefer filling the four from
  those left out or from archives under 1,000 stars (dotnet/designs 944, emberjs/rfcs 801, grpc/proposal 782); either
  changes the rule, so it is not done here. [non-blocking, for the owner]
* **A third of each sample keeps no decision records by definition.** The changelog group holds none, so the median
  repository reaches 5 records only when half of all repositories, nearly all of the other two groups, have 5 or more
  read. RESULTS.md gives each group's median beside the verdict (first 50: archives 34, own tree 36.5; held out: 0 and
  0). The rule is the plan's and stays. [non-blocking, for the owner]
* **Marks a fallback reader takes that are not a document's own**, seen on the held-out sample: 354 of dotnet/runtime's
  359 marked files are generated test baselines whose comment says "Suppress warnings about [Obsolete] member usage";
  swiftlang/swift's `deprecated.md` is a list page whose heading is "Deprecated"; MCP's feature-lifecycle page names the
  Deprecated state. They change no verdict (each repository has genuine marks too), and fixing the banners reader after
  seeing them would bias this sample. → Proposal: the next readers pull request (a sentence about code, a list heading,
  a state's name are no mark of a document), measured on the next held-out sample; the old-answer brief's open banners
  issues (partial status lines, titles) still stand. [non-blocking]
* **One old-answer question was corrected after a run showed it.** peps/0241's replacing document, PEP 314, is itself
  "Superseded-By: 345" (and PEP 345 by 566), and PEP 345 renamed the fields the question asks about, so its current
  answer is now PEP 345 and PEP 566 (questions.json says why). The correction favours Genter: scored with PEP 314 as
  current, plain ranking puts it first and Genter puts PEP 566 first, a loss. RESULTS.md prints both scorings under
  "Before and after". [non-blocking: all questions wait for the owner's review]
* **One step of a chain.** Genter brings what replaces a document first, one step; a replacement that is itself replaced
  shows its own mark. On peps/0248 Genter's first result is now PEP 566, which replaces PEP 426, the document both arms
  ranked first (neither the old nor the current answer, so no count changes). → Following a chain inside the project,
  bounded, is a later step of local-search. [non-blocking]
* **The replacement named by an id, decided here.** The place is a template from the marked document's folder rather
  than a path from the repository's root, so a reader works wherever the archive sits in a project; the reader only
  fills it in, and the engine alone looks in the folder it names, with the same scope, off list and readability rules
  as everything it reads; a place that matches no file, or two, names nothing. It is a reader-schema change, its own
  red line, needing no new key, address or file on disk. [non-blocking, decided here]
* **Same check, lighter.** The pick check now reads tree listings and a changelog's text from a blobless clone instead of
  a sparse checkout (the same names, the same text), so a crawl of large repositories is cheap; nothing is checked out
  until a picked repository is read. `.claude/AGENTS.md`'s map still does not list the old-answer area. [non-blocking]
Proof: `test/readers.test.js` "[rl:readers/by-id] a mark's id becomes a place…": the PEP template gives `pep-0470.*`;
`{id}` as written, `{id:0N}` digits only; an id with `/`, `.`, `%` or over 32 characters names nothing; 18 templates
refused at lint, each saying why (absolute, home, drive, backslash, secret-looking, a climb in the middle or past 3, a
hidden folder, `*` in a folder, three `*`, no or two `{id}`, braces, `?`, an address), an id without its place and a
phrases mark with one refused / "[rl:readers/by-id] a place names one file…": without case, never two, never the
document itself, a hidden or secret-looking name, never above the project's root, a folder that cannot be listed gives
nothing / "[rl:readers/by-id] [rl:local-search/reader-marks] [rl:local-search/current-first] a PEP superseded by a
number…": through `createLocal().find`, PEP 57 comes right before PEP 42 and says "replaces [n]", the notice quoted;
PEP 61 not there and PEP 71 switched off bring nothing and the mark stays / "[rl:readers/records]": the readers of
decision records are the manifests that say so, never a fallback one, and `src/page.js` names no reader /
`test/page.test.js` "[rl:decisions-page/explicit-only] [rl:readers/by-id]": PEP 438's row says "replaced by
`peps/pep-0470.rst`", a number that leads to no file names the number / `test/old-answer.test.js`
"[rl:old-answer/repos-gate]" (two tests): both samples at their pinned commits, the held-out one none of the first 50,
none twice, each group at most its take and most stars first, the verdict on the held-out sample, RESULTS.md exactly what
the published results give; the pick takes the first that pass the check alone, skips the first 50 and a repository an
earlier group took, and says why for every one it does not take / "[rl:old-answer/one-command] an earlier run beside
this one…": what each arm put first then and now, and a corrected question scored both ways / `genter reader check`
(13 readers, every fixture as expected). The runs: the held-out list committed and pushed (a93d935) before
`node bench/repos/run.mjs --out bench/repos/results/2026-10-20-heldout.json --before bench/repos/results/2026-10-20.json`
(96 of 96 read; held out: does not pass, median 0, 20 of 46 with a mark; first 50: median 1, 30 of 50 with a mark, 12
naming a document there, picks python/peps, ethereum/EIPs, numpy/numpy); `node bench/old-answer/run.mjs --out
bench/old-answer/results/2026-10-20-by-id.json --md bench/old-answer/RESULTS.md --before
bench/old-answer/results/2026-10-20.json --guard` (39 questions; old answer first: plain 8, Genter 0, was 7; old answer
unmarked in the first five: plain 31, Genter 0; current answer first: plain 19, Genter 28, was 20 and 21; the 7 losses to
a number are gone, no loss left; guard green); `node bench/drift/check.mjs` and `node bench/drift/run.mjs --no-takes
--guard README.md` (green: genter 77% current and 0% stale after the edits, deprecated 3 fresh · 0 stale · 0 old first,
0 of 65 old first; an index built once 24). `npm test`, `npm run lint`, `harden check` (numbers in the pull request).

## Red lines after

- readers/by-id (new)
- readers/records (new)
- old-answer/repos-gate (changed: two samples, the verdict on the held-out one, committed before the readers ran on it)
- old-answer/one-command (changed: `--before` shows an earlier run question by question)
- decisions-page/explicit-only (changed: every document a reader of decision records reads, not only the adr and rfc
  readers')
- local-search/current-first (changed: what replaces a file may be the file its id names, readers/by-id)
