# Readers v1 for text formats

Status: shipped
Request: the product owner (dan), 2026-10-20, accepting Genter's open-source plan: "по всему что предлагаешь" (on
everything you propose). This is step 1.2 of that plan: readers v1 for text formats, the declarative unit contributors
add without touching the core, with the mark phrases moved from code into language rules, `genter reader new`, and the
schema and interpreter as a red-line area of their own while `readers/` and `rules/` stay outside harden's Sources
(the plan's decision on contribution terms: manifests need no brief, CI is their brief).

Intent: what a document says about itself (its date, its status, and that it or a part of it is superseded,
deprecated or removed, with the place that replaces it) is read by readers that are data, never code, and the engine
uses them for its explicit marks — success: an ADR whose Status section, past its first lines, says "Superseded by
[11. …](0011-….md)" is marked as replaced and brings ADR 11 right after it, while the same words in a plain doc's
middle mark nothing; `anchor.document` shows the date and status a file gives itself; six first-party readers (ADR,
CHANGELOG, banners, RFC folders, decision logs, Obsidian front matter) pass their contract tests; a manifest with `(a+)+`,
a backreference, a `url` key or a glob that reaches `*.pem` is refused saying where; "устарело" now marks; DriftBench
gives the same numbers.
Searched: `npx -y genter-cli@0.3 ask "replaced mark superseded deprecated at the top of a document"` (run as the
repository's own `bin/genter.js ask` with a `GENTER_HOME` of its own, because npx inside the genter-cli package
resolves to the local copy): `test/drift.test.js` ("finds a mark at the top of a document"), `src/drift.js:52-66`
(the phrases as JavaScript regular expressions) and `src/local.js` (`replacedMark`, `localLink`); then `ask "decision
with a date docs/decisions.md heading per decision replaced page"`: `README.md` and `examples/project/README.md`
("A new project": one heading per decision with a date, and `> Deprecated: replaced by [v2](v2.md)`), which the
readers now read as data.
Sources: `src/drift.js` (`supersededOf`, the phrase table it held); `src/local.js` (`readFile`, `describeFile`,
`replacedMark`, `result`); `bin/local.js` (the commands, the help); `test/drift.test.js`, `test/local.test.js`
(ac-replaced, the demo); `harden/redlines/local-search.md` [follow-replaced] [private-key-skipped] [person-off-wins]
[no-text-stored]; `harden/redlines/security.md` [never-run]; `harden/README.md` ("The first change there [src/drift.js]
writes that area's red lines from its tests"); `bench/drift/` (the guard); `.github/workflows/test.yml` (the packed
package); the formats as their own documents publish them: Michael Nygard's "Documenting Architecture Decisions" and
adr-tools (`## Status`, "Superseded by [n. title](file)"), MADR 2 (`* Status:` bullets) and MADR 3–4 (front matter
`status: "superseded by [ADR-0005](0005-example.md)"`, `date:`), Keep a Changelog 1.1.0 (`## [x.y.z] - YYYY-MM-DD`,
`### Deprecated`, `### Removed`), conventional-changelog headings, PEP 1's header (`Status:`, `Created: DD-Mon-YYYY`,
`Superseded-By:`), the Rust RFC template (`- Start Date:`), the KEP template (`kep.yaml`: `status`, `creation-date`),
Obsidian properties (front matter), GitHub alerts, MkDocs and Docusaurus admonitions, Sphinx's `.. deprecated::`; Russ
Cox, "Regular Expression Matching: the Virtual Machine Approach" (the Pike machine the patterns run on).
Red lines: new area `readers` ([declarative], [restricted-patterns], [no-network], [secrets-never-read],
[off-honoured], [language-rules], [contract-tested], proof [ac-reader]); new area `anchor-drift` from the tests of
`src/drift.js`, as `harden/README.md` asks of the first change there ([top-marks], [mark-link], [facts-on-deviation]);
local-search/reader-marks (new); cli/reader-commands (new) and cli/no-packages (widened to `reader`);
local-search/follow-replaced, local-search/private-key-skipped, local-search/person-off-wins and
local-search/no-text-stored stay true (what readers read is not kept in the store), security/never-run stays true (no
manifest pattern ever reaches JavaScript's RegExp), and no runtime dependency is added.
Open:
* A manifest's patterns could have gone to JavaScript's RegExp after a lint. → They run on a small machine of their own
  in `src/readers.js` that keeps every way at once (a Pike machine), so even a pattern that passes the lint but is
  ambiguous (`(?:a|a){1,200}`) is linear in the line; the lint still refuses what the plan names (nested quantifiers,
  backreferences, lookarounds, unbounded repeats) and caps a pattern at 300 characters and 2,000 steps. Its worst case
  is about 26 ms for a 400-character line; first-party patterns skip most lines on a literal they must contain.
  [non-blocking, decided here]
* "Nested quantifiers refused" is read strictly: `?` on a group that holds a repeat is refused too, so an optional
  part of variable length is a second rule (rules are tried in order). [non-blocking, decided here]
* The old phrases used JavaScript's `\w`, which is ASCII, so the Russian endings they were written for ("устарело",
  "устаревший", "заменены", "перенесена") never matched. → The language's `\w` and `\b` know every alphabet and the
  rules take those endings; every English phrase marks what it marked before (the drift tests and DriftBench are
  unchanged). [non-blocking]
* What the readers read (date, status) is shown as `anchor.document` but kept only with the text the process read,
  never in the sealed store; what step 0.5 keeps is that step's decision. The replaced mark keeps its line and the
  reader that found it in the store (a number and a name, beside the marker it kept before). [non-blocking]
* When several readers take a file (an ADR is also Markdown), format readers answer first and the fallback ones
  (banners, front matter) after; the date and status are the first reader's that has them, and the engine's mark is
  the first that names what replaces it. [non-blocking, decided here]
* An Obsidian wiki link (`superseded_by: "[[Release process v2]]"`) gives the note's name, not its place, so it is
  marked but not followed yet. [non-blocking]
* The package now ships `readers/reader.schema.json`, `readers/*/reader.json` and `rules/*.json` (not the fixtures),
  and exports `genter-cli/readers`, as the plan's list of exports says. [non-blocking]
* `.claude/AGENTS.md`'s map and `CONTRIBUTING.md`'s split into core and manifests are the plan's step 1.9; this step
  adds only a short "Readers and language rules" section to CONTRIBUTING. [non-blocking]
Proof: `test/readers.test.js`: the lint refuses `(a+)+`, `(a{1,3}){1,3}`, backreferences, lookarounds and the rest
with where, the machine matches as JavaScript would on the shared cases and stays linear on an ambiguous pattern; every
manifest lints, a key outside the schema, a network field, code, an instruction or an address is refused; a glob that
reaches a secret-looking file is refused and the interpreter refuses such a path whatever a glob says; each language
phrase marks its own lines and none of its misses (one test per phrase); per reader, its fixtures give exactly
`expected.json`, blanking a line it read changes that, the engine reads its fixtures with it but never one switched off,
and secret-looking files beside them are never read; an ADR marked in its Status section past its first lines is
followed by ADR 11, the same words outside an ADR folder mark nothing; `anchor.document` changes with the file and is
not in the store; `genter reader new` then `check` pass, a `url` key or `(a+)+` fails, a drifted fixture fails. Each
fails when its part is undone (checked by hand: the interpreter's secret check, the glob's secret check, `+` accepted,
nested repeats accepted, network keys accepted, the engine ignoring readers' marks). / `npm test`, `npm run lint`,
`node bin/genter.js reader check`, `node bench/drift/run.mjs --no-takes --guard README.md` (same tables; median search
2 ms against 3 on main), the packed package imports `genter-cli/readers` and loads 6 readers and 10 phrases in a clean
folder, `harden check`.

## Red lines after

- readers/declarative (new)
- readers/restricted-patterns (new)
- readers/no-network (new)
- readers/secrets-never-read (new)
- readers/off-honoured (new)
- readers/language-rules (new)
- readers/contract-tested (new)
- readers/ac-reader (new)
- anchor-drift/top-marks (new: its tests already held it)
- anchor-drift/mark-link (new: its tests already held it)
- anchor-drift/facts-on-deviation (new: its tests already held it)
- local-search/reader-marks (new)
- cli/reader-commands (new)
- cli/no-packages (widened to `reader`)
