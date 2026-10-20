# genter decisions: the decisions page

Status: shipped
Request: the product owner, 2026-10-20, accepting Genter's open-source plan as proposed: "по всему что предлагаешь"
(on everything you propose), and asking to carry it through to `main`. This is step 1.5 of that plan: `genter
decisions` writes `decisions.html`, the current and replaced decisions from explicit marks, each with its place, the
document's date and the notice quoted, and no disagreement rows; written to `~/.genter/pages/` by default, printing
that it holds quotes; everything escaped, a strict CSP and no script; stamped with the commit, the date and how to
refresh.

Intent: a developer sees, in seconds and with no key, which decisions of their repository hold now and which their own
text says were replaced, on a page they can check and share — success: `npx genter-cli decisions` in a clone with ADRs
writes `~/.genter/pages/<project>.html`, outside the repository, listing each ADR as CURRENT or REPLACED with
`path:line` and the date the ADR gives itself, the replaced one quoting its "Superseded by" line and naming the file
that replaces it, and prints `<path> holds quotes from <project>: check before sharing`; the page opens offline and
runs nothing.
Searched: `npx -y genter-cli@0.3 ask "which readers read decisions and replaced marks, and how is a document's date
read?"` (the readers v1 brief, `harden/redlines/readers.md`, `src/readers.js` readDocument: date and status are the
first reader's, marks and entries every reader's, each with its line and quote) and `npx -y genter-cli@0.3 ask
"child_process git commit HEAD packed-refs shallow clone dates"` (`CONTRIBUTING.md` "Nothing run", the benchmark's own
`git rev-parse` outside `src/`, `test/contract.test.js` making a repository of `.git/HEAD` alone). Both ran from a
scratch install of 0.3 against this worktree.
Sources: `src/readers.js` (readDocument, KINDS), `readers/*/reader.json` and their fixtures, `src/local.js` (projectOf,
scope(), listFolder, readerPath, localLink, readText: the files a project's first search reads, the off list and
genter.json), `bin/local.js`, `harden/redlines/{cli,readers,security,local-search}.md`, `CONTRIBUTING.md`; Genter's
open-source plan, steps 1.5 (this), 1.2 (the readers) and 3.10 (git dates, which needs the owner before anything is
run); git's own layout of `.git` (HEAD, `refs/heads/<branch>`, `packed-refs`, a worktree's `gitdir:` file and
`commondir`): https://git-scm.com/docs/gitrepository-layout; Content-Security-Policy hashes for inline style:
https://developer.mozilla.org/docs/Web/HTTP/Headers/Content-Security-Policy/style-src
Red lines: security/never-run (git is read, never run), cli/no-packages (one more command), cli/config-private,
readers/off-honoured, local-search/person-off-wins, local-search/repo-config-narrows, local-search/no-text-stored (the
page is an export the person asks for, written outside the store; nothing is added to the store); new:
decisions-page/explicit-only, decisions-page/outside-repo, decisions-page/escaped, decisions-page/offline,
decisions-page/stamped
Decided:
* What a decision is, from explicit marks only: every document the `adr` or `rfc` reader reads, and every entry of the
  `decisions` reader (a heading of `docs/decisions.md`), is a decision; a document any other reader marks as replaced
  (a banner at its top, Obsidian front matter) is a row too; a CHANGELOG's versions are releases, not decisions, and a
  mark under the first entry of a log or a CHANGELOG belongs to that entry (the banner reader sees a CHANGELOG's
  "### Deprecated" among its top lines). The decision readers are named in `src/page.js` (`DECISION_READERS`), so a
  new reader never makes every document of its format a "current decision" by accident (plan step 1.5: explicit
  marks only)
* A record with a status of a replaced kind (superseded, deprecated and the rest of readers.js KINDS) and no line that
  names what replaces it is REPLACED by that status: `<path>:<line> gives its status as “superseded”`. Any other status
  (accepted, proposed, rejected) shows beside the title as the document gives it
* The file a replaced row's link leads to, when it is a file of the project with no row of its own, is a CURRENT row:
  the replaced document names it as what replaces it, in its own words (a runbook whose top says "Superseded by
  [Release process v2](release-process-v2.md)" makes that file the current one)
* A row's place is the line of its own date, else of its title, so the place and the date shown beside it can be
  checked at one line; the date is the reader's (ISO), or "no date written", never a file time (step 0.5)
* The notice is quoted as written, the whole trimmed line, so a reader of the page finds it verbatim; search's
  plain-words form is search's
* The files read are the project's folder as its first search would add it (projectOf, its genter.json, the person's
  off list, never the home folder or the root), not the notes (the person's own, in every project) and no website (the
  page is made offline). The store is not opened and nothing is kept: `createLocal().documents()` reads and returns
* The commit is read from `.git` with fs alone (HEAD, the loose ref, packed-refs, a worktree's `gitdir:` and
  `commondir`), walking up from the project's root and never past the home folder, as projectOf; a branch name with
  `..` or an empty part is refused. A folder in no repository exits 1, "not a git repository", and writes nothing; a
  branch with no commit yet is stamped "before the first commit"
* The page's file is `pages/<project folder's name>.html` in Genter's folder, 0600 in a 0700 folder, written whole
  (a temp file renamed); a default that would fall inside the project or its repository (a `GENTER_HOME` inside it) is
  refused, saying to use `--out`; `--out` writes where the person says, inside the repository too
* The style is allowed by its sha256 hash rather than `'unsafe-inline'`, and the page has no `href` at all: paths and
  addresses are text, so nothing on it navigates or loads
* The date is the computer's local day; the stamp shows 7 characters of the commit; `--json` prints `{ path, project,
  commit, current, replaced }`; `--out` is decisions' own flag (elsewhere it exits 1), and the command takes no words
* No version bump: the page reaches npm with the next minor (plan, Phase 1)
Open:
* A record whose status is proposed, rejected or withdrawn is listed as CURRENT with that status beside its title, and
  counts as current. Proposal: keep it until someone asks; a third state ("not decided") would change the page's
  header the plan fixed, so it is the owner's [non-blocking]
* Two projects whose folders share a name share a page file, the newer page replacing the older. Proposal: keep the
  plan's `<project>.html`; add a short hash of the project's path to the name if it bites [non-blocking]
* The commit says where the branch was, not whether files changed since (telling that means reading git's index).
  Proposal: leave it to step 3.10, which reads more of `.git` [non-blocking]
* What counts as a mark is the readers' and the language rules' (data, outside this area): "## Deprecated" among a
  document's first four lines is a notice by `rules/en.json` ("# Deprecated" is one of its hits), so such a document is
  listed as REPLACED. Proposal: tune it in the rules, with a fixture, if it misfires on real repositories (step 1.10
  runs the readers on 50 of them) [non-blocking]
* A community reader for a new decision format needs its name added to `DECISION_READERS`. Proposal: a reader schema
  field once a second decision format arrives (step 3.6, the registry) [non-blocking]
Proof: `test/page.test.js`: "[rl:decisions-page/explicit-only] [rl:decisions-page/stamped]" a snapshot of the page on a
fixture repository with three ADRs (one superseded), a runbook with a notice, its replacement with a front-matter
date, a CHANGELOG and plain files / "[rl:decisions-page/explicit-only]" a decision log's entries, a mark under an
entry, front matter that says deprecated, a replaced-kind status with no line naming the replacement, a proposed
status, and no row for a dated meeting note, a CHANGELOG, an index or code; every quote is its document's line as
written and every date is in its document / "[rl:decisions-page/escaped]" a heading holding `<script>`, a file name
holding a tag, a notice holding `<img onerror>` and a project's name holding a tag all show as text /
"[rl:decisions-page/offline]" no script, link, image, frame, form or base; no `src`, `href`, `style` or `on…`
attribute; no `url(` or `@import`; no address inside a tag; the CSP is `default-src 'none'` with the style's own hash
/ "[rl:decisions-page/outside-repo] [rl:cli/no-packages]" the command with no key writes `~/.genter/pages/acme.html`
(0600), prints the line, leaves the repository as it was; `--out` writes where it says; a `GENTER_HOME` inside the
repository is refused; `--out` on `ask`, a word after `decisions`, `--out` with no file exit 1 /
"[rl:decisions-page/stamped]" a folder with no `.git` exits 1 with "not a git repository" and writes nothing; HEAD
through a loose ref (over packed-refs), packed-refs, a detached HEAD, a worktree's `.git` file, a branch with no
commit, a HEAD naming `refs/../..` refused, the home folder never walked past / "[rl:readers/off-honoured]
[rl:local-search/person-off-wins] [rl:local-search/repo-config-narrows]" a switched-off ADR and a file the project's
genter.json excludes are not read for the page, and what replaces a row is then named, not read / the existing
`test/security.test.js` [never-run] reads `src/` recursively and covers `src/page.js` and `src/git.js` / `npm test`,
`npm run lint`, `harden check`, `node bin/genter.js reader check`

## Red lines after

* decisions-page/explicit-only: new, rows only from what the readers read; current and replaced; place, own date,
  status, the notice as written and what replaces it; no disagreement row, no model, no file time
* decisions-page/outside-repo: new, `~/.genter/pages/<project>.html` by default, `--out` to choose, a default inside
  the repository refused, 0600, the "holds quotes" line printed and on the page
* decisions-page/escaped: new, every text from the project escaped
* decisions-page/offline: new, one file, no script and nothing loaded, the style allowed by its hash
* decisions-page/stamped: new, project, commit read from `.git` with fs alone, date and how to refresh; "not a git
  repository" exits 1
* cli/no-packages: text changed, the commands include `decisions`
