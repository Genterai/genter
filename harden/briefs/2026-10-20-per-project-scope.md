# Per-project scope

Status: shipped
Request: the product owner (dan), 2026-10-20, accepting Genter's open-source plan: "по всему что предлагаешь" (on
everything you propose). This is step 0.3 of that plan: per-project scope.

Intent: Genter answers in a project only from that project and the person's notes — success: after `genter ask`
answered "port 6432" from repository A, the same question in repository B (`genter ask`, `genter mcp`, the library's
`find`) answers nothing from A; a `genter.json` that names `~/`, `../` or a path outside its project is refused with a
plain message and nothing from it is used; the person's `off` list holds in every project; a 0.3 store is split once
and keeps its ids and digests, so the first search after the upgrade finds nothing new or changed.
Searched: `npx -y genter-cli@0.3 ask "where does the first search add the current folder, and which sources does a
search read?"` (run as genter-cli 0.3.0's `bin/genter.js ask` with its own `GENTER_HOME`, because npx inside the
genter-cli package resolves to the local copy): `harden/redlines/local-search.md` [first-search-adds-folder], the
README's Commands table, the help in `bin/local.js` and `src/local.js:391-411` (`find` adds the current folder only
while no source exists, then reads every source). Then the same 0.3.0 with the same home, asked a question about this
repository from a second folder (`projB`, one README): it answered from `/home/user/wt-g-project-scope/harden/...`, did
not add `projB`, and `genter sources` listed only this repository: the leak reproduces on 0.3.
Sources: `src/local.js` (`createLocal`: `load`, `addSource`, `readFiles`, `vectorsOf`, `add`, `sources`, `forget`,
`find`; `listFolder`, `localSecret`), `src/mcp-server.js` (`callTool`), `bin/local.js`, `src/anchor.js` (`recipeId`, the
anchor id that must not change), `bench/drift/run.mjs` and `bench/drift/takes.mjs` (how the benchmark makes its
store: `cwd` is the temp folder that holds the corpus), `src/demo.js`, `examples/answer-with-sources.mjs`, `README.md`
(`genter_add` "a sibling repository, a vendor's API docs"; `.mcp.json` runs `genter-cli mcp .`), `test/local.test.js`,
`test/mcp-server.test.js`; git's own rule that a repository's root holds `.git` (a folder, or a file in a worktree or
submodule).
Red lines: local-search/first-search-adds-folder (changes: the project's folder), local-search/forget (changes: per
project), local-search/notes-are-the-persons (every project), local-search/ids-stable, local-search/no-text-stored and
local-search/private-key-skipped stay true; new local-search/project-scope, local-search/repo-config-narrows,
local-search/person-off-wins, local-search/store-split, local-search/ac-other-project; cli/output-local (what Genter
did on stderr), cli/local-mcp-tools (the same four tools), cli/config-private (0600) and driftbench/offline stay true;
zero runtime dependencies and security/never-run stay true.
Decided:
* The project rule. Walking up from the folder the command runs in (or the folder given to the library), the first
  folder that holds a `genter.json` file or a `.git` (folder or file) is the project's root; with neither, the folder
  itself. "The nearest genter.json, else the nearest .git" is read as the first of either on the way up: a
  `genter.json` nearer than the `.git` makes a folder inside a repository its own project, and a `genter.json` above a
  repository (say in `~/code`) does not take in the repositories under it. The home folder and the root are never
  found by walking up, even with a `.git` (a dotfiles repository) or a `genter.json` there: everything a person has is
  under them. A folder named `genter.json` is no marker. (plan step 0.3)
* What a project searches: its own sources, the person's notes, and websites kept from 0.3 (below). A source belongs to
  the projects it was added in: `genter add ../shared-docs` from A makes A read it, which is the person's own choice
  (the README's "a sibling repository"); the same folder can belong to several projects, and `forget` removes it from
  the project it runs in, dropping it and its anchors only once no project has it. `sources` and the MCP
  `genter_sources` start with the project and how it was found. (plan step 0.3)
* The first search in a project with nothing added adds the project's root folder, not the subfolder asked from (asked
  from `src/`, the whole repository answers), never the home folder, the root, or a folder the person switched off.
  (plan step 0.3)
* `genter.json`: `{"include": [...], "exclude": [...], "off": [...]}`, each a list of paths inside the project,
  relative to its root. `include` keeps only what is under its entries, `exclude` and `off` leave out what is under
  theirs; locally both mean "not read", and `off` is the name the person's list shares. An entry starting with `~`,
  holding a `..` step (even one that lands back inside), or resolving outside the root, a key that is not a list of
  strings, or a file that is not a JSON object, refuses the whole file: "genter.json is not used: "../b" in "include"
  is outside the project. A project's genter.json can only name paths inside the project, to narrow what Genter reads
  there." `ask` and `add` print it on stderr, `genter mcp` at its start, `sources` under the project line, and it comes
  first in the MCP answer; the project then reads as if there were no `genter.json`, the person's own `off` list still holding.
  Unknown keys are ignored (they can add nothing). A place a `genter.json` leaves out is neither read nor marked gone,
  so narrowing never reports "is gone". (plan step 0.3)
* The person's `off` list: `"off": [paths]` in `~/.genter/config.json` (absolute, `~/…`, or relative to the home
  folder). It holds in every project and before any `genter.json`: those places are never read, their anchors (title,
  headings, dates, digest) leave the store at the next search, `genter add` of one is refused, and no `include` brings
  one back. A list that is not strings stops the search with a message rather than reading what the person meant to
  switch off. (plan step 0.3)
* A `config.json` that is not a JSON object now stops Genter with a message. Before, `localSecret` read it as `{}` and
  wrote a new secret over it, so a typo made while adding `off` by hand would have lost the off list and the secret
  that opens the store. (this brief, needed by the off list)
* The 0.3 store split. On first open, a store whose state is not `v: 2` is split and saved at once: each folder source
  goes to `projectOf(its folder)`, each file source to `projectOf(its file's folder)`; a source outside any project is
  thereby a project of its own folder and answers when Genter runs in that folder (not in its subfolders, which are
  their own projects; a `genter.json` at its top makes one project of it). Websites stay in every project, as they were
  in 0.3: nothing records where they were added, and a public page cannot carry one project's data into another; one
  added from now on belongs to the project it was added in. Notes stay the person's own, in every project, with their
  dates. Sources and anchors keep their ids, digests and dates; the split only adds `projects` (or `everywhere`) to
  each source, inside the seal. A second open writes nothing. (plan step 0.3)
* Vectors (with `--semantic`) stay one cache keyed by content; the cache keeps every key that some project's last
  search used, so a search in a small project no longer drops a large project's vectors and makes it pay to embed
  them again. (this brief)
* No version bump: 0.4.0 is raised once Phase 0 is done (plan, Phase 0).
Open:
* The person's `off` list names paths, not website addresses: a website is switched off with `genter forget <url>`,
  and a crawl is not filtered by address. → Address entries in a later step (plan step 1.2). [non-blocking]
* There is no command to edit the `off` list; the person edits `config.json` by hand (the README says how). → A
  command if people ask for one. [non-blocking]
* The MCP tool `genter_add` lets the agent add a folder outside the project to it, as the person can. → Plan step 1.6,
  which changes the local MCP tools. [non-blocking]
* "Since the last look" is kept per place, not per project: a change one project's search has seen is not reported
  again by another project that reads the same place. → Kept; places shared by two projects are rare. [non-blocking]
* A project's folder listing still reads a repository nested inside it (`~/code` added as a folder reads
  `~/code/A`); from inside `~/code/A` only A answers. → Kept: the person added the outer folder. [non-blocking]
* Vectors kept by a 0.3 store are not attributed to projects, so the first search by meaning in one project can drop
  another project's old vectors once; that project embeds them again at its next search by meaning. → Accepted, one
  time. [non-blocking]
Proof: `test/local.test.js` "[rl:local-search/project-scope] from project B, a question whose answer lives only in
project A finds nothing from A": two repositories and one home; A answers 6432 from `a/docs`; B's `find` and B's MCP
`genter_find` answer nothing from A, B's `genter_sources` does not list A, and a note kept in A answers in B with its
date. It fails on main at 07ec51b ("The input was expected to not match the regular expression /6432/", B answered
A's staging section) and passes here, the same test file run against both trees / "[rl:local-search/project-scope]
[rl:local-search/ac-other-project]": the installed package, `genter ask` in A, then `genter ask` and `genter mcp` in B
answer nothing from A / "[rl:local-search/project-scope] a project is the nearest folder up…": `.git` folder and file,
a `genter.json` inside a repository, one above a repository, a folder named `genter.json`, a home folder holding `.git`
and `genter.json` / "[rl:local-search/repo-config-narrows]": include, exclude and off narrow to one file and report
nothing gone; `~/`, `../b`, `docs/../../b`, `docs/../docs/archive`, an absolute path elsewhere, a key that is not a
list and a file that is not JSON are each refused by name, nothing from the file is used, the outside project is never
read, and the MCP answer starts with the message / "[rl:local-search/person-off-wins]": the person's off list beats a
`genter.json` that includes the file, the file's anchor leaves the store, a project switched off is not added and
cannot be added, a config that is not JSON stops Genter and stays as it was / "[rl:local-search/store-split]
[rl:local-search/ids-stable]": a store written in 0.3's shape (sources with no project, a website) is split into A, B,
a loose folder, every project (the website) and the person's (notes), with every anchor id and digest equal; a second
open leaves the file byte for byte; the first search reports no change; each project answers only its own; the note
answers everywhere with its date / "[rl:local-search/first-search-adds-folder]": from `a/docs` the repository's root is
added, a second project adds its own, the home folder adds nothing / "[rl:local-search/forget]": a folder in two
projects forgotten in one stays in the other, then goes with its anchors / a search by meaning in one project keeps the
other's 2,100 vectors (none embedded again). Each of these fails when its part is undone (checked by hand: every
source searched, no `..` check, no `~` check, no containment check, the person's off ignored, no anchor drop, narrowed
places marked gone, no split, vectors pruned per search, the home folder found by walking up, the current folder added
instead of the root) / DriftBench guard (`node bench/drift/run.mjs --no-takes --guard README.md`) passes with the same
tables as main / `npm test`, `npm run lint`, `harden check`.

## Red lines after

* local-search/project-scope: new, a search reads its own project's sources and the person's notes, never another
  project's; the project rule
* local-search/repo-config-narrows: new, a project's `genter.json` only narrows; an entry outside the project refuses
  it with a plain message and nothing from it is used
* local-search/person-off-wins: new, the person's `off` list holds in every project and no `genter.json` undoes it; a
  config that is not JSON is never replaced
* local-search/store-split: new, a 0.3 store is split once, ids and digests kept
* local-search/ac-other-project: new, the case of [project-scope] through `genter ask` and `genter mcp`
* local-search/first-search-adds-folder: text changed, the project's folder, per project
* local-search/forget: text changed, per project; anchors go once no project has the source
* local-search/notes-are-the-persons: text changed, found in every project
