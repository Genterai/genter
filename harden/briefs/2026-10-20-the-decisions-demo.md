# The decisions demo

Status: shipped
Request: the product owner, 2026-10-20, accepting Genter's open-source plan as proposed: "по всему что предлагаешь"
(on everything you propose), and asking to carry it through to `main`. This is step 1.1 of that plan: rewrite
`npx genter-cli demo` into the decisions demo the README's GIF is recorded from. In a temp folder, offline, with no key,
in under half a second: ask "Can we deploy on Friday?" and get the runbook's answer with file and line; a newer doc
replaces the rule and the runbook says so at its top, without anyone telling Genter; ask again and get the new rule
first, dated, with the runbook's Friday line after it and its notice quoted, by the engine's own current-first and
quote behaviour; end with the one line that says what to run next, `npx genter-cli install`.

Intent: the first thing a person runs shows, in a few lines of plain text, what Genter is for: the answer that holds
now comes first and what it replaced says so in its own words — success: `npx genter-cli demo` prints, with no key, no
network and no color, a runbook answering at `RUNBOOK.md:29-31` (`dated 2026-03-12`), then (after a doc is added and the runbook marked, with
nothing told to Genter) `docs/release-process-v2.md:12-14` first, `replaces [2]` and `dated 2026-10-03`, and
`RUNBOOK.md:31-33` after it, dated, saying `RUNBOOK.md says at its top: "Superseded by Release process v2"`, then
`Next: npx genter-cli install`; it takes about 0.1 s here and a test fails past 0.5 s.
Searched: `npx -y genter-cli@0.3 ask "genter demo output and the cli demo red line"` (`harden/redlines/cli.md` [demo],
which described the old demo: an answer, an edit, the stale copy a memory would give, a replaced doc; the earlier brief
that changed [demo] to the replaced doc first, and the README's "How it resolves" section) and `npx -y genter-cli@0.3
ask "the doc that replaces a marked file comes first and the old one quotes its notice, with the date a document
gives"` (the red lines after that brief, `contract.md` [search-shape] for `dated <day>`, and `README.md:299-313`). Both
ran as genter-cli 0.3.0's `bin/genter.js` from a scratch install with its own `GENTER_HOME`: inside the repository
`npx genter-cli` resolves to the repository itself and answers "genter: not found". The engine's behaviour was then
read in `src/local.js` and run on the demo's two files.
Sources: `src/demo.js`, `src/local.js` (`find`: the sections found, `replacerOf` and `emit` for the current answer
first, `markOf` and `noticeAt` for the quote, `documentAt` and `dayOf` for the day a document gives; `findText`),
`src/drift.js` (`noticeWords`, `driftFacts`: `<place> says at its top: "<notice>"`), `readers/obsidian/reader.json` (the
front matter's `date:` is a document's day), `readers/banners/reader.json` and `rules/en.json` ("Superseded by" in the
first lines of a file marks it, the link beside it names what replaces it), `bin/local.js` (the `demo` command, which
stays as it is), `harden/redlines/cli.md`, `harden/redlines/local-search.md` ([current-first], [document-dates],
[reader-marks], [first-search-adds-folder], [reads-again]), `README.md` (the three lines that describe the demo),
`.github/workflows/test.yml`, `test/local.test.js` (`installed()` runs the command from the files the package ships).
Red lines: cli/demo (changed), cli/no-packages, cli/output-local, local-search/current-first, local-search/document-dates,
local-search/reader-marks, local-search/first-search-adds-folder, local-search/no-text-stored (all stay true: the demo
is the engine's own `find`, with nothing in it of its own); new: cli/demo-fast. Zero runtime dependencies stays true.
Decided:
* The story is the plan's step 1.1 as proposed and accepted: one question asked twice, a runbook that says Fridays are
  fine, a newer doc that says they are not, and a notice at the runbook's top that nobody told Genter about (the owner,
  2026-10-20, accepting the plan). The wording of the two narration lines is this step's, written to say only what the
  files show.
* Nothing in the demo is demo-only code: it writes its files (a runbook, the new doc, a `genter.json`) and calls `find` and `findText`, the engine behind
  `genter ask`, so the order, `replaces [2]`, the date and the quote are what a person gets on their own docs. The
  command shown, `genter ask "Can we deploy on Friday?"`, is the one they can type: no flag is hidden.
* The first search adds the folder (local-search/first-search-adds-folder), as it does for a person: the demo does not
  call `add`. The folder holds a `genter.json` (`{}`, written before the engine is created, which finds its project
  once), so it is a project of its own: the first search adds exactly the demo's folder, and a temp folder inside the
  person's repository, or under a `genter.json` of theirs, is never searched in its place (review of this PR: the
  demo had printed the files of the enclosing repository there, while saying "nothing of yours read").
* The runbook gives itself a day too, `date: 2026-03-12` in its front matter ("we decided it in March"), and the notice
  goes under the front matter, which is the top of a file that has one: the engine prints `dated 2026-03-12` on the
  runbook's passage in both answers, the old one's date beside its quoted notice, as the plan's row asks. The runbook's
  filler lost four lines so that its Friday section stays at line 29 (31 once the notice is on top).
* Line numbers are part of the picture, so the runbook has 35 lines (front matter included): its Friday section is in the middle, at line 29
  and, once the two notice lines are on top, at 31; the new doc's is at 12. A reader of that passage never sees the top.
* The notice is written as a Markdown quote with a link, `> Superseded by [Release process v2](docs/release-process-v2.md)`,
  the form a team writes; the quote Genter prints is the plain words, `Superseded by Release process v2`, as
  anchor-drift/quote-not-verdict says. The new doc's day is a front matter line, `date: 2026-10-03`, because that is
  where a document says it (local-search/document-dates); Genter prints it as `dated 2026-10-03`.
* Fewer than five files are written, so a fresh-clone notice never appears in a one-second folder.
* The old demo's edit of a port (Tuesday to Wednesday) and the stale copy "a memory that kept a copy" would give leave
  the demo: it tells one story. [reads-again] and [ac-changed-file] are proved by their own tests, and the stale copy's
  contrast belongs to the old-answer test (plan step 1.7).
* The last line is `Next: npx genter-cli install   # adds Genter to your AI tools; shows each change and asks first`,
  one line, as asked; Genter Cloud's address is no longer printed by the demo (the help and the README still give it,
  cli/help).
* No color: the output is plain text, so there is nothing for `NO_COLOR` to switch off, and a test checks that no
  escape character is printed.
* The time limit is asserted on the whole command, node's start included, as the median of three runs, so one slow
  moment of a shared runner does not fail it and a demo that is slow does. `npx` adds its own start in front.
* The CI job that installs the packed tarball in a clean folder now also runs `genter demo` from it, so a file the
  package forgot to ship (the readers or the rules) fails there and not on a person's first run.
* No version bump (plan, Phase 1): the demo reaches npm with the next minor.
Open:
* `genter decisions` (the decisions page, another step) is not named by the demo: this step's last line is the install
  command, as asked. Proposal: when the page ships, the README's GIF script (plan step 1.9) decides whether a second
  line names it [non-blocking]
* The engine prints a document's day as `dated 2026-10-03`; the plan's picture says "Oct 3". Proposal: leave the
  engine's form, which is the contract's (`dated <day>`); a friendlier form would change local-search/document-dates
  and contract/search-shape, not the demo [non-blocking]
* The README's first screen and `docs/hero.png` are step 1.9's; this step changes only the three README lines that
  describe the demo. Proposal: the GIF is recorded from this output after that step lands [non-blocking]
Proof: `test/local.test.js`, "the genter command" (the package as installed: `bin`, `src`, `rules`, `readers`, no
`node_modules`, no key in the environment): "[rl:cli/demo] [rl:local-search/current-first]" the whole output, character
for character (the answer at `RUNBOOK.md:29-31`, dated 2026-03-12, then the new doc at `docs/release-process-v2.md:12-14` with `replaces
[2]` and `dated 2026-10-03`, the runbook at `RUNBOOK.md:31-33` with its date and its notice quoted, the last line), stderr empty,
exit 0, no escape character, the temp folder it ran in empty after, the person's Genter home not made and the project
it ran in unchanged / "[rl:cli/demo]" with the temp folder inside a repository (a `.git`) that holds a doc answering
"Friday": the output is the same, character for character, and nothing of the repository is in it / "[rl:cli/demo]"
offline: a preloaded module makes `fetch`, a socket connection and a name lookup (the callback one and the engine's own,
`node:dns/promises`) throw and log (and a control program shows it catches each of the four, the lookup imported by
name as `src/net.js` does), and the demo prints the same and logs nothing /
"[rl:cli/demo-fast]" the median of three whole-command runs is under 500 ms (about 110 ms here). Each fails when its part
is undone (checked by hand: a `fetch` added to the demo, a name lookup of `src/net.js` added to it, a 600 ms wait, the
temp folder left behind, the `genter.json` not written, the hook without the `node:dns/promises` patch). Checks that
nothing else broke: `npm test` (170 pass), `npm run lint` (0 errors), `harden check`, the packed tarball installed in a
clean folder runs `genter demo` and prints the same text.

## Red lines after

- cli/demo (changed: offline on a temp folder it removes, a runbook answered, a newer doc replacing it unannounced, the
  new rule first and the runbook's notice quoted by `genter ask`'s own answer, the next command as the last line, plain
  text)
- cli/demo-fast (new: under half a second on CI hardware, node's start included)
