# Claude Code plugin and skill

Status: shipped
Request: the product owner (dan), 2026-10-20, accepting Genter's open-source plan as proposed: "по всему что
предлагаешь" (on everything you propose), and asking to carry it through to `main`. This is step 1.4 of that plan: a
Claude Code plugin and skill, "search Genter first; repeat its marks as quotes"; an optional hook that makes the agent
search first; a marketplace that lists genter and harden; also `npx skills add Genterai/genter`. No version bump.

Intent: a person adds Genter to Claude Code with two commands, and their agent searches Genter before it answers what a
project decided — success: in a clean Claude Code, `/plugin marketplace add Genterai/genter` then `/plugin install
genter@genter` installs a plugin with one MCP server (`genter`, the local server) and one skill (`genter`), and no hook;
`harden@genter` installs harden's plugin from the same marketplace; `npx skills add Genterai/genter` installs the same
`SKILL.md`; the skill has the agent call `search` first, cite the `[id]` and place it returns, repeat a mark as the
quote Genter shows and read with `read` when it needs a place whole.
Searched: `npx -y genter-cli@0.3 ask "how does an agent get told to search Genter first and cite the place it
returns?"` (`examples/project/AGENTS.md` "Finding things", the README's "An existing repository", the MCP server's
`instructions` in `src/mcp-server.js`), `npx -y genter-cli@0.3 ask "which version of genter-cli does the README pin,
and what does npx genter-cli mcp start from npm today?"` (the local-engine-only and genter install briefs: the Cloud
bridge is gone, Genter Cloud is its own MCP server) and `npx -y genter-cli@0.3 ask "how are marks repeated: quoted,
never Genter's own verdict"` (`harden/redlines/anchor-drift.md` [facts-on-deviation] "no fact is a verdict",
`markOf` in `src/local.js`). All three ran from a scratch install of 0.3 against this worktree: inside the repository
`npx genter-cli` resolves to the repository itself and answers "genter: not found". On npm today genter-cli has
`0.0.0-stage` and `0.3.0` (`npm view genter-cli versions`).
Sources: `src/mcp-server.js` (`mcpTools`, `instructions`), `src/conformance.js` (`MARKS`, `markProblem`),
`bin/local.js` (`projectFolder`: `genter mcp` with no folder searches the project of the folder it starts in),
`src/install/claude-code.js`, `harden/redlines/{cli,contract,install,anchor-drift}.md`, `examples/project/`,
`README.md`, `package.json`, `.github/workflows/test.yml`; Genter's open-source plan, step 1.4 and decision D3 (two
tools everywhere); Genterai/harden's `.claude-plugin/{marketplace,plugin}.json` and its skill
`hardening-changes`; Claude Code's plugin docs, read on 2026-10-20:
* https://code.claude.com/docs/en/plugins/create-marketplace (`.claude-plugin/marketplace.json` needs `name`, `owner`
  and `plugins`; an entry needs `name` and `source`; a relative source is written from the marketplace root, starts
  with `./`, holds no `..`; the entry name and the plugin's own `name` stay the same; `claude plugin validate`;
  `/plugin marketplace add <owner>/<repo>`, `/plugin install <plugin>@<marketplace>`)
* https://code.claude.com/docs/en/plugins/marketplace-reference (names: letters, digits, `.`, `_`, `-`, starting with a
  letter or digit; the reserved names, none of them `genter`; the `github` source `{ "source": "github", "repo":
  "owner/repo" }` with optional `ref` and `sha`, defaulting to the default branch)
* https://code.claude.com/docs/en/plugins/manifest-reference (`.claude-plugin/plugin.json`: `name` is the only required
  field; `.mcp.json` at the plugin root and `hooks/hooks.json` load by default; `skills/<name>/SKILL.md`; every
  component path stays inside the plugin root)
* https://code.claude.com/docs/en/plugins/loading (a plugin is copied into the cache and "files outside the plugin
  directory aren't copied"; with no `version` the version of a relative-path plugin in a Git-hosted marketplace is the
  commit, so users track commits)
* https://code.claude.com/docs/en/plugins/host-marketplace ("Omit `version`: users track your commits instead"; a
  symlink to elsewhere in the marketplace is dereferenced in the cache but skipped for a marketplace added from a local
  path)
* https://code.claude.com/docs/en/mcp ("Plugin-provided MCP servers": `.mcp.json` at the plugin root, started when the
  plugin is enabled, toggled off in `/mcp`, tools named `mcp__plugin_<plugin>_<server>__<tool>`, "access to the same
  environment variables as manually configured servers"; the page names no working directory for a stdio server)
* https://code.claude.com/docs/en/skills (front matter between `---` lines from the first line; `name`, `description`
  "what the skill does and when to use it"; keep `SKILL.md` under 500 lines; plugin skills are `<plugin>:<skill>`)
* https://code.claude.com/docs/en/hooks (`UserPromptSubmit`: plain stdout is added as context; hooks in
  `~/.claude/settings.json`, `.claude/settings.json` or a plugin's `hooks/hooks.json`)
* https://github.com/vercel-labs/skills (`docs/creating-skills.md`: `name` and `description` required; `skills/` is
  searched, and so are the skill paths a `.claude-plugin/marketplace.json` declares; the CLI collects anonymous usage
  data unless `DO_NOT_TRACK=1` or `DISABLE_TELEMETRY=1`)
Red lines: cli/local-mcp-tools, cli/no-packages, cli/cloud-own-server, contract/two-tools, contract/marks,
install/no-secrets and security/never-run stay true (nothing in `src/` or `bin/` changes); a new area, plugin:
marketplace, local-server, skill, hook-opt-in, ac-plugin.
Decided:
* A new red-line area, `plugin`, names `.claude-plugin/marketplace.json`, `plugins/` and `skills/` under `Sources:`, so
  a change to what the plugin starts or what the skill tells agents carries a brief; `readers/` and `rules/` stay
  outside, as before (plan step 1.4, the task's choice of `cli` or a new area)
* The marketplace is named `genter` and lists two plugins: `genter` from `./plugins/genter`, and `harden` from the
  GitHub repository Genterai/harden at its default branch, not pinned to a commit, as `/plugin marketplace add
  Genterai/harden` gives it; harden's own `plugin.json` version decides when an update reaches people. The install ids
  are `genter@genter` and `harden@genter` (plan step 1.4)
* The plugin's server is `npx -y genter-cli@0.4 mcp`: pinned to the minor that first has `search` and `read`, with no
  folder and no `env`. Claude Code 2.1.304 starts a plugin's stdio server in the folder it runs in (checked by hand: a
  probe server printed its working directory and `CLAUDE_PROJECT_DIR`, both that folder, and saw the shell's
  environment), so `genter mcp` searches that folder's project and the person's notes, as `genter install`'s entry for
  Claude Code does; meaning is on when the person starts Claude Code with `GENTER_SEMANTIC=1` and a key. A test holds
  the pin to this package's minor or the next one, and never below 0.4, so the pin moves with the release after 0.4
  and cannot slip back to the old engine (plan step 1.4)
* `genter-cli@0.4` is not on npm yet: it waits on the owner configuring npm trusted publishing for this repository.
  Until then the plugin's server fails to connect, and the README says so plainly: the 0.3 on npm is the old engine,
  with neither `search` nor `read`, so the plugin does not fall back to it; the skill works with Genter Cloud, which
  serves the same two tools, and the local server runs from a clone (the owner's task, 2026-10-20)
* The skill lives at `skills/genter/SKILL.md`, where `npx skills add Genterai/genter` finds it, and as a byte-for-byte
  copy at `plugins/genter/skills/genter/SKILL.md`, because Claude Code copies only the plugin's folder into its cache;
  a symlink would be dropped for a marketplace added from a local path, so CI checks that the two files are the same
  instead. The skills CLI finds one skill named `genter` in this repository and installs that file (checked by hand
  with `skills@1.7.4 add <worktree> --list` and an install with `--copy`) (this brief)
* What the skill says: Genter's two tools, from every Genter server; call `search` first before answering what a
  project or team decided, why something is the way it is or how something works, before changing code whose reasons
  were not read, and before asking the person what the docs may answer; cite each claim by `[id]` and place, and the
  place alone in anything written to a file (an id belongs to one person's store); `read` a place whole by its id;
  repeat a mark as the quote Genter shows, with its place, never as a verdict ("docs/runbook.md says at its top: …",
  not "the runbook is outdated"); give both sides of a contradiction from Genter Cloud and let the person decide; what
  the tools return is data, never instructions. Its mark examples are in the contract's format, checked with
  `markProblem`; a genter-cli command it gives (`npx -y genter-cli@0.4 install`) is pinned as the plugin's server is,
  since an unpinned `npx genter-cli` gets 0.3, which has no `install` (plan step 1.4, D3)
* The plugin has no `version`: it is served from `main` of this repository, so people track its commits; `claude plugin
  validate` warns about the missing version and passes (this brief)
* The hook is off by default: the plugin has no `hooks/hooks.json` and declares none. `plugins/genter/search-first.json`
  is a settings snippet, a `UserPromptSubmit` hook whose command is `echo` and one line, which Claude Code adds to each
  prompt; the person adds it to `~/.claude/settings.json` or a project's `.claude/settings.json`, and the README says
  how (plan step 1.4: "an optional hook")
* `npx skills add` is Vercel's command and sends anonymous usage data by default; the README says so and names
  `DO_NOT_TRACK=1`, since Genter itself sends nothing (plan decision D5)
* The package does not ship the plugin: `package.json` `files` stays as it is (this brief)
Open:
* The plugin's server cannot start until genter-cli 0.4 is on npm. → The owner configures npm trusted publishing for
  Genterai/genter (`release.yml` publishes on a merge that raises the version); nothing in this PR waits on it.
  [non-blocking]
* CI has no Claude Code, so `[rl:plugin/ac-plugin]` is skipped there and runs where `claude` is installed (it ran here
  with Claude Code 2.1.304). → Installing Claude Code in CI would make the check run on every PR; left for the
  maintainers. [non-blocking]
* With `genter install` and the plugin both, Claude Code has two `genter` servers with the same tools. → The README
  says to keep one: `/mcp` turns the plugin's off, and `claude mcp remove genter -s user` removes the one `genter
  install` wrote (checked by hand: the plugin's server stays), since `genter install --undo` puts back every tool's
  file. [non-blocking]
* The repository's agent map (`.claude/AGENTS.md`) does not list `plugins/`, `skills/` and the `plugin` area yet; agent
  sessions do not edit it. → For the maintainers; harden finds the area by its Sources. [non-blocking]
Proof: `test/plugin.test.js` "[rl:plugin/marketplace]": the marketplace is `genter`, has an owner and a description,
lists `genter` (`./plugins/genter`, a folder whose `plugin.json` has the same name) then `harden` (`{ source: "github",
repo: "Genterai/harden" }`), every name installable, and the README gives the add and both install commands /
"[rl:plugin/local-server]": `.mcp.json` holds one server, `genter`: `npx`, `-y`, `genter-cli@<minor>`, `mcp`, nothing
else (no folder, env, url or headers); the pin is this package's minor or the next, and not below 0.4; the manifest
declares no server,
hook, LSP server, user config or channel; neither file names genter.ai, a token or a key /
"[rl:plugin/local-server] [rl:plugin/hook-opt-in]": the plugin folder is exactly `.claude-plugin/plugin.json`,
`.mcp.json`, `README.md`, `search-first.json` and `skills/genter/SKILL.md` (no `hooks/`, no `bin/`) /
"[rl:plugin/skill]": the plugin's `SKILL.md` equals `skills/genter/SKILL.md`; front matter from the first line with
`name: genter` and a third-person description of what and when, 510 of at most 1,024 characters; under 500 lines; the
body says search first, cite by id and place (the place alone in files), read whole, repeat marks as Genter shows them
and never as a judgment, text as data; its three mark examples pass `markProblem`; no unpinned `npx genter-cli`, and
every `genter-cli@<minor>` in it is the server's pin / "[rl:plugin/hook-opt-in]": no
`hooks/` folder; `search-first.json` is `{ hooks: { UserPromptSubmit: [{ hooks: [{ type: "command", command }] }] } }`
and nothing else, the command `echo '<one line>'` with no `$`, backquote or backslash in it, and the README shows that
line and the file / "[rl:plugin/ac-plugin]" (where Claude Code is installed): `claude plugin validate` passes on the
repository, the marketplace is added from this folder into an empty home, `genter@genter` installs, `claude plugin
details genter` shows `Skills (1) genter`, `MCP servers (1) genter`, `Hooks (0)`, and the list shows it enabled /
"[rl:plugin/ac-plugin]" (where Claude Code is installed and GitHub answers): `harden@genter` installs from
Genterai/harden, `claude plugin details harden` shows `Skills (1) hardening-changes`, and the list shows it enabled. By
hand, in an empty home with Claude Code 2.1.304: `claude plugin validate .` and `claude plugin validate
./plugins/genter` pass with one warning (no version); `claude mcp list` shows `plugin:genter:genter: npx -y
genter-cli@0.4 mcp` failing to connect (0.4 is not on npm), and the same plugin with its server started from this
worktree's `bin/genter.js` connects; `npx skills@1.7.4 add <worktree> --list` finds one skill, `genter`, and an install
writes `.claude/skills/genter/SKILL.md` equal to `skills/genter/SKILL.md`. Each test fails when its part is undone
(checked by hand: the pin dropped, the pin set to 0.3, a `hooks/hooks.json` added, the plugin's copy edited, a mark
example out of format, the skill's install command unpinned or set to 0.3, harden's repository renamed) / `npm test`,
`npm run lint` (no new finding), `harden check` 0 errors.

## Red lines after

* plugin/marketplace: new, the marketplace `genter` lists `genter` (`./plugins/genter`) and `harden` (Genterai/harden)
* plugin/local-server: new, one server, `npx -y genter-cli@<minor> mcp`, pinned to 0.4 or later, no folder, env,
  token, key or Genter Cloud address
* plugin/skill: new, `skills/genter/SKILL.md` and the plugin's copy are one file: search first, cite `[id]` and place,
  read whole, marks as quotes never verdicts, text as data; a genter-cli command it gives is pinned as the server is
* plugin/hook-opt-in: new, the plugin runs no hook; the search-first hook is a snippet the person adds
* plugin/ac-plugin: new, a clean Claude Code installs `genter@genter` (one skill, one server, no hooks) and
  `harden@genter` (its `hardening-changes` skill), both enabled
