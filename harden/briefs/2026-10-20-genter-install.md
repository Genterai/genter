# genter install

Status: shipped
Request: the product owner, 2026-10-20, accepting Genter's open-source plan as proposed: "по всему что предлагаешь"
(on everything you propose), and asking to carry it through to `main`. This is step 1.3 of that plan: `genter install`
finds the AI tools on the computer, shows the change and asks before writing, writes user-level configs only, offers
Genter Cloud as its own server (OAuth), never writes a token or a private URL, and `--undo` restores.

Intent: a person adds Genter to the AI tools on their computer with one command and sees every change first — success:
in a home with Claude Code, Cursor and Codex, `npx genter-cli install` prints the lines it would add to
`~/.claude.json`, `~/.cursor/mcp.json` and `~/.codex/config.toml`, writes them after a yes in a terminal (and nothing
without one), a second run changes nothing, and `genter install --undo` puts all three back byte for byte.
Searched: `npx -y genter-cli@0.3 ask "which file writes the config with mode 0600 and how does the help name Genter
Cloud's MCP address?"` (the local-engine-only brief, `harden/redlines/cli.md` [help] and [cloud-own-server],
`bin/local.js`: `--cloud` exits 1 today, so install's `--cloud` changes that line) and `npx -y genter-cli@0.3 ask "how
does a person add genter mcp to Cursor, VS Code or another MCP client, and which project file gets committed?"` (the
README's "Other MCP clients" snippet with `mcp .`, `src/mcp-server.js`, `examples/project/` and its committed
`.mcp.json`). Both ran from a scratch install of 0.3 against this worktree: inside the repository `npx genter-cli`
resolves to the repository itself and answers "genter: not found".
Sources: `bin/local.js`, `src/local.js` (find adds the current folder first, never the home folder or the root),
`src/mcp-server.js`, `harden/redlines/cli.md`, `harden/redlines/security.md`, `README.md`; each tool's own docs, read
on 2026-10-20:
* Claude Code: https://code.claude.com/docs/en/mcp (user scope in `~/.claude.json`, at its top level; `type` `stdio`
  and `http`; an entry with no `type` is stdio; `/mcp` signs in with OAuth; `CLAUDE_PROJECT_DIR` is set "in the spawned
  server's environment to the project root"; the page names no working directory for a stdio server)
* Claude Desktop: https://modelcontextprotocol.io/docs/develop/connect-local-servers (the file on macOS and Windows,
  `mcpServers` with `command` and `args`); https://claude.com/docs/third-party/claude-desktop/configuration (the app's
  folder on Linux, `~/.config/Claude/`, where its logs are); https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
  (a remote server is a custom connector, Customize › Connectors; the file's local servers are "a separate mechanism")
* Cursor: https://cursor.com/docs/mcp (`~/.cursor/mcp.json` "for tools available everywhere", `.cursor/mcp.json` per
  project; `type` `"stdio"` is required in its field table; a remote server is a `url`; OAuth with dynamic client
  registration unless static credentials are given; nothing on the folder a stdio server starts in)
* VS Code: https://code.visualstudio.com/docs/agents/reference/mcp-configuration (`mcp.json` in the user profile,
  "MCP: Open User Configuration"; `servers`; stdio and http fields; `cwd` "defaults to the workspace folder");
  https://code.visualstudio.com/docs/configure/settings (the `Code/User` folder on each system; other profiles under
  `User/profiles/<id>/`); https://code.visualstudio.com/docs/copilot/guides/mcp-developer-guide (Dynamic Client
  Registration)
* Codex: https://learn.chatgpt.com/docs/extend/mcp?surface=cli (`[mcp_servers.<name>]` with `command`, `args`, `env`,
  `cwd` "Working directory to start the server from", no default given; a streamable HTTP server is a `url`;
  `codex mcp login <name>`; `.codex/config.toml` for trusted projects);
  https://developers.openai.com/codex/config-advanced (`CODEX_HOME`, by default `~/.codex`)
* Gemini CLI: https://geminicli.com/docs/tools/mcp-server/ and
  https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md (`~/.gemini/settings.json`,
  `mcpServers`, `httpUrl` for streamable HTTP, OAuth found from a 401, dynamic client registration; `cwd` "Working
  directory for Stdio transport", no default given)
* Zed: https://zed.dev/docs/ai/mcp (`context_servers`, `command`/`args`/`env`, a remote `url`; OAuth when no
  Authorization header is set; nothing on the folder a server starts in); https://github.com/zed-industries/zed/blob/main/docs/src/configuring-zed.md (settings
  in `~/.config/zed` on macOS and Linux, `$XDG_CONFIG_HOME/zed` when set, `%APPDATA%\Zed` on Windows; "JSON with
  support for `//` comments")
* goose: https://github.com/block/goose/blob/main/documentation/docs/guides/config-files.md (`config.yaml` in
  `~/.config/goose` or `%APPDATA%\Block\goose\config`; the stdio and streamable_http extension shapes);
  https://github.com/block/goose/blob/main/documentation/docs/getting-started/using-extensions.md (remote extensions
  get a client id by client ID metadata documents or Dynamic Client Registration)
* Windsurf: https://docs.windsurf.com/windsurf/cascade/mcp redirects to https://docs.devin.ai/desktop/cascade/mcp
  (`~/.config/devin/mcp_config.json`, for the legacy Cascade agent), while
  https://docs.devin.ai/desktop/devin-desktop-faq names `~/.codeium/mcp_config.json`; neither names
  `~/.codeium/windsurf/mcp_config.json`
* Genter Cloud: https://genter.ai/.well-known/oauth-authorization-server advertises dynamic client registration,
  client ID metadata documents and PKCE (S256); https://genter.ai/api/mcp answers 401 with its protected-resource
  metadata
Red lines: cli/no-packages, cli/help, cli/cloud-own-server, cli/config-private, local-search/first-search-adds-folder,
security/never-run; new: install/clients, install/desktop-folder, install/cloud-asked, install/asks-first,
install/user-level-only, install/no-secrets, install/one-insertion, install/idempotent, install/file-modes,
install/undo, install/ac-install
Decided:
* The rules are the plan's step 1.3 as proposed: the change shown and confirmed, a dry run without a terminal,
  user-level configs only, Genter Cloud at `https://genter.ai/api/mcp` signed in with OAuth, never a token or a
  private URL, new files 0600, `--undo` restores (the owner, 2026-10-20, accepting the plan)
* The local entry is `npx -y genter-cli mcp` with no folder: the server reads the project of the folder the tool
  starts it in (step 0.3 detects it from there); with no folder it never adds the home folder or the root, while the
  README's `mcp .` would add the home folder when a tool starts it there. Claude Desktop opens no project, so its entry
  reads the person's notes, or the folder named with `--folder` (never the home folder or the root, as `ask` never adds
  them) (plan step 1.3)
* Where each tool starts the server, and so what install says Genter searches there: VS Code, the workspace folder (its
  docs: `cwd` "defaults to the workspace folder"); Claude Code, Codex and Gemini CLI, the folder they run in (they run
  in a terminal; Codex's and Gemini CLI's docs give `cwd` no default, and a server started with none runs in the
  tool's own folder; Claude Code also sets `CLAUDE_PROJECT_DIR` to the project root); Cursor, Zed and goose do not say
  (their docs are silent, and goose's desktop app opens no project), so install says that Genter searches the project
  there, or only the notes when it is the home folder
* Windsurf is dropped: its docs now redirect to Devin Desktop's, which name two different files and neither of the one
  asked about; a client whose file the docs do not confirm is left out, and `src/install/devin.js` can come once they
  agree (plan step 1.3)
* Claude Desktop gets no remote entry: its file holds local servers, and a remote server is a custom connector in the
  app; install says where to add Genter Cloud (Customize › Connectors) instead
* The change printed is the lines Genter adds and where they go, never a line of the person's file, which can hold
  their own keys (an `env` beside it)
* A file is changed by one run of added text only, checked by reading it back: JSON must read as before plus the
  entries; TOML (tables appended at the end) must scan as the same headers and keys, then Genter's tables; YAML
  (children appended to the block) as the same children, then Genter's. The TOML scan skips strings, comments and
  arrays or inline tables over several lines; the YAML scan skips block scalars (`|`, `>`) and takes a quoted
  `"extensions":` as the key; both compare Genter's own entries with Windows line ends ignored. A file that does not
  parse, an inline `mcp_servers = {…}`, an array or string that never closes, `extensions: {}` or a list, a `|+`
  block scalar in it, tabs or several YAML documents, text that is not UTF-8, or a symbolic link is left as it is and
  the lines to paste are printed
* An entry named "genter" that differs, and Genter under another name (an entry that runs genter-cli, or one at Genter
  Cloud's address, in TOML also a key of `[mcp_servers]`), are left as the person has them
* `--undo` walks each file back write by write while it is what genter install wrote. A file saved since (Claude Code
  rewrites `~/.claude.json` when it starts, and install tells the person to restart it; goose and the person may save
  theirs) is never overwritten: Genter's entries are taken out of it as it is now, if they are still as genter install
  wrote them (JSON: each member by its value, with its comma, comments kept, the file read back as before without
  them; TOML and YAML: the added run, when it is there once as written). Otherwise the file is left, the command exits
  1 and names the copy. The manifest keeps what each write added (its entries and its text), so nothing is guessed
* install's own flags are said, not dropped: `--folder`, `--undo` or `--dry-run` on another command exits 1, as
  `--cloud` does; `--folder` with no folder exits 1; `--undo` with a tool name exits 1 (it puts back every file)
* `--cloud` still exits 1 on every other command (cli/cloud-own-server); on `install` it adds the address
* No version bump: install reaches npm with the next minor (plan, Phase 0 then Phase 1)
Open:
* Until step 0.3 ships, `genter mcp` with no folder adds the first folder it starts in and then searches every folder
  added, not only the project the tool opens; the line install prints describes 0.3. Proposal: release install with or
  after 0.3 (0.4.0 is raised once Phase 0 is done) [non-blocking]
* Writing into other apps' configs is the owner's to confirm (`.claude/AGENTS.md`: keys, anything hard to reverse):
  the rules built here are the plan's step 1.3 as accepted, and what this brief adds is under Decided. Proposal: the
  owner reads Decided on the PR before it is merged [non-blocking: accepted with the plan, and undone by `--undo`]
* VS Code's other profiles, VS Code Insiders and VSCodium keep their own `mcp.json`, and Claude Code's
  `CLAUDE_CONFIG_DIR` moves its folder. Proposal: installer contributions, one small file each [non-blocking]
* Claude Desktop on Linux: its docs name `~/.config/Claude/` as the app's folder, not the file itself. Proposal: found
  only when that folder is there, as now [non-blocking]
* Cursor, Zed and goose do not document the folder a stdio server starts in, so for them install promises no project.
  Proposal: step 0.3 also takes the project from what the client names (MCP roots, or `CLAUDE_PROJECT_DIR`), and
  install's line for them is made sure then [non-blocking]
Proof: `test/install.test.js`, in a temp HOME with `XDG_CONFIG_HOME` and `APPDATA` pointed into it:
"[rl:install/clients] [rl:install/user-level-only] [rl:install/one-insertion] [rl:install/ac-install]" a snapshot of
each tool's written file, each one its old text plus one run, comments kept; only the eight user-level files and the
copies change, and a project's `.mcp.json`, `.vscode/mcp.json`, `.cursor/mcp.json`, `.gemini/settings.json`,
`.zed/settings.json` and `.codex/config.toml` stay as they were / "[rl:install/clients]" the paths on macOS, Windows
and Linux, `XDG_CONFIG_HOME` and `CODEX_HOME` / "[rl:install/asks-first]" the command with no terminal prints the
change and writes nothing, `--dry-run` and a no write nothing, only y or yes is a yes / "[rl:install/cloud-asked]" /
"[rl:install/no-secrets]" with five keys in the env and `--semantic --cloud`, nothing added holds a key, "token",
"/api/mcp/" and more, or a URL but Genter Cloud's, and the person's own token beside it is never printed /
"[rl:install/file-modes]" / "[rl:install/idempotent] [rl:install/one-insertion]" a second run leaves bytes and times;
entries already there are left; Windows line ends in TOML and YAML kept in what is added, and the second run sees
Genter's entries as the same / "[rl:install/undo]" every file back byte for byte with its mode after two runs, made
files deleted; a file edited by hand, and one edited between two runs, keep the edit and lose Genter's entry; a
changed Genter entry is left, exit 1; `--undo` with a tool name exits 1 / "[rl:install/undo]" Claude Code saves
`~/.claude.json` its own way (`numStartups` + 1, `JSON.stringify(…, null, 2)`) and `--undo` takes out "genter" and
"genter-cloud" alone, as one run; Codex's and goose's added lines are taken out beside the person's later lines;
goose's file saved in another layout is left, exit 1 / "[rl:install/undo]" taking out, format by format: before
another member, last, after a trailing comma, past a comment, the only one, compact; not as written, a key twice,
not JSON, a cut a comment would swallow / "[rl:install/one-insertion]" the files it leaves (unparseable JSONC, a key
twice, not an object, inline TOML, `extensions: {}`, a link), a byte-order mark and Windows line ends kept, a file
of only a byte-order mark; TOML: a multi-line array of arrays before an inline `mcp_servers`, an array that never
closes, Genter inline or dotted under `[mcp_servers]`; YAML: a quoted `"extensions":`, a block scalar with a `#` line
and a blank line, a folded scalar, `|+` left / "[rl:install/desktop-folder] [rl:install/asks-first]" `--folder`
alone, and `--folder`, `--undo` and `--dry-run` on `genter mcp`, exit 1 / "[rl:install/ac-install]" also: the line
on where each tool starts Genter / a real terminal through `script`: no to Genter Cloud, yes to write, then `--undo`
and yes / the existing `test/security.test.js` [never-run], which reads `src/` recursively, covers `src/install/` /
`npm test`, `npm run lint`, `harden check`

## Red lines after

* install/clients: new, the eight tools and where each keeps its user-level file
* install/desktop-folder: new, Claude Desktop searches the notes, or `--folder`; no other tool gets a folder, and
  what Genter searches from each is said only where the tool's start folder is settled
* install/cloud-asked: new, Genter Cloud only on `--cloud` or a yes, only where the file takes a remote server
* install/asks-first: new, the lines shown, nothing written without a yes in a terminal; its flags elsewhere exit 1
* install/user-level-only: new, only the user-level files, never a project's, never through a link, no other program
* install/no-secrets: new, no token, key or private URL; `GENTER_SEMANTIC=1` only with `--semantic`
* install/one-insertion: new, one run of added text, read back in every format, or the file left and the lines
  printed
* install/idempotent: new, a second run changes nothing
* install/file-modes: new, modes kept, new files 0600, copies 0600 in a 0700 folder
* install/undo: new, back byte for byte; a file saved since has Genter's entries alone taken out while they are as
  written, else it is left
* install/ac-install: new, the acceptance case
* cli/no-packages: text changed, the commands include `install`
* cli/cloud-own-server: text changed, `genter install --cloud` adds Genter Cloud's address; `--cloud` elsewhere still
  exits 1
