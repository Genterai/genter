# Local search

Intent: a person searches their own folders, files, public websites and notes where they are, each project on its own,
with no key and no package — success: after someone edits a file nobody tells Genter about, `genter ask` answers from
the file as it is now and says it changed; asked in another project, it answers nothing from that file.
Sources: the local-search spec on the legacy branch of Genterai/specs (archive); `src/local.js`, `src/anchor.js`,
`src/lexical.js`, `src/seal.js`, `src/web.js`.

Most weight: [reads-again] and [gone-not-answer] are the product's promise; [no-text-stored],
[private-key-skipped], [project-scope], [repo-config-narrows] and [person-off-wins] are what keeps a person's disk
safe.

## Red lines

### What is searched

* **[file-is-anchor]** Each file or web page is an anchor: one read call with a fixed argument (`FILE_READ {path}`,
  `WEBSITE_READ_PAGE {url}`), with the same deterministic id as any anchor.
* **[ids-stable]** A place's anchor id and digest are made as they were in genter-cli 0.3, so an upgrade reads a
  person's store as it was: no place turns new or changed because the version did.
* **[first-search-adds-folder]** With nothing added in the project, the first search there adds the project's folder
  (never the home folder or the root) and says so; later searches add nothing.
* **[private-key-skipped]** Never read: hidden files (`.env` among them), key and credential files, a file holding a
  private key, folders the folder's `.gitignore` ignores, dependency and build folders.
* **[notes-are-the-persons]** Notes are the person's own Markdown file: a remembered note is a heading with its UTC
  time and the text; it is found with "noted <date>" in every project, found as edited when edited by hand, and is
  never forgotten as a source.
* **[forget]** Forgetting a source drops it from the project it is forgotten in, and drops it once no project searches
  it, with its anchors but those another source still holds; a website kept from 0.3 is in every project, so
  forgetting it forgets it in all; a place that is no source of the project is an error.

### Each project on its own

* **[project-scope]** A search (`genter ask`, `genter mcp`, the library's `find`) reads its own project's sources and
  the person's notes, never another project's. The project is the first folder at or above the one the command runs
  in that holds a `genter.json` or a `.git`, else that folder itself; `genter mcp <folder>` starts from the first
  folder given, wherever the server is started (the library from its `project`, else its `cwd`); a `genter.json` or
  `.git` in the home folder (as written or through a link) or at the root makes no project. A source belongs to the
  projects it was added in; `add`, `forget` and `sources` work on the project they run in.
* **[repo-config-narrows]** A project's `genter.json` comes with a clone, so it can only narrow what is read there:
  `include`, `exclude` and `off`, each a list of paths inside the project. A file with one entry outside it (`~/…`,
  a `..` step, an absolute path elsewhere), or that is not such lists, is refused with a plain message naming the
  entry (on stderr for the command, first in the MCP answer), and nothing from it is used; a place it leaves out is
  neither read nor gone. A project nested in another (a folder inside with its own `genter.json`) keeps its narrowing
  when the outer project reads there.
* **[person-off-wins]** The person's own `off` list (`off` in `~/.genter/config.json`, paths) holds in every project:
  those places are never read, their anchors leave the store, a source under it cannot be added, and nothing in a
  project's `genter.json` brings one back. A path is matched as written and where its links lead, so no link reaches
  a place switched off, and one switched off through a link is off where the link leads. A config that is not a JSON
  object stops Genter with a message and is never replaced.
* **[store-split]** A store made by 0.3 (one list of sources) is split once, when it is first opened: each folder or
  file goes to the project whose root holds it (one outside any project is a project of its own folder, searched from
  there), each website stays in every project, notes stay the person's own; ids and digests are kept, so the first
  search after the split finds nothing new or changed. A source genter-cli 0.3 adds to a split store later (both
  share `~/.genter`) goes the same way at the next open.

### Every search reads again

* **[reads-again]** Every search reads the places it answers from again: a changed file or page answers as it is now,
  marked "changed since the last look", and the answer opens with what changed since the last look.
* **[gone-not-answer]** A file or page that is gone is listed as gone and answers nothing; when it comes back it
  answers again. A project whose source holds a deleted file says it is gone, even when another project's source read
  the file first.
* **[follow-replaced]** What replaces a place is brought beside it only as [current-first] says: right before it,
  marked "replaces [n]"; any other replaced mark shows on its place (anchor-drift/quote-not-verdict) and the order
  stays: nothing is moved up or brought in for it.
* **[current-first]** The current answer first: when a file inside the project's folder is marked as replaced by what
  its readers read (a decision record's status, a banner at its top, its front matter) and what replaces it is a file
  inside that folder this search reads, what replaces it takes the replaced file's rank (its section among those found,
  moved up, else its best section of all) and the replaced file follows right after it, its notice quoted. A place
  outside the project's folder on either side (a source added from elsewhere, the notes, a website), or a mark no reader
  read (the language rules' phrases at the top of a file no reader takes), changes no order.
* **[reader-marks]** A file a reader in `readers/` takes is marked as replaced where the reader says (an ADR's Status
  section, a banner at its top, its front matter), the mark that names what replaces it first; what replaces it is the
  place the reader read beside the mark, when that place is there, and a link elsewhere in the file is taken only for a
  mark at its top (as before readers); a link that is not a valid escape is taken as written and stops no search. A file
  no reader marks is marked only at its top (anchor-drift/top-marks). Marks are read again at every look, so a store
  made by an earlier version shows them without the file being edited. A result shows the date and status the file gives
  itself as its readers read them (`anchor.document`: `readers`, `date`, `status`), read again with the file and never
  kept in the store.
* **[document-dates]** A decision's date is the one its document gives as its readers read it (an ADR's `Date:`, a
  CHANGELOG's latest dated heading, front matter): a result and a read show it (`dated <day>`), a mark naming the
  document as what replaced another place is dated by it (contract/marks), and a file's own time is shown beside it
  only when it is no clone time (anchor-drift/fresh-clone).
* **[no-text-stored]** The store keeps which places there are, their numbers, digests, headings and dates, sealed;
  never a line of their text (a replaced mark's notice is quoted from the text read now), and no place name in the
  clear.

### Ranking

* **[ranking-words]** Sections are ranked by BM25 over their words (English and Russian stems); a word in the
  headings counts more than one in the text.
* **[sections]** At most two sections of one place, and the limit asked (5 by default, 20 at most).
* **[semantic-opt-in]** Given embeddings, a ranking by vectors is fused with the words'; without, words alone.
* **[semantic-providers]** Embeddings come from `GENTER_EMBED_URL` when set, else the provider named, else the first
  whose key is set, else Ollama on localhost; any OpenAI-compatible `/embeddings` works; when none answers the error
  says how to get one.

## Proof

* **[ac-changed-file]** Given `docs/deploy.md` says port 6432, when it is edited to 5433, then the same question
  answers 5433 from `docs/deploy.md:3-5`, never 6432, and opens with "Since the last look: docs/deploy.md changed."
* **[ac-deleted-file]** Given two docs, when one is deleted, then the search lists it as gone and answers nothing
  from it.
* **[ac-replaced]** Given a doc marked "Deprecated: replaced by Deploy v2", when it answers, then Deploy v2 comes
  first, marked "replaces [2]", and the doc right after it saying `ops/deploy.md says at its top: "Deprecated: replaced
  by Deploy v2"`.
* **[ac-secrets-skipped]** Given a token in `.env`, `id_rsa`, a private key file, `node_modules/` and an ignored
  folder, when searched for, then it never appears.
* **[ac-note]** Given a remembered note, when asked about it, then it answers with its date.
* **[ac-no-keys]** Given the package with no `node_modules` and no key, when `genter ask` runs, then it answers.
* **[ac-other-project]** Given `genter ask` answered "port 6432" in repository A, when the same question is asked in
  repository B (by `genter ask` or through `genter mcp`), then nothing from A answers.
