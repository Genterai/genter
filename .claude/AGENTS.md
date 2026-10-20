# Agents working on genter-cli

Genter's open engine: local search over folders, files, websites and notes, read again at every question, with
freshness facts and optional embeddings. It is the `genter` command, its local MCP server, and a library (`genter-cli`,
`genter-cli/local`, `genter-cli/lexical`) that Genter Cloud imports from npm. It runs on the person's machine with no
key; Genter Cloud is never called from here (it is its own MCP server). The legacy apps engine (Composio, Genter's
agent, the hosted MCP tools) is on the unsupported `legacy` branch.

## Red lines come first

What genter-cli must keep true lives in `harden/`: `harden/redlines/<area>.md` and one brief per change in
`harden/briefs/`. The method: <https://github.com/Genterai/harden>; the loop in short: `harden/README.md`. Before
changing anything a person, an API, an MCP client or the app could observe:

1. Find the areas of what you touch: `grep -rl "<path you touch>" harden/redlines` (every area names its code under
   `Sources:`), and read their red lines.
2. Learn the system through Genter (`search`, `read`): the code, tests, earlier briefs, tickets, docs. An answer found
   is a Source, not a question. `Genterai/specs` (its `legacy` branch holds genter-cli's old specs) is an archive and
   never overrides `harden/redlines/`.
3. Write the brief (`harden new "<title>"`). A blocking question (what a person sees, the data kept on their disk, the
   MCP or library contract, keys, privacy, anything hard to reverse; in doubt, blocking) goes to the product owner with
   a proposal, and that part of the work waits. Never fill a gap silently in code.
4. Tag a test that verifies a red line with its id in its name: `[rl:local-search/reads-again]` (older `[spec:…]` tags
   still count).
5. In the same PR, fold the red lines the change made true into `harden/redlines/`, list them under the brief's
   `## Red lines after`, set `Status: shipped`, and run `harden check` (`npm install -g github:Genterai/harden`).

Every PR that changes code an area names under `Sources:` carries one line (checked by `.github/workflows/harden.yml`):

    Brief: harden/briefs/<file>.md
    Brief: none - <why no behaviour changes>

A change here reaches the hosted product (Genterai/app, `genter-cli` from npm) only once a new version is published
and the app takes it.

## Map

| Path | What lives there | Red lines |
| -- | -- | -- |
| `src/local.js`, `src/anchor.js`, `src/lexical.js`, `src/seal.js` | local search: folders, files, websites, notes; an Anchor's id, digest and sections | `local-search` |
| `src/readers.js`, `readers/`, `rules/` | readers: what a format's files say about themselves (status, replaced by, dates), declared as data; the rule words per language | `readers` |
| `src/drift.js` | the marks a document makes about itself (superseded, deprecated) in its first lines | `anchor-drift` |
| `src/mcp-server.js`, `src/conformance.js` | the MCP contract: the two tools search and read, the places' numbers, the conformance fixture (`genter-cli/conformance`) | `contract` |
| `bin/`, `src/demo.js`, `server.json`, `manifest.json`, `glama.json`, `.github/scripts/{mcpb,versions}.mjs` | the `genter` command, the local MCP server's start, the registry entry and the .mcpb bundle | `cli` |
| `src/http.js`, `Dockerfile`, `docker-compose.yml`, `docs/team.md` | `genter serve`: the same tools over HTTP for a team | `serve` |
| `src/remote.js`, `docs/remote.md` | a vendor's MCP server added by URL as a local source: sign-in, sealed tokens, read-only tools | `remote` |
| `src/install/` | `genter install`: Genter added to the AI tools on this computer, one file per tool | `install` |
| `.claude-plugin/`, `plugins/`, `skills/` | the Claude Code plugin marketplace and the skill | `plugin` |
| `src/page.js`, `src/git.js` | `genter decisions`: the decisions page, stamped with the commit read from `.git` | `decisions-page` |
| `src/web.js`, `src/net.js`, `SECURITY.md` | websites, public-address checks | `security` |
| `STEWARDSHIP.md`, `TRADEMARKS.md`, `GOVERNANCE.md`, `ip-boundary.md`, `.github/scripts/dco.mjs` | how the project is run: its promises, the name, who decides, the sign-off | `community` |
| `bench/drift/` | DriftBench | `driftbench` |
| `bench/old-answer/`, `bench/repos/` | the old-answer test against plain ranking, and the readers on 50 popular repositories | `old-answer` |
| `harden/` | red lines and briefs | (all) |
| `test/` | the tests | |

## Commands

| Task | Command |
| -- | -- |
| install | `npm ci` |
| test | `npm test` |
| red lines | `harden check` (`npm install -g github:Genterai/harden`) |
| run | `node bin/genter.js <command>` (no key; `--semantic` takes an embeddings key or Ollama) |

## Rules

- Nothing Genter reads is ever run: no `child_process`, `vm`, `eval`, `new Function` or `worker_threads` in `src/`.
- No runtime dependencies and no peers: `genter-cli` installs alone.
