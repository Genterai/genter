# The genter command

Intent: a person runs Genter on their own machine with nothing to set up, and adds Genter Cloud to their AI tool as
its own MCP server — success: `npx genter-cli ask "how do we deploy?"` answers from the folder it runs in.
Sources: the cli spec on the legacy branch of Genterai/specs (archive); `bin/`, `src/demo.js`, `src/mcp-server.js`;
step 1.8 of Genter's open-source plan: `server.json`, `manifest.json`, `glama.json`, `.github/scripts/mcpb.mjs`,
`.github/scripts/versions.mjs`; the release notes: `CHANGELOG.md`, `.github/scripts/notes.mjs`.
`genter serve`, the same tools over HTTP for a team, is its own area: `serve`.

Most weight: [no-packages] (the first run must work), [config-private] (the config holds the store's secret and
keys), [cloud-own-server] (no token on the person's disk), and the local MCP contract ([local-mcp-tools],
[local-mcp-stdout]), which clients rely on.

## Red lines

### Commands

* **[no-packages]** The commands (`ask`, `add`, `remember`, `forget`, `sources`, `mcp`, `serve`, `demo`, `install`,
  `reader`, `decisions`) run with no key and no package beside genter-cli; `serve`'s `--host` and `--port`, like
  `install`'s and `decisions`' own flags, are refused by the other commands.
* **[help]** No command prints the help, its last line Genter Cloud's MCP address `https://genter.ai/api/mcp`; an
  unknown command, or `ask` with no question, exits 1.
* **[output-local]** `ask` prints each passage under `[n] place:lines · headings` (an MCP server's document: `[n]
  <server> <its link> · headings`, remote/anchors-not-copies), what Genter did on stderr (for `add`, where to sign in to
  an MCP server, remote/sign-in); `--json` prints the same as JSON.
* **[config-private]** The config and the store are readable by their owner only (0600).
* **[demo]** `genter demo` runs offline on a temp folder it removes after, with no key and no model, and reads nothing
  of the person's (beyond removing 0.3's Genter Cloud token from the config, as every command does first,
  [cloud-own-server]), not even when that temp folder sits inside their repository (the demo's folder is a project of
  its own): a runbook, dated March by itself, that says deploys go out on Fridays answers "Can we deploy on Friday?"
  with its file and line; then a newer doc, dated by itself in October, says no deploys on Fridays, and the runbook says
  "Superseded by" it at its top, with nobody telling Genter; asked again, the answer is `genter ask`'s own
  (local-search/current-first): the new rule first with its date, the runbook's Friday line after it, with its date and
  its notice quoted. The last line is the command to run next, `npx genter-cli install`. It prints plain text, so
  there is no color to switch off.
* **[demo-fast]** `genter demo` finishes, node's start included, in under half a second on CI hardware: the README's
  first run, and the GIF recorded from it, wait for nothing.
* **[reader-commands]** `genter reader new <name>` makes `readers/<name>/` in the folder it runs in (a manifest, two
  fixtures and what they give) that `genter reader check` passes once its owner is set (the placeholder owner is
  refused), and never writes over a folder that is there; `genter reader check [folder ...]` lints each reader named
  (with none, every one in `./readers`, and `./rules`) and checks it against its fixtures (readers/contract-tested),
  printing each problem and exiting 1 on any.

### Genter Cloud

* **[cloud-own-server]** Genter Cloud is its own MCP server in the person's AI tool (`https://genter.ai/api/mcp`, the
  tool signs in with OAuth): genter-cli never calls it, reads no token for it and keeps nothing for it, and the first
  command removes the token 0.3's `genter login` kept in the config, saying so on stderr; `ask` and `mcp` answer from
  this computer only (0.3's `--local` changes nothing), and `genter login`, `genter logout` and `--cloud` exit 1
  naming that address, except `genter install --cloud`, which adds that address to the person's AI tools
  (install/cloud-asked).

### The local MCP server

* **[local-mcp]** `genter mcp` is an MCP server over stdio; errors are JSON-RPC errors (unknown tool -32602, unknown
  method -32601, bad request -32600), a tool's failure `isError`.
* **[local-mcp-tools]** The contract's two tools first, `search` and `read` (contract/two-tools), then, for one minor
  release, 0.3's `genter_find` (read-only), `genter_remember`, `genter_add` and `genter_sources`, each answering as in
  0.3, its description starting "Deprecated: genter-cli 0.5 removes this tool"; adding, remembering and listing
  sources are the command's (`genter add`, `genter remember`, `genter sources`). The client's protocol version when
  supported, else the latest.
* **[local-mcp-stdout]** One JSON message per line on stdout, in order, nothing else; a line that is not JSON gets
  -32700.

### Packaging and listings

Where clients and directories find Genter and how they start it, and what a release says it brings. The release
workflow that attaches the extension and writes the notes is `.github/workflows/release.yml` (outside Sources on
purpose: Dependabot updates its actions); a test reads it.

* **[registry-entry]** `server.json` is the entry of the official MCP Registry (schema 2025-12-11) for
  `io.github.<owner>/genter`, the owner spelled as GitHub spells it, capitals included (the registry grants a GitHub
  namespace by that spelling, case for case; `Genterai`), and equal to `mcpName` in `package.json`: one npm package,
  `genter-cli` at this version, over stdio, run as `genter mcp`, and the hosted address `https://genter.ai/api/mcp` as
  a streamable-HTTP remote that the client signs in to with OAuth. A description of 100 characters at most, a specific
  version, and no header, variable, environment, key or private address anywhere in it.
* **[versions-agree]** `package.json`, `server.json` (twice) and `manifest.json` name one version, and
  `node .github/scripts/versions.mjs` writes the first's into the others, changing no byte but those lines.
* **[listings]** `docs/listings.md` gives the registry entry's name and one line as `server.json` has them, and the
  hosted address; `glama.json` names as maintainer an owner CODEOWNERS names.
* **[mcpb-manifest]** `manifest.json` is an MCPB manifest (0.3) for Claude Desktop that starts `node bin/genter.js mcp
  <folder>`: the folder is a `directory` the person picks (required, one, no default: nothing is searched until they
  choose a folder); the tools it lists are the contract's two, `search` and `read`; it has no environment, key or secret
  field; it names macOS and Windows and Node 20, as the package's `engines`.
* **[mcpb-starts]** The bundle holds what `npm pack` ships and the manifest, and nothing else; the manifest's command,
  started in another folder than the person's with a folder whose name has a space, searches the folder chosen and
  passes `genter-cli/conformance` (contract/conformance). Staging refuses a folder that is not empty, a manifest of
  another version than the package, and a file the manifest starts from that the package does not ship.
* **[mcpb-release]** `genter.mcpb` is attached to the GitHub release by a job of its own after the release job, only when
  the version's tag is at that commit and the release has none; it packs with `@anthropic-ai/mcpb` at an exact version
  (the packages that version asks for float, as it has no lockfile) in a step that sees no token, and what it packed is
  compared with what was staged, byte for byte, before the bundle is started or uploaded; the npm release job does not
  know about it.
* **[release-notes]** A release's notes on GitHub start with its section of `CHANGELOG.md` (`## <version>`, newest
  first): what it brings in plain words, the changes that can break what a person has (a command, a tool, an export, a
  file Genter keeps) first, its links whole addresses (a release page resolves no relative one); GitHub's list of the
  pull requests merged since the release before follows. A version without a section fails the tests, which the
  release job runs before it publishes to npm or tags.

## Proof

* **[ac-mcp-tools]** Given `genter mcp`, when a client initializes and lists tools, then it gets `search` and `read`,
  then the four deprecated names, and instructions that name search and read and say "Genter finds; you think and
  write".
