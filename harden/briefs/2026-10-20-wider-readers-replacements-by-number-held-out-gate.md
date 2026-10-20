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
one; (4) the old-answer test re-run with before and after per question; (5) DriftBench's guard green. Its last part,
the old-answer test's count for a chain of replacements (peps/0241), was decided by the plan's lead on 2026-10-20
(Decided, below) and built in this pull request.

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
looks only at whether the records are in the tree), the rule the held-out sample repeats; `ask "when a replacing
document is itself superseded, which document counts as the current answer in the old-answer test?"` (from a folder
outside the package, the worktree added): `bench/old-answer/RESULTS.md` "Losses" (peps/0241), `bench/old-answer/
README.md` "Limits" (a chain of replacements) and this brief's Open line on peps/0241, the question the decision answers.
Sources: `src/readers.js` (`lintReader`, `placeLint`, `fillPlace`, `findPlace`, `compileReader` records, `marksIn`);
`readers/reader.schema.json` (`records`, a mark's `id` and `place`); `readers/*/reader.json` with their fixtures and
`expected.json` (adr, rfc widened; pep, kep, eip, nep, rfd, pip, proposals new; decisions gains `records`);
`src/local.js` (`placeLink`, `replacedMark`, `documentsOf`); `src/page.js` (`decisionReaders`, `decisionsOf`);
`bench/repos/` (`candidates.json` `heldout`, `heldout.json`, `run.mjs` `treeOf`, `pick`, `resultsMd`, `README.md`);
`bench/old-answer/` (`run.mjs` `beforeOf`, `score`, `laterMissing`, `writtenOnly`, `losses`, `guard`, `resultsMd`;
`questions.json` `current_rule` and `later`; `README.md`; `.github/workflows/bench.yml`'s old-answer job); the current
documents of every old-answer question at the pinned commits, read by hand for marks of their own (python/peps
`peps/pep-0314.rst` line 12 "Superseded-By: 345", `peps/pep-0345.rst` line 12 "Superseded-By: 566"); `harden/redlines/{readers,old-answer,
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
driftbench/old-first; zero runtime dependencies; nothing in `src/` spawns a process; old-answer/never-worse holds again
(no loss with the chain rule), its guard now failing on any loss. old-answer/counts changed (a question's current
answer includes its chain, both counts published) and old-answer/questions-reviewed (`later`).
Decided:
* **A question's current answer includes its chain** (the plan's lead, 2026-10-20, under the product's principle
  "current over history", answering the peps/0241 Open line below): a question's current answer is its written
  `current` document or any later document reached from it by the archive's own explicit replacement marks (the same
  kind of mark the question's `pair` quotes, e.g. a PEP header "Superseded-By: 345"), for every question alike. The old
  answer stays the `replaced` document only, never current. The rule was set after a run
  (`bench/old-answer/results/2026-10-20-by-id.json`) showed one question affected, peps/0241, and RESULTS.md says so
  beside both counts, as written and with the chain, naming the question the chain takes out of the losses. The later
  documents are written by hand from the archive as `later` in questions.json, each with its mark's line quoted; the run
  checks each line as plain text at the pinned commit and stops if one is not there. They are never computed with
  Genter's own readers, which would make Genter grade itself.
* **Which questions have a chain.** Every question's current document was read at the pinned commits for a replacement
  mark of its own: two carry one, PEP 314 ("Superseded-By: 345") and PEP 345 ("Superseded-By: 566"), so peps/0241 has
  `later` PEP 345 then PEP 566, and peps/0314 has PEP 566. The other 26 current PEPs (PEP 566, the chains' end, among
  them; PEPs 699 and 749 mention a superseded or deprecated thing in their text, not a mark on themselves), KEP 1205,
  Jaeger's RFC 0008 and mcptools README, and DriftBench's four replacing pages carry none.
* **The guard fails on any loss.** `--guard` exits 1 when RESULTS.md lists a loss and 0 when it lists none: the old
  answer first, even marked and where plain ranking puts it first too, now fails it, beside the old answer unmarked in
  the first five and a count worse than plain ranking. Before, an old answer first that plain ranking also put first
  passed the guard.
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
* **peps/0241: a loss as written, none with the chain.** Its current answer, written before any run, is PEP 314, the
  document PEP 241's mark names. PEP 314 is itself "Superseded-By: 345", and PEP 345 "Superseded-By: 566" (PEP 345
  renamed the fields the question asks about). Now that those numbers lead to files, Genter follows the chain (below)
  and puts PEP 566 first, where plain ranking puts PEP 314: counted as written, Genter does worse than plain ranking on
  this question, and the by-id run's `--guard` failed on it. An earlier draft of this step changed the question's
  current answer after seeing that run; that was undone, and the question keeps the current answer it was written with.
  → Answered by the plan's lead on 2026-10-20 (Decided): the current answer includes the later documents of its chain,
  for every question alike, a rule set after that run and published as such. With it Genter puts the current answer
  first on peps/0241, RESULTS.md lists no loss, `--guard` passes and old-answer/never-worse holds; RESULTS.md keeps
  the count as written beside it (Genter 27 of 39 current first as written, 28 with the chain) and names peps/0241 as
  the one question the chain takes out of the losses. [non-blocking, answered]
* **Chains of replacements.** Genter follows replacements among the sections a search found (local-search/
  current-first, as before this step), each place once so two documents that name each other end: on peps/0241 it
  brings PEP 314, then PEP 345, then PEP 566 ahead of PEP 241. Only a replacement brought from outside the sections
  found stops after one step, its own mark showing. On peps/0248 Genter's first result is now PEP 566, which replaces
  PEP 426, the document both arms ranked first (neither the old nor the current answer, so no count changes).
  [non-blocking]
* **The replacement named by an id, decided here.** The place is a template from the marked document's folder rather
  than a path from the repository's root, so a reader works wherever the archive sits in a project; the reader only
  fills it in, and the engine alone looks in the folder it names, with the same scope, off list and readability rules
  as everything it reads; a place that matches no file, or two, names nothing. `{id}` may sit in a folder's name (one
  folder per document) as well as in the file's. Within one pass over a source's files the engine lists each folder a
  place leads to once, so marks named by number cost a warm search nothing it can measure. The adr reader's
  `{id:04}-*.md` names nothing in an `adr-NNN-*.md` folder (its own fixture's); widening it waits for the next readers
  pull request, so that the held-out run stays what these readers give. It is a reader-schema change, its own red line,
  needing no new key, address or file on disk. [non-blocking, decided here]
* **Same check, lighter.** The pick check now reads tree listings and a changelog's text from a blobless clone instead of
  a sparse checkout (the same names, the same text), so a crawl of large repositories is cheap; nothing is checked out
  until a picked repository is read. `.claude/AGENTS.md`'s map still does not list the old-answer area. [non-blocking]
Proof: `test/readers.test.js` "[rl:readers/by-id] a mark's id becomes a place…": the PEP template gives `pep-0470.*`;
`{id}` as written, `{id:0N}` digits only; an id with `/`, `.`, `%` or over 32 characters names nothing; `{id}` in a
folder's name accepted; 18 templates refused at lint, each saying why (absolute, home, drive, backslash, secret-looking,
a climb in the middle or past 3, a hidden folder, `*` in a folder, three `*`, no or two `{id}`, braces, `?`, an
address), an id without its place and a phrases mark with one refused / "[rl:readers/by-id] a place names one file…":
without case, never two, never the document itself, a hidden or secret-looking name, never above the project's root, a
folder that cannot be listed gives nothing / "[rl:readers/by-id] [rl:local-search/reader-marks]
[rl:local-search/current-first] a PEP superseded by a number…": through `createLocal().find`, PEP 57 comes right before
PEP 42 and says "replaces [n]", the notice quoted; PEP 61 not there, PEP 71 switched off, PEP 81 a link to a file
outside the project and PEP 91 left out by the project's genter.json bring nothing and the mark stays /
"[rl:readers/records]": the readers of decision records are the manifests that say so, never a fallback one, and
`src/page.js` names no reader / `test/page.test.js` "[rl:decisions-page/explicit-only] [rl:readers/by-id]": PEP 438's
row says "replaced by `peps/pep-0470.rst`", a number that leads to no file names the number / `test/old-answer.test.js`
"[rl:old-answer/repos-gate]" (two tests): both samples at their pinned commits, the held-out one none of the first 50,
none twice, each group at most its take and most stars first, the verdict on the held-out sample, RESULTS.md exactly
what the published results give; the pick takes the first that pass the check alone, skips the first 50 and a repository
an earlier group took, and says why for every one it does not take / "[rl:old-answer/repos-gate] [rl:readers/by-id] a
replacement named by a number counts as there…": `countFolder` pairs PEP 42 with PEP 57, and PEP 61, a link, is not
there / "[rl:old-answer/losses-published]": a loss to a chain its `later` does not name says so /
"[rl:old-answer/counts] a document later in the current answer's chain counts as current…": a later document first
counts as current and as written does not, the replaced document named again in a chain never counts, both counts
tallied and published, no loss and the chain question named / "[rl:old-answer/questions-reviewed]
[rl:old-answer/counts] every later document of a chain…": peps/0241 and peps/0314 alone have `later`, each entry in
chain order with one quoted line (a PEP's naming its number), and `laterMissing` finds a line that is there and
reports one that is not / "[rl:old-answer/never-worse] the guard fails a run on any loss…": the old answer first,
marked, where plain ranking puts it first too, fails it; a later document of the chain first does not /
"[rl:old-answer/one-command] the published RESULTS.md…": `--from` refuses a results file written before the chain
rule / "[rl:old-answer/one-command] an earlier run
beside this one…": what each arm put first then and now, and a corrected question scored both ways / `genter reader
check` (13 readers, every fixture as expected). The runs: the held-out list committed and pushed (a93d935) before `node
bench/repos/run.mjs --out bench/repos/results/2026-10-20-heldout.json --before bench/repos/results/2026-10-20.json` (96
of 96 read; held out: does not pass, median 0, 20 of 46 with a mark; first 50: median 1, 30 of 50 with a mark, 12 naming
a document there, picks python/peps, ethereum/EIPs, numpy/numpy); `node bench/old-answer/run.mjs --out
bench/old-answer/results/2026-10-20-by-id.json --md bench/old-answer/RESULTS.md --before
bench/old-answer/results/2026-10-20.json --guard` (39 questions; old answer first: plain 8, Genter 0, was 7; old answer
unmarked in the first five: plain 31, Genter 0; current answer first: plain 20, Genter 27, was 20 and 21; the 7 losses
to a number are gone; one loss, peps/0241, to a chain: the guard failed on it); then, with the chain rule, `node
bench/old-answer/run.mjs --cache <the archives already fetched> --out bench/old-answer/results/2026-10-20-chain.json
--md bench/old-answer/RESULTS.md --before bench/old-answer/results/2026-10-20.json --guard` (exit 0; every
question's places, first results, Genter's first five and the sections per source identical to the by-id run's, only
the scoring changed: current answer first, plain 20 and Genter 28 with the chain, 20 and 27 as written; in the first
five plain 32 and Genter 35 both ways; old answer first plain 8, Genter 0; unmarked in five plain 31, Genter 0; no
loss; counted as written, Genter would do worse on peps/0241 alone); `node bench/drift/check.mjs` and
`node bench/drift/run.mjs --no-takes --guard README.md` (green: genter 77% current and 0% stale after the edits,
deprecated 3 fresh · 0 stale · 0 old first, 0 of 65 old first; an index built once 24). Warm searches of python/peps at
its pinned commit: 51 to 64 ms with a folder listed once per pass, 88 to 105 ms when each mark listed it. `npm test`,
`npm run lint`, `harden check` (numbers in the pull request).

## Red lines after

- readers/by-id (new)
- readers/records (new)
- old-answer/repos-gate (changed: two samples, the verdict on the held-out one, committed before the readers ran on it)
- old-answer/one-command (changed: `--before` shows an earlier run question by question)
- decisions-page/explicit-only (changed: every document a reader of decision records reads, not only the adr and rfc
  readers')
- local-search/current-first (changed: what replaces a file may be the file its id names, readers/by-id)
- old-answer/counts (changed: a question's current answer is its written current document or a later one its chain of
  the archive's own marks leads to, listed by hand as `later`; both counts published)
- old-answer/questions-reviewed (changed: `later`, the later documents of a chain in order, each mark's line quoted)
- old-answer/never-worse (changed: the current answer counted with its chain, and `--guard` fails on any loss; it holds
  again)
