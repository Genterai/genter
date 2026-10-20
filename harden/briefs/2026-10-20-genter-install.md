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
  and `http`; an entry with no `type` is stdio; `/mcp` signs in with OAuth; `CLAUDE_PROJECT_DIR` is set for the server)
* Claude Desktop: https://modelcontextprotocol.io/docs/develop/connect-local-servers (the file on macOS and Windows,
  `mcpServers` with `command` and `args`); https://claude.com/docs/third-party/claude-desktop/configuration (the app's
  folder on Linux, `~/.config/Claude/`, where its logs are); https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
  (a remote server is a custom connector, Customize › Connectors; the file's local servers are "a separate mechanism")
* Cursor: https://cursor.com/docs/mcp (`~/.cursor/mcp.json` "for tools available everywhere", `.cursor/mcp.json` per
  project; `type` `"stdio"` is required in its field table; a remote server is a `url`; OAuth with dynamic client
  registration unless static credentials are given)
* VS Code: https://code.visualstudio.com/docs/agents/reference/mcp-configuration (`mcp.json` in the user profile,
  "MCP: Open User Configuration"; `servers`; stdio and http fields; `cwd` "defaults to the workspace folder");
  https://code.visualstudio.com/docs/configure/settings (the `Code/User` folder on each system; other profiles under
  `User/profiles/<id>/`); https://code.visualstudio.com/docs/copilot/guides/mcp-developer-guide (Dynamic Client
  Registration)
* Codex: https://learn.chatgpt.com/docs/extend/mcp?surface=cli (`[mcp_servers.<name>]` with `command`, `args`, `env`,
  `cwd`; a streamable HTTP server is a `url`; `codex mcp login <name>`; `.codex/config.toml` for trusted projects);
  https://developers.openai.com/codex/config-advanced (`CODEX_HOME`, by default `~/.codex`)
* Gemini CLI: https://geminicli.com/docs/tools/mcp-server/ and
  https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md (`~/.gemini/settings.json`,
  `mcpServers`, `httpUrl` for streamable HTTP, OAuth found from a 401, dynamic client registration)
* Zed: https://zed.dev/docs/ai/mcp (`context_servers`, `command`/`args`/`env`, a remote `url`; OAuth when no
  Authorization header is set); https://github.com/zed-industries/zed/blob/main/docs/src/configuring-zed.md (settings
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
* The local entry is `npx -y genter-cli mcp` with no folder: each tool starts it in the project it opens and the
  server reads that project (step 0.3 detects it from the folder it starts in); with no folder it never adds the home
  folder or the root, while the README's `mcp .` would add the home folder when a tool starts it there. Claude Desktop
  opens no project, so its entry reads the person's notes, or the folder named with `--folder` (never the home folder
  or the root, as `ask` never adds them) (plan step 1.3)
* Windsurf is dropped: its docs now redirect to Devin Desktop's, which name two different files and neither of the one
  asked about; a client whose file the docs do not confirm is left out, and `src/install/devin.js` can come once they
  agree (plan step 1.3)
* Claude Desktop gets no remote entry: its file holds local servers, and a remote server is a custom connector in the
  app; install says where to add Genter Cloud (Customize › Connectors) instead
* The change printed is the lines Genter adds and where they go, never a line of the person's file, which can hold
  their own keys (an `env` beside it)
* A file is changed by one run of added text only, checked by reading the JSON back (it must read as before plus the
  entries) and by construction for TOML (tables appended at the end) and YAML (children appended to the block); a file
  that does not parse, an inline `mcp_servers = {…}`, `extensions: {}` or a list, tabs or several YAML documents, text
  that is not UTF-8, or a symbolic link is left as it is and the lines to paste are printed
* An entry named "genter" that differs, and Genter under another name (an entry that runs genter-cli, or one at Genter
  Cloud's address), are left as the person has them
* `--undo` walks each file back write by write while it is what genter install wrote; a file changed by hand since is
  never overwritten, and the command exits 1 naming the copy
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
Proof: `test/install.test.js`, in a temp HOME with `XDG_CONFIG_HOME` and `APPDATA` pointed into it:
"[rl:install/clients] [rl:install/user-level-only] [rl:install/one-insertion] [rl:install/ac-install]" a snapshot of
each tool's written file, each one its old text plus one run, comments kept; only the eight user-level files and the
copies change, and a project's `.mcp.json`, `.vscode/mcp.json`, `.cursor/mcp.json`, `.gemini/settings.json`,
`.zed/settings.json` and `.codex/config.toml` stay as they were / "[rl:install/clients]" the paths on macOS, Windows
and Linux, `XDG_CONFIG_HOME` and `CODEX_HOME` / "[rl:install/asks-first]" the command with no terminal prints the
change and writes nothing, `--dry-run` and a no write nothing, only y or yes is a yes / "[rl:install/cloud-asked]" /
"[rl:install/no-secrets]" with five keys in the env and `--semantic --cloud`, nothing added holds a key, "token",
"/api/mcp/" and more, or a URL but Genter Cloud's, and the person's own token beside it is never printed /
"[rl:install/file-modes]" / "[rl:install/idempotent]" a second run leaves bytes and times; entries already there are
left / "[rl:install/undo]" every file back byte for byte with its mode after two runs, made files deleted; a file
changed by hand is left, exit 1 / "[rl:install/one-insertion]" the files it leaves (unparseable JSONC, a key twice,
not an object, inline TOML, `extensions: {}`, a link), a byte-order mark and Windows line ends kept, format by format
/ "[rl:install/desktop-folder]" / a real terminal through `script`: no to Genter Cloud, yes to write, then `--undo`
and yes / `test/security.test.js` [never-run] reads `src/install/` too / `npm test`, `npm run lint`, `harden check`

## Red lines after

* install/clients: new, the eight tools and where each keeps its user-level file
* install/desktop-folder: new, Claude Desktop searches the notes, or `--folder`; no other tool gets a folder
* install/cloud-asked: new, Genter Cloud only on `--cloud` or a yes, only where the file takes a remote server
* install/asks-first: new, the lines shown, nothing written without a yes in a terminal
* install/user-level-only: new, only the user-level files, never a project's, never through a link, no other program
* install/no-secrets: new, no token, key or private URL; `GENTER_SEMANTIC=1` only with `--semantic`
* install/one-insertion: new, one run of added text, or the file left and the lines printed
* install/idempotent: new, a second run changes nothing
* install/file-modes: new, modes kept, new files 0600, copies 0600 in a 0700 folder
* install/undo: new, back byte for byte; a file changed by hand since is left
* install/ac-install: new, the acceptance case
* cli/no-packages: text changed, the commands include `install`
* cli/cloud-own-server: text changed, `genter install --cloud` adds Genter Cloud's address; `--cloud` elsewhere still
  exits 1
