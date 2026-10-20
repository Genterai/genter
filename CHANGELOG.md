# Changelog

What each release of genter-cli brings, in plain words, with what can break first. A release's notes on GitHub start
with its section here, then list the pull requests merged since the release before. Earlier releases:
[GitHub releases](https://github.com/Genterai/genter/releases).

## 0.4.0

genter-cli is now the open engine and nothing else. It searches your project's files, your notes, websites and MCP
servers on your own computer. The answer that holds now comes first, and what it replaced is marked in the document's
own words. It needs no account and no key, and it has no dependencies.

### Breaking changes

- **The apps engine left the package.** Connecting apps through Composio, Genter's own agent, the hosted MCP tools,
  `genter run`, `find` and `write`, and the optional `@composio/core` and `zod` peers are on the
  [`legacy`](https://github.com/Genterai/genter/tree/legacy) branch, unsupported. Your team's apps are Genter Cloud's.
- **No more `genter login`.** genter-cli no longer calls Genter Cloud: `genter login`, `genter logout`, `GENTER_TOKEN`,
  `GENTER_URL` and `--cloud` are gone. Add Genter Cloud to your AI tool as its own MCP server,
  `https://genter.ai/api/mcp` (the tool signs you in), or run `genter install --cloud`. The first command you run
  removes the token that 0.3's `genter login` kept in `~/.genter/config.json`, and says so. `login`, `logout` and
  `--cloud` now exit 1 and print that address. `--local` still works and changes nothing.
- **The MCP tools are `search` and `read`.** `genter mcp` serves the same two tools as Genter Cloud: `search` with a
  question, then `read` with the ids it returned. 0.3's `genter_find`, `genter_add`, `genter_remember` and
  `genter_sources` still answer, marked deprecated, until 0.5. Adding, remembering and listing sources are commands:
  `genter add`, `genter remember`, `genter sources`.
- **A search reads its own project.** `genter ask` and `genter mcp` read the project they run in (the nearest folder
  up with a `genter.json` or a `.git`) and your notes, never another project. A project's `genter.json` can only
  narrow what is read. A store made by 0.3 is split by project the first time it is opened, and places keep their ids.
- **The library's exports.** `import "genter-cli"` is the local engine; in 0.3 it was the apps engine. The exports are
  `genter-cli`, `genter-cli/local`, `genter-cli/lexical`, `genter-cli/readers` and `genter-cli/conformance`. The
  other 13 of 0.3 (`./mcp`, `./agent`, `./tools` and the rest) are on the `legacy` branch.

### New

- **The current answer first.** When a document says at its top that a newer one replaced it ("Superseded by",
  "Deprecated: replaced by", an ADR's status), the newer one comes first and the old one follows with its notice
  quoted: `RUNBOOK.md says at its top: "Superseded by Release process v2"`. The order changes only when both documents
  are in your project and a reader read the notice; a mark is always the document's own words, never Genter's verdict.
- **Dates from the documents.** A place's date comes from the document itself: an ADR's `Date:`, a changelog heading,
  front matter. In a fresh clone, whose files were all written at one moment, Genter says "file dates unknown (fresh
  clone)" instead of using the time of the clone.
- **Readers.** What a document says about itself (its date, its status, what replaced it) is read by readers written
  as data, never as code: ADRs, changelogs, deprecation banners, RFCs, RFDs, PEPs, EIPs, KEPs, NEPs, PIPs, proposal
  folders, decision logs and Obsidian notes. A replacement named only by its number (a PEP's `Superseded-By: 470`)
  counts too. `genter reader new <name>` starts a reader and `genter reader check` tests it against its examples. The
  phrases that mark a replacement are data as well, in English and Russian (`rules/`).
- **`genter install`** adds Genter to the AI tools on your computer: Claude Code, Claude Desktop, Cursor, VS Code,
  Codex, Gemini CLI, Zed and goose. It shows every change and asks first; `genter install --undo` puts every file back.
- **`genter decisions`** writes a page of your project's decisions, current and replaced, each with where it is
  written, its own date and its notice quoted. The page goes outside the repository (`~/.genter/pages/`) unless you
  say where, opens offline and runs no script.
- **`genter demo`** shows the idea in a second, offline: a rule is replaced, and the new one comes first.
- **`genter add https://…/mcp`** adds a vendor's MCP server (Notion, Linear, Atlassian…) as a source. You sign in
  once in your browser; only its read-only tools are called, again at every question, and the sign-in is kept sealed.
- **`genter serve`** gives a small team `search` and `read` over HTTP, with one token per person, read-only. A
  `Dockerfile` and `docker-compose.yml` run it, and each release publishes the image `ghcr.io/genterai/genter`
  ([docs/team.md](https://github.com/Genterai/genter/blob/main/docs/team.md)). Its health check answers while
  searches run.
- **For Claude Code:** a plugin and a skill (`/plugin marketplace add Genterai/genter`, then
  `/plugin install genter@genter`); the skill alone for other agents: `npx skills add Genterai/genter`.
- **For Claude Desktop:** `genter.mcpb`, attached to each GitHub release. `server.json` is Genter's entry for the
  official MCP Registry.
- **`genter-cli/conformance`**: a test any MCP server can run to check that it serves `search` and `read` the way
  Genter does.

### Fixed

- **Addresses you add are checked where they are fetched.** Genter connects to the very address it checked. Private
  addresses written inside IPv6 (`::ffff:…`, `::a.b.c.d`, NAT64 `64:ff9b::/96`) and reserved ranges are refused, a
  name that answers public and then private never reaches the private one, and a redirect to another site carries no
  key or cookie. This was to be 0.3.1, which was never published.

### In the repository, not the package

- The old-answer test (`bench/old-answer/`): on public decision archives, how often plain ranking and Genter put the
  replaced answer first or leave it unmarked, every loss listed. The 50-repository gate (`bench/repos/`): which
  decision records real repositories keep.
- How the project works: [STEWARDSHIP.md](https://github.com/Genterai/genter/blob/main/STEWARDSHIP.md) (what stays
  free), [GOVERNANCE.md](https://github.com/Genterai/genter/blob/main/GOVERNANCE.md),
  [TRADEMARKS.md](https://github.com/Genterai/genter/blob/main/TRADEMARKS.md), and a DCO sign-off on every commit.

In the list of pull requests since 0.3.0 on the GitHub release, #68 to #71 and #73 changed the apps engine, which then
left the package; #79 names 0.3.1, which was never published, and its fix is in this release.
