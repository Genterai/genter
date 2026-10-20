# Readers

Intent: anyone adds a reader for a text format (ADR, CHANGELOG, banners, RFC folders, a decision log, front matter) as
data: a manifest, fixtures and the output expected of them, which turns a document's text into its own date, status and
explicit marks without touching the engine — success: `genter reader new <name>`, a few edits and
`genter reader check` give a reader CI accepts with no brief, and `genter ask` then shows the marks and dates it reads;
nothing in a reader is ever run as code.
Sources: `src/readers.js`, `readers/reader.schema.json`

Most weight: [declarative], [restricted-patterns], [no-network] and [secrets-never-read]: readers come from anyone,
and Genter Cloud will run the verified ones over many people's documents. The readers themselves (`readers/<name>/`)
and the language rules (`rules/`) are outside Sources on purpose: CI is their brief.

## Red lines

* **[declarative]** A reader is a JSON manifest that `readers/reader.schema.json` describes: `name` (its folder's),
  `owner`, `matches` (file globs, headings), `lines`, `fields` (date, status, marks) and `entries`, and
  `src/readers.js` interprets it as data. A key or value outside the schema is refused, nothing in a manifest is run,
  and the same document always gives the same output.
* **[restricted-patterns]** A pattern is literals, `.`, character classes, line anchors (`^`, `$`, `\b`), groups and
  alternation, with bounded repeats only (`?`, `{n}`, `{n,m}` up to 200) of something that holds no repeat; nested
  quantifiers, unbounded repeats (`*`, `+`, `{n,}`), backreferences, lookarounds and every other syntax are refused,
  saying where. A pattern has at most 300 characters and 2,000 steps once its repeats are counted, and is matched
  without case (`\w` and `\b` know every alphabet), one trimmed line of at most 400 characters at a time, in time linear
  in the line; a reader reads at most 400 lines of a document, and gives up on one (gives nothing) past 1,000,000 steps
  of the machine, the same way for the same text.
* **[no-network]** A manifest names no address and has no field that reaches the network, holds code or carries text
  to follow (`url`, `fetch`, `script`, `exec`, `prompt`, `description` and the like are refused, and so is any value
  that is an address); a reader reads only the text of the document it is given.
* **[secrets-never-read]** A reader never reads a secret-looking file: a manifest whose glob could match a key,
  credentials or an environment file (`*.pem`, `*.key`, `id_rsa`, `credentials.json`, `.env`) is refused, no wildcard
  reaches a name that starts with ".", and the interpreter refuses such a path or a hidden one whatever a glob says.
* **[off-honoured]** A place the person switched off (local-search/person-off-wins) is never given to a reader.
* **[language-rules]** The phrases that mark a document as replaced ("superseded by", "deprecated", "replaced by",
  "заменён", "устарело" and the rest) are data in `rules/<lang>.json`, under the same pattern limits, each with the
  lines it marks and the lines it does not; every one of those lines is a test, and no phrase marks another's.
* **[contract-tested]** Every reader in `readers/` carries fixtures and the output expected of each
  (`expected.json`); CI lints every manifest and checks every reader: its fixtures give exactly the expected date,
  status, marks and entries, blanking a line it read changes what it gives, a place switched off is never read, and
  secret-looking files beside its fixtures are never read.

## Proof

* **[ac-reader]** Given `genter reader new sample`, when `genter reader check` runs, then it asks for the owner, and
  passes once the owner is set; given a manifest with a `url` key, or a pattern `(a+)+`, it fails, saying which and
  where.

## Open

* Readers installed by URL, pinned to a commit, and a verified tier (step 3.6 of the open-source plan).
* Readers of JSON export files (field paths over JSON, a second version of this language, step 3.8).
* A wiki link (`[[Note]]` in Obsidian front matter) gives the replacing note's name, not its place.
