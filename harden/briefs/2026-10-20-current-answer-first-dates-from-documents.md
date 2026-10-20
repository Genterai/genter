# Current answer first, dates from documents

Status: shipped
Request: the product owner (dan), 2026-10-20, accepting Genter's open-source plan: "по всему что предлагаешь" (on
everything you propose). This is steps 0.4 and 0.5 of that plan. 0.4, the current answer first, worded as a quote: what
replaces a found place becomes [1] and the replaced one follows under "<file> says at its top: '<notice>'"; the order
changes only when both places are inside the project and the notice comes from a decision record or a deprecation
banner, otherwise the mark shows and the order stays; no mark is Genter's own verdict; DriftBench gains an "old first"
column. 0.5, dates without git: a decision's date comes from the document (an ADR's `Date:`, a CHANGELOG heading, front
matter, as the readers read them); when a folder's file times sit within seconds of each other (a fresh clone), Genter
says "file dates unknown (fresh clone)" instead of using clone times, and no age fact fires. The four `src/drift.js`
exports only the removed apps engine used go too (`harden/briefs/2026-10-20-local-engine-only.md`, Open).

Intent: an agent that searches a project sees the answer that holds now before the one it replaced, each in the words
its file uses, with the date the document gives itself, and never a date that is only the moment of a clone — success:
a runbook that says at its top "Deprecated: replaced by [Deploy v2](deploy-v2.md)" answers `[1] ops/deploy-v2.md ·
replaces [2]`, then `[2] ops/deploy.md` with `ops/deploy.md says at its top: "Deprecated: replaced by Deploy v2"`; the
same notice planted in a folder outside the project moves nothing; DriftBench's deprecated kind has 0 questions whose
first passage is the replaced answer (1 of 5 before), with the README's tables unchanged; in a repository cloned in one
moment an ADR shows `dated 2026-03-03 · file dates unknown (fresh clone)`, its mark names the replacing ADR on that
ADR's own `Date:`, and no "source last changed" fact appears.
Searched: `npx -y genter-cli@0.3 ask "replaced place brings what replaces it right after it, replaces [n]"` (run from a
folder outside the package with this worktree added as a source, because npx inside the genter-cli package resolves to
the local copy): `harden/redlines/local-search.md` [follow-replaced] and `README.md` ("brings v2 right after it");
`ask "file dates mtime source_at fresh clone date of a document"`: `test/contract.test.js` ("a fresh clone's dates are
another step's", file times set by hand), `src/local.js` (`describeFile`: a file's date is its mtime) and
`src/drift.js`; `ask "demo replaced doc runbook v2"`: `src/demo.js` and the README's quickstart, which show the order.
Sources: `src/local.js` (`find`: the order of the results, `markOf`, `readWhole`, `result`, `findText`); `src/drift.js`
(`driftFacts`, `supersededOf`); `src/mcp-server.js` (`metaLine`, `markText`, the instructions); `src/readers.js`
(`readDocument`: `date`, the line of each mark); `readers/*/reader.json` (which readers give document-level marks: adr,
rfc, decisions, banners, obsidian); `src/conformance.js` (`MARKS.superseded` needs a day); `src/demo.js`;
`bench/drift/run.mjs`, `bench/drift/report.mjs`;
`harden/redlines/{local-search,anchor-drift,contract,cli,driftbench}.md`; `harden/briefs/2026-10-20-readers-v1-for-text-formats.md` (what readers read is never stored; "what step 0.5 keeps is
that step's decision"); `harden/briefs/2026-10-20-local-engine-only.md` (the four exports); `package.json` (`exports`:
`src/drift.js` is not one, so no library user imports it).
Red lines: new local-search/current-first and local-search/document-dates; local-search/follow-replaced and
local-search/ac-replaced change (what replaces a place comes before it, and only as current-first says); new
anchor-drift/quote-not-verdict and anchor-drift/fresh-clone, anchor-drift/facts-on-deviation changes (the quote form,
dates the sources give, no area clause: nothing local has an area); contract/search-shape and contract/marks change (a
document's date, "file dates unknown (fresh clone)", a mark's day the replacing place's own, `at line <n>`, the notice
in plain words; the conformance fixture is unchanged and passes); cli/demo changes; new driftbench/old-first;
local-search/no-text-stored stays true (dates and quotes are read with the text, the store gains no field);
local-search/project-scope, contract/read-scope and readers/off-honoured stay true (a date is read only from a place
this project reads); zero runtime dependencies.
Open:
* The contract's `⚠ superseded by [id] on <day>` needs a day (`src/conformance.js`), and in a fresh clone a replacing
  file with no date of its own has none. → Then the mark is the contract's other form, naming the place:
  `⚠ marked as replaced by docs/release-process-v2.md at its top: “…”`; the replacing place still comes first with
  `replaces [id]` on its second line, so the agent has its id. No new form, the fixture unchanged; Genter Cloud always
  has a day. The lead may prefer another wording before this reaches a release. [non-blocking, decided here]
* Which notices change the order: a document-level mark from any reader in `readers/` (adr, rfc and decisions read a
  record's status; banners a notice at the top; obsidian front matter such as `status: superseded` or `superseded_by:`,
  the document's own status too). The language rules' phrases at the top of a file no reader takes (code files) and
  pages never change it. [non-blocking, decided here]
* "Becomes [1]": what replaces a place takes that place's rank, which is [1] when the replaced place ranked first;
  when it already ranks above, nothing moves and it says `replaces [n]`. Two places that name each other end after one
  step. [non-blocking, decided here]
* A fresh clone, read file by file: the largest run of a source's file times each within 2 seconds of the one before,
  holding at least 5 files and at least half of them. A folder of fewer than five files keeps its file times (two files
  saved at once are no evidence); a file changed after the clone keeps its own; a `git pull` that rewrites most files is
  read the same way, since its times are the pull's. Nothing new is stored: the window is worked out from the stored
  times at each answer. [non-blocking, decided here]
* Age facts stay on file times: a document's date is when it was decided, not when it last changed, so it is shown
  (`dated <day>`) but says no age. [non-blocking, decided here]
* The notice is quoted in plain words, in the CLI and over MCP (`Deprecated: replaced by Release process v2`, not
  `> **Deprecated:** replaced by [Release process v2](release-process-v2.md)`), as the plan's own example reads; the
  MCP mark keeps its form. A line that is only signs stays as written. [non-blocking]
* `genter ask` says "File dates unknown (fresh clone)" once, above the places (it shows no file dates per place); MCP
  says it per place on the second line, where `updated <day>` would be. [non-blocking]
* A page's mark day is the replacing page's Last-Modified, else when Genter saw it change; before, the replaced
  place's own date could stand in for it. [non-blocking]
* `src/drift.js` also loses `sourceDates` and `toMs` (only `signalsOf` and `areaStats` used them) and the area clause
  of `driftFacts` (only `areaStats` fed it); grep finds no other importer in `src/`, `bin/`, `bench/` or `test/`.
  [non-blocking]
* The README's tables are not rewritten: the run gives the same numbers, and "old first" is in the full report and the
  guard only, since the README's table holds rows of a run with keys whose passages were not kept. [non-blocking]
Proof: `test/local.test.js` "[spec:local-search/ac-replaced] … [rl:local-search/current-first]
[rl:anchor-drift/quote-not-verdict]": Deploy v2 is [1] with `replaces [2]`, the runbook [2] with its notice quoted in
plain words, and no fact says old, replaced or current outside the quote / "[rl:local-search/current-first] …
promotes nothing": a planted "Superseded by" in a folder outside the project naming a place inside it, a project file
whose replacement is outside the folder, and a code file's top notice no reader reads each show their mark, nothing
replaces anything and the answer stays in score order; the same notice inside the project then moves v2 first /
"[rl:local-search/document-dates] [rl:anchor-drift/fresh-clone]": a repository cloned in 2019 within a second, one file
edited today: the ADR shows its `Date:`, a CHANGELOG its latest heading, front matter its `date:`, the clone's files no
file date, the edited one today's, no age fact, the CLI's line, and over MCP `dated 2026-09-24 · file dates unknown
(fresh clone) · replaces [n]` with `⚠ superseded by [n] on 2026-09-24` / "[rl:anchor-drift/fresh-clone]
[rl:anchor-drift/facts-on-deviation]": files written a day apart keep their dates and an old one beside today's says
its age / `test/contract.test.js` "a fresh clone": conformance passes, the free form when the replacing file has no
day, `at line 9` for an ADR's Status, `dated` on search and read; the conformance test sees v2 right before the
runbook and the plain quote / `test/drift.test.js`: `cloneWindow` (five files, half, the gap, a later edit outside),
`noticeWords`, the quote form / `test/driftbench.test.js` "[rl:driftbench/old-first]": genter 0 old first on the
deprecated kind and overall, an index built once more, and the guard fails a run with one / `test/readers.test.js`:
ADR 11 right before ADR 3 / the demo shows the new runbook first. Each fails when its part is undone (checked by
hand: no project-folder check, no reader check, no clone check, the file time instead of the document's date for a
mark's day, the old order, raw quotes). / `npm test` (148 pass, 0 fail), `npm run lint` (exit 0; the one warning is
the size of `bench/drift/results/2026-10-10.json`, as on main), `node bin/genter.js reader check` (6 readers and the
rules ok), `node bench/drift/run.mjs --no-takes --guard README.md` (green; the same tables: 77% current and 0% stale
after the edits, deprecated 3 fresh · 0 stale · 0 old first, 1 old first before; an index built once 24 of 65 old
first), the packed package imports every export in a clean folder, `harden check`.

## Red lines after

- local-search/current-first (new)
- local-search/document-dates (new)
- local-search/follow-replaced (changed: what replaces a place comes before it, only as current-first says)
- local-search/ac-replaced (changed: Deploy v2 first, the doc after it quoting its notice)
- anchor-drift/quote-not-verdict (new)
- anchor-drift/fresh-clone (new)
- anchor-drift/facts-on-deviation (changed: the quote form, dates the sources give, no area clause)
- contract/search-shape (changed: `dated <day>`, `file dates unknown (fresh clone)`, current first)
- contract/marks (changed: the day is the replacing place's own or the free form, `at line <n>`, plain words)
- contract/ac-two-tools (changed: v2 first, the plain quote)
- cli/demo (changed: the new runbook first, the old one quoting its notice)
- driftbench/old-first (new)
