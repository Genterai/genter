# Agents working on genter-cli

The engine of Genter: Anchors, search, Genter's own agent, embeddings, freshness facts. It is a library the backend
imports (pinned by commit) and the `genter` command, which runs locally on the person's own Composio and OpenRouter keys.

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
| `src/local.js`, `src/lexical.js`, `src/seal.js` | local search: folders, files, websites, notes | `local-search` |
| `bin/`, `src/cloud.js`, `src/demo.js`, `src/mcp-server.js` | the `genter` command, Genter Cloud, the local MCP server | `cli` |
| `src/tools.js` | the hosted MCP server's tools and instructions | `mcp` |
| `src/genter.js`, `src/recipe.js` | Anchors: identity, execute, retrieval | `retrieval` |
| `src/agent.js`, `src/loop.js` | Genter's agent | `search-agent` |
| `src/area-recipe.js`, `src/area.js`, `src/plain.js` | reading and reconciling an area | `areas`, `area-listing` |
| `src/web.js`, `src/net.js`, `src/skills.js` | websites, public-address checks, skills | `security` |
| `bench/drift/` | DriftBench | `driftbench` |
| `src/drift.js`, `src/refs.js`, `src/cost.js`, `src/mcp.js` | freshness facts, writes, cost log, MCP servers | not mapped yet (`harden/README.md`) |
| `harden/` | red lines and briefs | (all) |
| `test/` | the tests | |

## Commands

| Task | Command |
| -- | -- |
| install | `npm ci` |
| test | `npm test` |
| red lines | `harden check` (`npm install -g github:Genterai/harden`) |
| run | `node bin/genter.js <command> '<json>'` (needs `COMPOSIO_API_KEY`, `OPENROUTER_API_KEY`) |

## Rules

- No app has its own Anchor workflow: fields are found by name; per-app read and write helpers are an open question (the
  archive's `what/writing.md`).
- A skill's files are never run: no `child_process`, `vm`, `eval`, `new Function` or `worker_threads`.
