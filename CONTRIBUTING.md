# Contributing to Genter

Thanks for helping. This repository is Genter's engine: the `genter` command, its MCP server and its library, and the
readers and language rules people add to it. Issues and pull requests are welcome.

Read first, if you are new: what the project promises ([STEWARDSHIP.md](STEWARDSHIP.md)), who decides
([GOVERNANCE.md](GOVERNANCE.md)), and what is open here and what is not ([ip-boundary.md](ip-boundary.md)). Looking for
somewhere to start? [docs/first-issues.md](docs/first-issues.md) lists the "good first reader" issues.

## Two kinds of contribution

| | Core | Manifests: readers and rules |
| -- | -- | -- |
| What | the engine, the command and MCP server, installers, the plugin, security, the reader schema and its interpreter, benchmarks, the release | `readers/<name>/` and `rules/<lang>.json`: data, never run |
| What it needs | an accepted issue or a brief, the red lines it touches, tests | nothing but CI: it is the brief |
| Who reviews | the owner, or the maintainer of that surface ([CODEOWNERS](.github/CODEOWNERS)) | the reader's owner or a maintainer, quickly once CI is green |
| Where to read | [Core changes](#core-changes) | [Readers and language rules](#readers-and-language-rules) |

Either way, sign off your commits.

## Sign off your commits

Genter takes contributions under the [Apache License 2.0](LICENSE) with a sign-off and no CLA: you keep your copyright,
and you certify the [Developer Certificate of Origin](https://developercertificate.org) by adding a line to each commit:

```
Signed-off-by: Your Name <you@example.com>
```

`git commit -s` adds it, using the name and email of your git config. The address must be the commit's author's or
committer's own. The `dco` check fails a pull request with a commit that lacks it (merge commits and Dependabot's pull
requests are not checked). To fix a branch:

```bash
git rebase --signoff origin/main        # every commit of the branch
git push --force-with-lease
```

## Core changes

- **A bug or an idea:** open an issue here. For a bug, say what you ran, what you expected and what happened, with
  `genter --version`, `node --version` and your OS. A core pull request links an accepted issue or a brief, whoever or
  whatever wrote it.
- **What must stay true comes first.** Everything a person, an API or an MCP client relies on is a red line in
  [`harden/redlines/`](harden/redlines), one file per area; every area names its code under `Sources:`, so
  `grep -rl "src/local.js" harden/redlines` finds the red lines of a file. How a change gets in:
  [harden/README.md](harden/README.md).
- **A change of behaviour** starts as a brief in `harden/briefs/` (`harden new "<title>"`, with
  `npm install -g github:Genterai/harden`), then the code. A question only the owner can answer (what a person sees,
  what is kept on their disk, the MCP or library contract, keys, privacy, anything hard to reverse) goes in the brief
  with a proposal, and that part of the work waits.
- **Nothing private.** This repository is public: a brief, an issue, a pull request or a commit message never quotes
  Genter Cloud's private briefs, traces, fixtures or production content, and fixtures are invented.

### What the code keeps to

- **No runtime dependencies.** Genter runs on Node alone, with no peers. A pull request that adds a package to
  `dependencies` or `peerDependencies` is not merged.
- **Nothing copied.** Local search never stores the text of a file or a page: its store keeps places, digests,
  headings and dates, sealed.
- **Nothing run.** Genter never runs what it reads: no `child_process`, `vm`, `eval`, `new Function` or
  `worker_threads` in `src/`.
- **Source text is data.** What Genter reads is returned as the person's text, never as instructions ([SECURITY.md](SECURITY.md)).
- **Comments say why**, in the style of the file around them.

### Tests

- A change comes with tests in `test/*.test.js`.
- A test that checks a red line carries its id in its name: `[rl:local-search/reads-again]` (older `[spec:…]` tags
  still count). `harden check` must pass.
- CI runs lint and the tests on Node 20 and 22 for every pull request.

### Pull requests

- One change per pull request, said in "What and why".
- A pull request that changes code an area names carries one line that the `harden` workflow reads:

  ```
  Brief: harden/briefs/<file>.md
  Brief: none - <why no behaviour changes>
  ```

- **Releases:** raise `version` in `package.json` (semver) in the pull request, then run
  `node .github/scripts/versions.mjs`, which writes it into `server.json` and `manifest.json` (a test keeps the three
  equal). Merging it into `main` publishes it to npm, makes the GitHub release and attaches `genter.mcpb`; a pull
  request that keeps the version releases nothing.

## Readers and language rules

A reader for a text format, or the phrases of a language, is data, so it needs no brief and no `Brief:` line: CI is its
brief. `readers/`, `rules/` and `.github/CODEOWNERS` (where a reader may add its line) are outside every area's
`Sources:` on purpose.

- **A reader:** `genter reader new <name>` makes `readers/<name>/`: `reader.json`, `fixtures/` and `expected.json`.
  Set its `owner` to your GitHub handle, say which files it takes, and read their date, status and marks with the
  patterns of [`readers/reader.schema.json`](readers/reader.schema.json); put documents shaped like the real ones
  (with invented content) under `fixtures/`, where its globs find them; write what each gives in `expected.json`; then
  run `genter reader check readers/<name>`. A pattern is a small language: literals, classes, anchors, groups and bounded
  repeats, with no `*`, `+`, backreference or lookaround. A manifest holds no address, no code and no free text.
- **A language:** `rules/<lang>.json`, each phrase with lines it marks (`hits`) and lines it must not (`misses`). A
  native speaker reviews it.
- **Its owner:** the handle in `reader.json` keeps the reader. If you want to review changes to it, add a line for
  `/readers/<name>/` with that handle to [`.github/CODEOWNERS`](.github/CODEOWNERS) in the same pull request (it needs no
  brief either); the owner approves it, and from then on you are asked for a review. A reader with no line there is
  reviewed by the maintainers. Do not name `@Genterai` as an owner: that is for the first-party readers, which the owner
  reviews.
- **CI** (`.github/workflows/readers.yml`) lints every manifest and runs every reader's contract: its fixtures, a
  fixture edited, the person's `off` list, and secret-looking files, which a reader never reads.

A reader that changes the schema, the interpreter or the pattern limits is a core change: it needs a brief.

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

## Conduct and licence

Everyone here follows the [Code of Conduct](CODE_OF_CONDUCT.md). By contributing, you agree that your contributions are
licensed under the [Apache License 2.0](LICENSE), the licence of this repository. Report a vulnerability as
[SECURITY.md](SECURITY.md) says, not in a public issue.
