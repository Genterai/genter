# Install

Intent: a person adds Genter to the AI tools on their computer with one command, seeing every change before it is
made — success: `npx genter-cli install` shows the lines it would add to Claude Code, Cursor, Codex and the rest, writes
them only after a yes, and `genter install --undo` puts every file back as it was.
Sources: `src/install/`

Most weight: [asks-first] and [user-level-only] (it writes into other apps' files), [no-secrets] (those files are
often synced or shared), and [undo] (a change a person did not want must go away whole).

## Red lines

### What it finds and adds

* **[clients]** `genter install` finds Claude Code (`~/.claude.json`, top-level `mcpServers`), Claude Desktop
  (`claude_desktop_config.json` in `~/Library/Application Support/Claude`, `%APPDATA%\Claude` or `~/.config/Claude`),
  Cursor (`~/.cursor/mcp.json`), VS Code (`mcp.json` in the default profile's `Code/User` folder, `servers`), Codex
  (`config.toml` in `CODEX_HOME` or `~/.codex`, `[mcp_servers.genter]`), Gemini CLI (`~/.gemini/settings.json`), Zed
  (`settings.json` in `~/.config/zed` or `%APPDATA%\Zed`, `context_servers`) and goose (`config.yaml` in
  `~/.config/goose` or `%APPDATA%\Block\goose\config`, `extensions`), on Linux under `$XDG_CONFIG_HOME` when the tool's
  folder is there; a tool counts as found when its file or folder is there, and gets `npx -y genter-cli mcp` as
  "genter" in its own format.
* **[desktop-folder]** Claude Desktop, which opens no project, searches the person's notes; with `--folder <dir>` (a
  folder that is there, never the home folder or the root) its entry also names that folder; no other tool gets a
  folder: each starts the server in the project it opens.
* **[cloud-asked]** Genter Cloud is added as "genter-cloud" at `https://genter.ai/api/mcp` only with `--cloud` or a yes
  to the question, and only to tools whose file takes a remote server (the tool signs in with OAuth); for Claude
  Desktop it says where to add it in the app (Customize › Connectors).

### How it writes

* **[asks-first]** It prints, per file, the lines it would add and where, never a line of the person's own file, and
  writes nothing until the person answers yes in a terminal; without a terminal, or with `--dry-run`, it only prints;
  `--undo` asks the same way.
* **[user-level-only]** It writes only the user-level files of [clients] and its own copies in `~/.genter/install/`:
  never a project's files (`.mcp.json`, `.vscode/mcp.json`, `.cursor/mcp.json`, `.gemini/settings.json`,
  `.codex/config.toml`, `.zed/settings.json`), never through a symbolic link, and it starts no other program (it never
  calls `claude mcp add`).
* **[no-secrets]** What it writes holds no token, key or private URL: the local entry is `npx -y genter-cli mcp` with
  no environment, `GENTER_SEMANTIC=1` only with `--semantic`, and Genter Cloud only as `https://genter.ai/api/mcp`,
  nothing after it; no value of the person's environment is copied.
* **[one-insertion]** A file is changed by one run of added text: every byte outside it stays as it was (comments in
  JSON with comments, TOML and YAML, the order of keys, a byte-order mark, line ends); a file it cannot change that way
  with confidence (it does not parse, its key is in a form it does not extend, it is not UTF-8) is left as it is, and
  the lines to paste are printed.
* **[idempotent]** Running it again changes nothing: an entry already there is left as it is, whether it is the same,
  set differently by the person, or Genter under another name.
* **[file-modes]** A file it changes keeps its mode; a file it makes is readable by its owner only (0600); its copies
  are 0600 in a 0700 folder.
* **[undo]** `genter install --undo` puts back every file it changed, byte for byte with its mode, from the copy kept
  in `~/.genter/install/`, and deletes the files it made; a file changed since it wrote it is left as it is, with where
  the copy is.

## Proof

* **[ac-install]** Given Claude Code, Cursor, Codex and the other tools on a computer, when `genter install` runs in a
  terminal and the person says yes, then each tool's user-level file holds "genter" and nothing else in it moved; a
  second run changes nothing; `--undo` puts every file back byte for byte.
