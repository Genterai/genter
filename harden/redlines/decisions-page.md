# The decisions page

Intent: a person sees in seconds, with no key, which decisions of their repository hold now and which their own text
says were replaced, on one page they can check and share — success: `genter decisions` in a clone with ADRs writes a
page outside the repository that lists each ADR as current or replaced, with where it is written, its own date and, for
a replaced one, its notice quoted and what replaces it, and prints that the page holds quotes.
Sources: `src/page.js`, `src/git.js`

Most weight: [explicit-only] (no row is Genter's own verdict: the page is shared as what the documents say),
[outside-repo] (the page quotes the repository and must not be committed by accident), and [escaped] with [offline] (a
page people pass around runs nothing a document holds and reaches nothing).

## Red lines

* **[explicit-only]** `genter decisions` lists the project's decisions from what its documents say about themselves, as
  the readers read them (readers.js), over the files the project's first search would read (its genter.json narrows
  them, the person's off list holds): every document an ADR or an RFC reader reads, and every entry of a decision log,
  is a decision, CURRENT unless it carries a mark that it is replaced (or gives itself a status of a replaced kind:
  superseded, deprecated, replaced, obsoleted and the rest); any other document is a row only when a reader read such a
  mark at its top or in its front matter (REPLACED), or when a replaced row's mark names it as what replaces it
  (CURRENT). A mark under the first entry of a log or a CHANGELOG is that entry's, and a CHANGELOG's versions are no
  decisions. Each row has its title (a Markdown heading; else a `title:` header, as front matter, a PEP and a KEP write
  it; else an RST title; else its file's name: a YAML comment or a code line is never a title), its place (`path:line`,
  the line of its date, else of its title), its own date as the reader read it, or "no date written" (never a file
  time), and its status as the document gives it; a replaced one quotes its notice, its status line included, as the
  whole line written (`<path>:<line> says: “<line>”`), and names what replaces it when the notice does: the file of the
  project its link leads to, else the name or the link the notice gives. No row says two documents disagree, none comes
  from a model, and none states what a document does not say. When the listing of the project's files stops at its
  limit, the page and the command say so ("The listing stopped at <n> files: decisions past it are not on this page"),
  and the page claims nothing about the files past it.
* **[outside-repo]** The page is written to `pages/<project>.html` in Genter's folder (`~/.genter`, or `GENTER_HOME`),
  outside the repository; `--out <file>` names another file, and a default that would fall inside the project or its
  repository is refused, saying to choose one with `--out`, and so is an `--out` that names a folder. The file is
  readable by its owner only (0600; Genter's pages folder is made 0700, one that was there before too), and is written
  whole, through a temp file of its own that is removed if the page cannot take its place. The command prints `<path>
  holds quotes from <project>: check before sharing`, and the page says it quotes the project's documents.
* **[escaped]** Every text the page takes from the project (titles, paths, quotes, names, statuses, the project's name)
  is HTML-escaped: a heading holding `<script>` shows as text.
* **[offline]** The page is one HTML file with no script, no link, no image, no frame and no form, and loads nothing:
  its one style is inline, allowed by its hash in a Content-Security-Policy of `default-src 'none'` with
  `base-uri 'none'` and `form-action 'none'`; an address a document gives is text. It opens with no network.
* **[stamped]** The page says what it was made from and when: "Decisions in <project>", "generated at <commit> on <date>
  · run `genter decisions` again to refresh", and "<n> current · <m> replaced, by their own text · dates as the
  documents give them". The commit is read from the repository's .git with fs alone, nothing run (security/never-run):
  HEAD, then the branch's loose ref or packed-refs, through a worktree's or a submodule's .git file and its commondir; a
  branch with no commit yet is said. A repository whose refs are in git's reftable format exits 1 saying its commit
  cannot be read without running git (never "before the first commit"). A folder in no git repository (none up to the
  home folder) exits 1 saying "not a git repository", and writes nothing.

## Open

* A record whose status is proposed, rejected or withdrawn is listed as CURRENT with that status beside its title.
* The page's file is named after the project's folder: two projects of one name share a file, the newer page replacing
  the older one.
