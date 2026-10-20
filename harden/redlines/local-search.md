# Local search

Intent: a person searches their own folders, files, public websites and notes where they are, with no key and no
package — success: after someone edits a file nobody tells Genter about, `genter ask` answers from the file as it is
now and says it changed.
Sources: the local-search spec on the legacy branch of Genterai/specs (archive); `src/local.js`, `src/anchor.js`,
`src/lexical.js`, `src/seal.js`, `src/web.js`.

Most weight: [reads-again] and [gone-not-answer] are the product's promise; [no-text-stored] and
[private-key-skipped] are what keeps a person's disk safe.

## Red lines

### What is searched

* **[file-is-anchor]** Each file or web page is an anchor: one read call with a fixed argument (`FILE_READ {path}`,
  `WEBSITE_READ_PAGE {url}`), with the same deterministic id as any anchor.
* **[ids-stable]** A place's anchor id and digest are made as they were in genter-cli 0.3, so an upgrade reads a
  person's store as it was: no place turns new or changed because the version did.
* **[first-search-adds-folder]** With nothing added, the first search adds the current folder and says so; later
  searches add nothing.
* **[private-key-skipped]** Never read: hidden files (`.env` among them), key and credential files, a file holding a
  private key, folders the folder's `.gitignore` ignores, dependency and build folders.
* **[notes-are-the-persons]** Notes are the person's own Markdown file: a remembered note is a heading with its UTC
  time and the text; it is found with "noted <date>", found as edited when edited by hand, and is never forgotten as a
  source.
* **[forget]** Forgetting a source drops it and its anchors; a place that is no source is an error.

### Every search reads again

* **[reads-again]** Every search reads the places it answers from again: a changed file or page answers as it is now,
  marked "changed since the last look", and the answer opens with what changed since the last look.
* **[gone-not-answer]** A file or page that is gone is listed as gone and answers nothing; when it comes back it
  answers again.
* **[follow-replaced]** A place marked as replaced brings what replaces it right after it, marked "replaces [n]".
* **[no-text-stored]** The store keeps which places there are, their digests, headings and dates, sealed; never a
  line of their text, and no place name in the clear.

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
  right after it.
* **[ac-secrets-skipped]** Given a token in `.env`, `id_rsa`, a private key file, `node_modules/` and an ignored
  folder, when searched for, then it never appears.
* **[ac-note]** Given a remembered note, when asked about it, then it answers with its date.
* **[ac-no-keys]** Given the package with no `node_modules` and no key, when `genter ask` runs, then it answers.
