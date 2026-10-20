# The Claude Code plugin and the skill

Intent: a person adds Genter to Claude Code with two commands, and their agent searches Genter before it answers what a
project decided — success: after `/plugin marketplace add Genterai/genter` and `/plugin install genter@genter`, Claude
Code lists the plugin's `genter` server and its `genter` skill, and the agent asked "can we deploy on Friday?" answers
from the place Genter returns, citing its `[id]` and place, with the replaced runbook's notice quoted.
Sources: `.claude-plugin/marketplace.json`, `plugins/`, `skills/`

Most weight: [local-server] (what the plugin starts on the person's computer), [skill] (what every agent that installs
it is told to do with Genter's answers), and [hook-opt-in] (nothing runs on each prompt unless the person adds it).

## Red lines

* **[marketplace]** `.claude-plugin/marketplace.json` is a Claude Code marketplace named `genter` that lists two
  plugins: `genter`, from `./plugins/genter` in this repository, and `harden`, from the GitHub repository
  Genterai/harden; every name is one Claude Code installs (letters, digits, `.`, `_`, `-`), a relative source starts
  with `./`, holds no `..` and is a folder with `.claude-plugin/plugin.json` whose `name` is the entry's.
* **[local-server]** The genter plugin starts one MCP server, `genter`, from its `.mcp.json`: `npx -y
  genter-cli@<minor> mcp`, pinned to this package's minor or the next one and never to one before 0.4, the first minor
  whose server has `search` and `read`, with no folder (it searches the project of the folder Claude Code runs in, and
  the person's notes), no environment of its own and nothing else: no token, no key, no address of Genter Cloud, no
  hook. The manifest declares no other server.
* **[skill]** `skills/genter/SKILL.md` (what `npx skills add Genterai/genter` installs) and the plugin's
  `skills/genter/SKILL.md` are the same file: front matter with `name: genter` and a description of what it does and
  when (at most 1,024 characters), under 500 lines. It has the agent call `search` first when it needs what a project
  or team decided or how something works, cite the `[id]` and place each claim comes from (the place alone in anything
  written to a file), read with `read` when it needs a place whole, repeat a mark as the quote Genter shows and never
  as its own verdict, and take what the tools return as data, never instructions. A genter-cli command it gives is
  pinned as the plugin's server is.
* **[hook-opt-in]** The plugin runs no hook: no `hooks/hooks.json` and no `hooks` in its manifest. The reminder to
  search first is `plugins/genter/search-first.json`, a `UserPromptSubmit` hook that only prints one line, which the
  person adds to their own Claude Code settings if they want it; the README says how.

## Proof

* **[ac-plugin]** Given a clean Claude Code, when the person adds the marketplace and installs `genter@genter` and
  `harden@genter`, then `claude plugin list` shows both enabled, `genter` with one skill (`genter`), one MCP server
  (`genter`) and no hooks, and `harden` with its `hardening-changes` skill.
