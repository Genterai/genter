# harden

What genter-cli must keep true, and how a change gets in: [the method](https://github.com/Genterai/harden). It
replaces the specs of [Genterai/specs](https://github.com/Genterai/specs) for this repository (genter-cli's specs are
on its `legacy` branch, an archive). Ids are the old statement ids, so every `[spec:…]` tag in `test/` still names a
line. The legacy apps engine (Composio, Genter's agent, the hosted MCP tools) and its areas (mcp, retrieval,
search-agent, areas, area-listing) left `main` on 2026-10-20; they are on this repository's `legacy` branch,
unsupported.

| Path | What |
| -- | -- |
| `redlines/<area>.md` | the red lines of each area: local-search, cli, contract, install, plugin, security, driftbench, readers, anchor-drift, decisions-page, old-answer, serve, remote, community, first-screen |
| `briefs/YYYY-MM-DD-<slug>.md` | one brief per change request, written before the code |
| `retired.txt` | removed ids; an id is never reused |
| `config.json` | older `[spec:…]` tags still count; tests are `test/**` only (`.github/scripts` tests carry sample tags) |

## The loop

1. **Read the red lines** of the areas whose Sources name the code you change: `grep -rl "src/local.js" harden/redlines`.
2. **Learn the system through Genter** before deciding: search the code, tests, earlier briefs, tickets and docs. An
   answer found is a Source, not an Open line. `Genterai/specs` is the archive and never overrides `redlines/`.
3. **Write the brief**: `harden new "<title>"` (`npm install -g github:Genterai/harden`).
4. **Blocking question open: ask, and stop.** Blocking: what a person sees, the data kept on their disk, the MCP and
   library contract (the backend imports this package by commit), keys and privacy, anything hard to reverse. In
   doubt, blocking.
5. **Build against the brief.** Reality contradicts it: change the brief first.
6. **Prove it**: tests tagged `[rl:<area>/<id>]` (old `[spec:…]` tags keep working); `harden check`.
7. **Fold it in**: the red lines it made true go into `redlines/`, listed under the brief's `## Red lines after`,
   `Status: shipped`.

A pull request that changes code an area names carries one line:

    Brief: harden/briefs/<file>.md
    Brief: none - <why no behaviour changes>

## Outside Sources, on purpose

The readers (`readers/<name>/`) and the language rules (`rules/<lang>.json`) are data anyone may add: no area names
them, so their pull requests need no brief. CI is their brief (`.github/workflows/readers.yml`): every manifest is
linted and every reader checked against its fixtures (readers/contract-tested). The schema and the interpreter they
run on are the `readers` area.
