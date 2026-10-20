# Contributing to Genter

Thanks for helping. This repository is Genter's engine: the `genter` command, its MCP server and its library.
Issues and pull requests are welcome.

## Before you start

- **A bug or an idea:** open an issue here. For a bug, say what you ran, what you expected and what happened, with
  `genter --version`, `node --version` and your OS.
- **What must stay true comes first.** Everything a person, an API or an MCP client relies on is a red line in
  [`harden/redlines/`](harden/redlines), one file per area; every area names its code under `Sources:`, so
  `grep -rl "src/local.js" harden/redlines` finds the red lines of a file. How a change gets in:
  [harden/README.md](harden/README.md).
- **A change of behaviour** starts as a brief in `harden/briefs/` (`harden new "<title>"`, with
  `npm install -g github:Genterai/harden`), then the code.

## Readers and language rules

A reader for a text format, or the phrases of a language, is data, so it needs no brief: CI is its brief.

- **A reader:** `genter reader new <name>` makes `readers/<name>/`: `reader.json`, `fixtures/` and `expected.json`.
  Say which files it takes, and read their date, status and marks with the patterns of
  [`readers/reader.schema.json`](readers/reader.schema.json); put documents shaped like the real ones (with invented
  content) under `fixtures/`, where its globs find them; write what each gives in `expected.json`; then run
  `genter reader check readers/<name>`. A pattern is a small language: literals, classes, anchors, groups and bounded
  repeats, with no `*`, `+`, backreference or lookaround. A manifest holds no address, no code and no free text.
- **A language:** `rules/<lang>.json`, each phrase with lines it marks (`hits`) and lines it must not (`misses`).
- **CI** (`.github/workflows/readers.yml`) lints every manifest and runs every reader's contract: its fixtures, a
  fixture edited, the person's `off` list, and secret-looking files, which a reader never reads.

## Set up

```bash
git clone https://github.com/Genterai/genter && cd genter
npm ci
npm test              # Node's own test runner: no key, no network
npm run lint          # Biome
npm run bench         # DriftBench, offline, about a second
node bin/genter.js demo
```

Node 20 or later.

## What the code keeps to

- **No runtime dependencies.** Genter runs on Node alone, with no peers. A pull request that adds a package to
  `dependencies` or `peerDependencies` is not merged.
- **Nothing copied.** Local search never stores the text of a file or a page: its store keeps places, digests,
  headings and dates, sealed.
- **Nothing run.** Genter never runs what it reads: no `child_process`, `vm`, `eval`, `new Function` or
  `worker_threads` in `src/`.
- **Comments say why**, in the style of the file around them.

## Tests

- A change comes with tests in `test/*.test.js`.
- A test that checks a red line carries its id in its name: `[rl:local-search/reads-again]` (older `[spec:…]` tags
  still count). `harden check` must pass.
- CI runs lint and the tests on Node 20 and 22 for every pull request.

## Pull requests

- One change per pull request, said in "What and why".
- A pull request that changes code an area names carries one line that the `harden` workflow reads:

  ```
  Brief: harden/briefs/<file>.md
  Brief: none - <why no behaviour changes>
  ```

- **Releases:** raise `version` in `package.json` (semver) in the pull request. Merging it into `main` publishes it to
  npm and makes the GitHub release; a pull request that keeps the version releases nothing.

## Conduct and licence

Everyone here follows the [Code of Conduct](CODE_OF_CONDUCT.md). By contributing, you agree that your contributions are
licensed under the [Apache License 2.0](LICENSE), the licence of this repository.
