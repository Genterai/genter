import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { editJson, editToml, editYaml, parseJsonc, removeJson, removeRun } from "../src/install/edit.js";
import { CLOUD, install, plan, terminalAsk } from "../src/install/index.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const posix = process.platform !== "win32";

// The user-level files of every tool, as a person has them before genter install.
const BEFORE = {
  ".claude.json": '{\n  "numStartups": 3,\n  "projects": {\n    "/work/app": {\n      "mcpServers": {}\n    }\n  },\n  "mcpServers": {}\n}\n',
  ".cursor/mcp.json": '{\n  "mcpServers": {\n    "github": {\n      "command": "npx",\n      "args": ["-y", "@modelcontextprotocol/server-github"],\n      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_personsOwnToken123" }\n    }\n  }\n}\n',
  ".config/Code/User/mcp.json": '{\n  // Servers for every workspace\n  "servers": {\n    "playwright": { "type": "stdio", "command": "npx", "args": ["-y", "@playwright/mcp@latest"] }, // the browser\n  },\n  /* inputs come later */\n}\n',
  ".codex/config.toml": 'model = "gpt-5"\n\n[mcp_servers.docs]\ncommand = "docs-mcp"\nargs = ["--port", "4000"] # local docs\n\n[profiles.review]\ninstructions = """\nRead [mcp_servers.genter] twice.\n"""\n',
  ".gemini/settings.json": '{\n\t"theme": "Default"\n}',
  ".config/zed/settings.json": '// Zed settings\n//\n// For information on how to configure Zed, see the Zed\n// documentation: https://zed.dev/docs/configuring-zed\n{\n  "theme": "One Dark", /* dark, always */\n  "vim_mode": true,\n}\n',
  ".config/goose/config.yaml": "active_provider: anthropic\nextensions:\n  developer:\n    bundled: true\n    enabled: true\n    name: developer\n    timeout: 300\n    type: builtin\n\n# Tools\nGOOSE_MODE: smart_approve\n",
};
const DESKTOP = ".config/Claude/claude_desktop_config.json";

// What each file holds after `genter install` and a yes (no Genter Cloud): the snapshot per tool.
const AFTER = {
  ".claude.json": `{
  "numStartups": 3,
  "projects": {
    "/work/app": {
      "mcpServers": {}
    }
  },
  "mcpServers": {
    "genter": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "genter-cli", "mcp"]
    }
  }
}
`,
  [DESKTOP]: `{
  "mcpServers": {
    "genter": {
      "command": "npx",
      "args": ["-y", "genter-cli", "mcp"]
    }
  }
}
`,
  ".cursor/mcp.json": `{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_personsOwnToken123" }
    },
    "genter": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "genter-cli", "mcp"]
    }
  }
}
`,
  ".config/Code/User/mcp.json": `{
  // Servers for every workspace
  "servers": {
    "playwright": { "type": "stdio", "command": "npx", "args": ["-y", "@playwright/mcp@latest"] }, // the browser
    "genter": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "genter-cli", "mcp"]
    }
  },
  /* inputs come later */
}
`,
  ".codex/config.toml": `model = "gpt-5"

[mcp_servers.docs]
command = "docs-mcp"
args = ["--port", "4000"] # local docs

[profiles.review]
instructions = """
Read [mcp_servers.genter] twice.
"""

[mcp_servers.genter]
command = "npx"
args = ["-y", "genter-cli", "mcp"]
`,
  ".gemini/settings.json": '{\n\t"theme": "Default",\n\t"mcpServers": {\n\t\t"genter": {\n\t\t\t"command": "npx",\n\t\t\t"args": ["-y", "genter-cli", "mcp"]\n\t\t}\n\t}\n}',
  ".config/zed/settings.json": `// Zed settings
//
// For information on how to configure Zed, see the Zed
// documentation: https://zed.dev/docs/configuring-zed
{
  "theme": "One Dark", /* dark, always */
  "vim_mode": true,
  "context_servers": {
    "genter": {
      "command": "npx",
      "args": ["-y", "genter-cli", "mcp"]
    }
  }
}
`,
  ".config/goose/config.yaml": `active_provider: anthropic
extensions:
  developer:
    bundled: true
    enabled: true
    name: developer
    timeout: 300
    type: builtin
  genter:
    type: stdio
    name: genter
    enabled: true
    cmd: npx
    args: ["-y", "genter-cli", "mcp"]
    env_keys: []
    envs: {}
    timeout: 300

# Tools
GOOSE_MODE: smart_approve
`,
};

// A computer with every tool on it, in a temp folder: its home, and the env that points XDG_CONFIG_HOME and APPDATA
// into it, so nothing outside the temp folder is ever read or written.
function computer(files = BEFORE) {
  const base = mkdtempSync(join(tmpdir(), "genter-install-"));
  const home = join(base, "home");
  for (const dir of [".cursor", ".codex", ".gemini", ".config/Code/User", ".config/zed", ".config/goose", ".config/Claude"]) mkdirSync(join(home, dir), { recursive: true });
  for (const [file, text] of Object.entries(files)) writeFileSync(join(home, file), text, { mode: 0o644 });
  if (posix) for (const file of Object.keys(files)) chmodSync(join(home, file), 0o644);
  const env = { XDG_CONFIG_HOME: join(home, ".config"), APPDATA: join(home, "AppData", "Roaming") };
  const lines = [];
  const asked = [];
  // install() as the command runs it, the person's answers given: { cloud, write, back } (undefined: no terminal).
  const run = (options = {}, answers) =>
    install({
      home,
      env,
      platform: "linux",
      genterHome: join(home, ".genter"),
      out: (l) => lines.push(l),
      ask:
        answers &&
        (async (q) => {
          asked.push(q);
          return /Genter Cloud/.test(q) ? Boolean(answers.cloud) : /^\s*Write/.test(q) ? Boolean(answers.write) : Boolean(answers.back);
        }),
      ...options,
    });
  const read = (file) => readFileSync(join(home, file), "utf8");
  const output = () => lines.join("\n");
  return { base, home, env, run, read, lines, asked, output, done: () => rmSync(base, { recursive: true, force: true }) };
}

// Every file under a folder, with its bytes.
function tree(dir, out = {}, prefix = "") {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) tree(path, out, `${prefix}${name}/`);
    else out[`${prefix}${name}`] = readFileSync(path);
  }
  return out;
}

// `after` is `before` with one run of text added: the run, or null when more than that changed.
function added(before, after) {
  let p = 0;
  while (p < before.length && before[p] === after[p]) p++;
  if (after.length < before.length || !after.endsWith(before.slice(p))) return null;
  return after.slice(p, after.length - (before.length - p));
}

describe("genter install", () => {
  it("[rl:install/clients] [rl:install/user-level-only] [rl:install/one-insertion] [rl:install/ac-install] adds genter to every tool found, in its own user-level file, as one insertion", async () => {
    const pc = computer();
    // A project the person works in, with the project files that get committed: never read, never written.
    const project = join(pc.base, "project");
    for (const file of [".mcp.json", ".vscode/mcp.json", ".cursor/mcp.json", ".gemini/settings.json", ".zed/settings.json", ".codex/config.toml"]) {
      mkdirSync(join(project, file, ".."), { recursive: true });
      writeFileSync(join(project, file), "{}\n");
    }
    const cwd = process.cwd();
    try {
      process.chdir(project);
      const before = tree(pc.base);
      assert.equal(await pc.run({}, { cloud: false, write: true }), 0, pc.output());
      assert.match(pc.output(), /Found: Claude Code, Claude Desktop, Cursor, VS Code, Codex, Gemini CLI, Zed and goose\./);
      // What Genter searches from each tool, said only where the tool's docs (or its terminal) settle the folder.
      assert.match(pc.output(), /\nClaude Code, VS Code, Codex and Gemini CLI start npx -y genter-cli mcp in the folder you open or run them in, and Genter searches that project and your notes\.\nCursor, Zed and goose do not say which folder they start Genter in: Genter searches the project there, or only your notes when that is your home folder\.\nClaude Desktop opens no project: there Genter searches your notes \(or a folder you name with --folder\)\.\n/);
      for (const [file, text] of Object.entries(AFTER)) assert.equal(pc.read(file), text, file);
      for (const file of Object.keys(BEFORE)) assert.notEqual(added(BEFORE[file], pc.read(file)), null, `${file}: one insertion`);
      // Comments in JSONC stay byte for byte, beside the entry.
      assert.match(pc.read(".config/Code/User/mcp.json"), /\/\/ Servers for every workspace[\s\S]*\/\/ the browser\n {4}"genter"[\s\S]*\/\* inputs come later \*\//);
      // Only the eight user-level files and genter install's own copies changed; the project is as it was.
      const after = tree(pc.base);
      const changed = Object.keys(after).filter((f) => !before[f]?.equals(after[f]));
      assert.deepEqual(changed.filter((f) => !f.startsWith("home/.genter/install/")).sort(), [...Object.keys(BEFORE), DESKTOP].map((f) => `home/${f}`).sort());
      assert.deepEqual(Object.keys(before).filter((f) => !after[f]), []);
      for (const file of Object.keys(after).filter((f) => f.startsWith("project/"))) assert.ok(before[file].equals(after[file]), file);
    } finally {
      process.chdir(cwd);
      pc.done();
    }
  });

  it("[rl:install/clients] finds each tool where its own docs put it, on macOS, Windows and Linux", () => {
    const base = mkdtempSync(join(tmpdir(), "genter-install-paths-"));
    try {
      const home = join(base, "home");
      const found = (platform, env = {}) => Object.fromEntries(plan({ home, env, platform }).filter((i) => i.found).map((i) => [i.client.id, i.file.slice(base.length + 1)]));
      const dirs = (list) => {
        rmSync(home, { recursive: true, force: true });
        for (const d of list) mkdirSync(join(home, d), { recursive: true });
      };
      dirs(["Library/Application Support/Claude", "Library/Application Support/Code/User", ".config/zed", ".config/goose", ".cursor", ".codex", ".gemini"]);
      writeFileSync(join(home, ".claude.json"), "{}");
      assert.deepEqual(found("darwin"), {
        "claude-code": "home/.claude.json",
        "claude-desktop": "home/Library/Application Support/Claude/claude_desktop_config.json",
        cursor: "home/.cursor/mcp.json",
        vscode: "home/Library/Application Support/Code/User/mcp.json",
        codex: "home/.codex/config.toml",
        gemini: "home/.gemini/settings.json",
        zed: "home/.config/zed/settings.json",
        goose: "home/.config/goose/config.yaml",
      });
      dirs(["AppData/Roaming/Claude", "AppData/Roaming/Code/User", "AppData/Roaming/Zed", "AppData/Roaming/Block/goose/config"]);
      assert.deepEqual(found("win32", { APPDATA: join(home, "AppData", "Roaming") }), {
        "claude-desktop": "home/AppData/Roaming/Claude/claude_desktop_config.json",
        vscode: "home/AppData/Roaming/Code/User/mcp.json",
        zed: "home/AppData/Roaming/Zed/settings.json",
        goose: "home/AppData/Roaming/Block/goose/config/config.yaml",
      });
      // Linux: $XDG_CONFIG_HOME when the tool's folder is there, else ~/.config; Codex follows CODEX_HOME.
      dirs(["xdg/Code/User", ".config/zed", "codex-home"]);
      assert.deepEqual(found("linux", { XDG_CONFIG_HOME: join(home, "xdg"), CODEX_HOME: join(home, "codex-home") }), {
        vscode: "home/xdg/Code/User/mcp.json",
        codex: "home/codex-home/config.toml",
        zed: "home/.config/zed/settings.json",
      });
      // Not there: nothing found, nothing to add to.
      dirs([]);
      assert.deepEqual(found("linux"), {});
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("[rl:install/asks-first] without a terminal it only prints the change; --dry-run and a no write nothing", async () => {
    const pc = computer();
    try {
      // The command itself, with no terminal: stdin is a pipe.
      const env = { PATH: process.env.PATH, HOME: pc.home, ...pc.env, GENTER_HOME: join(pc.home, ".genter") };
      const before = tree(pc.base);
      const out = spawnSync(process.execPath, [join(root, "bin/genter.js"), "install"], { cwd: pc.base, env, encoding: "utf8", input: "y\ny\n" });
      assert.equal(out.status, 0, out.stderr);
      assert.match(out.stdout, /Cursor · ~\/\.cursor\/mcp\.json\n@@ ~\/\.cursor\/mcp\.json:7 @@\n\+,\n\+ {4}"genter": \{/);
      assert.match(out.stdout, /Nothing written \(no terminal to ask in\)\. Run genter install in a terminal to write 8 files/);
      assert.doesNotMatch(out.stdout, /genter-cloud|Also add Genter Cloud/);
      assert.deepEqual(tree(pc.base), before);
      assert.equal(existsSync(join(pc.home, ".genter")), false);

      assert.equal(await pc.run({ dryRun: true }, { cloud: true, write: true }), 0);
      assert.deepEqual(pc.asked, []);
      assert.match(pc.output(), /Nothing written \(--dry-run\)/);
      assert.equal(await pc.run({}, { cloud: false, write: false }), 0);
      assert.match(pc.asked.at(-1), /^\nWrite 8 files\? .*\[y\/N\] $/);
      assert.match(pc.output(), /Nothing written\.$/);
      assert.deepEqual(tree(pc.base), before);
    } finally {
      pc.done();
    }
  });

  it("[rl:install/asks-first] asks in a terminal only, and takes only a yes", async () => {
    assert.equal(terminalAsk(new PassThrough(), new PassThrough()), null);
    const tty = () => Object.assign(new PassThrough(), { isTTY: true });
    for (const [answer, yes] of [["y\n", true], ["Yes\n", true], ["\n", false], ["no\n", false], ["yy\n", false]]) {
      const input = tty();
      const output = tty();
      const ask = terminalAsk(input, output);
      const asked = ask("Write? [y/N] ");
      input.write(answer);
      assert.equal(await asked, yes, answer);
    }
  });

  it("[rl:install/cloud-asked] adds Genter Cloud's address only on a yes, and only where the tool's file takes a remote server", async () => {
    const pc = computer();
    try {
      assert.equal(await pc.run({}, { cloud: true, write: true }), 0, pc.output());
      const entry = (file, key) => parseJsonc(pc.read(file)).value[key]["genter-cloud"];
      assert.deepEqual(entry(".claude.json", "mcpServers"), { type: "http", url: CLOUD });
      assert.deepEqual(entry(".cursor/mcp.json", "mcpServers"), { url: CLOUD });
      assert.deepEqual(entry(".config/Code/User/mcp.json", "servers"), { type: "http", url: CLOUD });
      assert.deepEqual(entry(".gemini/settings.json", "mcpServers"), { httpUrl: CLOUD });
      assert.deepEqual(entry(".config/zed/settings.json", "context_servers"), { url: CLOUD });
      assert.match(pc.read(".codex/config.toml"), /\n\n\[mcp_servers\.genter-cloud\]\nurl = "https:\/\/genter\.ai\/api\/mcp"\n$/);
      assert.match(pc.read(".config/goose/config.yaml"), /\n {2}genter-cloud:\n {4}type: streamable_http\n {4}name: genter-cloud\n {4}enabled: true\n {4}uri: "https:\/\/genter\.ai\/api\/mcp"\n/);
      // Claude Desktop takes a remote server as a connector in the app, not in its file: it is told where.
      assert.equal(entry(DESKTOP, "mcpServers"), undefined);
      assert.match(pc.output(), /Claude Desktop takes Genter Cloud as a custom connector, not in its file: Customize › Connectors › \+ Add › Add custom connector, then https:\/\/genter\.ai\/api\/mcp/);
      assert.match(pc.output(), /Claude Code: run \/mcp to sign in to genter-cloud\.\nCodex: run codex mcp login genter-cloud to sign in\./);
    } finally {
      pc.done();
    }
    const no = computer();
    try {
      await no.run({}, { cloud: false, write: true });
      for (const file of [...Object.keys(BEFORE), DESKTOP]) assert.doesNotMatch(no.read(file), /genter-cloud|genter\.ai/, file);
      // --cloud asks nothing more; with no terminal it is shown, not written.
      const flag = computer();
      await flag.run({ cloud: true });
      assert.match(flag.output(), /\+ {4}"genter-cloud": \{/);
      assert.doesNotMatch(flag.output(), /Also add Genter Cloud/);
      flag.done();
    } finally {
      no.done();
    }
  });

  it("[rl:install/no-secrets] writes no token, key or private URL, and prints no line of the person's file", async () => {
    const pc = computer();
    try {
      // Stand-ins for the keys a person has set, made here so that no key-shaped text is committed.
      const secrets = Object.fromEntries(["OPENAI_API_KEY", "OPENROUTER_API_KEY", "GENTER_TOKEN", "GENTER_EMBED_KEY", "ANTHROPIC_API_KEY"].map((name, n) => [name, `stand-in-${n}-${"z".repeat(12)}`]));
      Object.assign(pc.env, secrets);
      assert.equal(await pc.run({ semantic: true }, { cloud: true, write: true }), 0);
      for (const file of [...Object.keys(BEFORE), DESKTOP]) {
        const add = added(BEFORE[file] ?? "", pc.read(file));
        assert.notEqual(add, null, file);
        for (const value of Object.values(secrets)) assert.ok(!add.includes(value), `${file} holds ${value}`);
        assert.doesNotMatch(add, /token|secret|bearer|password|api[_-]?key|authorization/i, file);
        assert.doesNotMatch(add, /\/api\/mcp\//, file);
        for (const url of add.match(/https?:\/\/[^"'\s]+/g) ?? []) assert.equal(url, CLOUD, file);
        assert.match(add, /GENTER_SEMANTIC\W+1/, file);
        assert.doesNotMatch(add.replace(/GENTER_SEMANTIC/g, ""), /[A-Z]{3,}_[A-Z_]+/, file);
      }
      // What it prints is its own lines: the person's token beside it in ~/.cursor/mcp.json is never shown.
      assert.doesNotMatch(pc.output(), /ghp_personsOwnToken123|GITHUB_PERSONAL_ACCESS_TOKEN/);
      for (const value of Object.values(secrets)) assert.ok(!pc.output().includes(value));
      // The backups hold the person's files as they were, readable by them only.
      if (posix) for (const name of readdirSync(join(pc.home, ".genter/install"))) assert.equal(statSync(join(pc.home, ".genter/install", name)).mode & 0o777, 0o600, name);
    } finally {
      pc.done();
    }
    const plain = computer();
    try {
      await plain.run({}, { cloud: false, write: true });
      for (const file of [...Object.keys(BEFORE), DESKTOP]) assert.doesNotMatch(plain.read(file), /GENTER_SEMANTIC/, file);
    } finally {
      plain.done();
    }
  });

  it("[rl:install/file-modes] keeps a file's mode, makes new files 0600 and keeps its copies in a 0700 folder", { skip: !posix }, async () => {
    const pc = computer();
    try {
      chmodSync(join(pc.home, ".claude.json"), 0o600);
      await pc.run({}, { cloud: false, write: true });
      assert.equal(statSync(join(pc.home, ".claude.json")).mode & 0o777, 0o600);
      assert.equal(statSync(join(pc.home, ".cursor/mcp.json")).mode & 0o777, 0o644);
      assert.equal(statSync(join(pc.home, DESKTOP)).mode & 0o777, 0o600);
      assert.match(pc.output(), /Claude Desktop · ~\/\.config\/Claude\/claude_desktop_config\.json \(a new file, readable by you only\)/);
      assert.equal(statSync(join(pc.home, ".genter/install")).mode & 0o777, 0o700);
    } finally {
      pc.done();
    }
  });

  it("[rl:install/idempotent] [rl:install/one-insertion] a second run changes nothing (Windows line ends too), and Genter already there (the same, differently or by another name) is left", async () => {
    const pc = computer();
    try {
      await pc.run({}, { cloud: false, write: true });
      const once = tree(pc.base);
      const times = Object.fromEntries([...Object.keys(BEFORE), DESKTOP].map((f) => [f, statSync(join(pc.home, f)).mtimeMs]));
      pc.asked.length = 0;
      pc.lines.length = 0;
      assert.equal(await pc.run({}, { cloud: false, write: true }), 0);
      assert.deepEqual(tree(pc.base), once);
      for (const [f, t] of Object.entries(times)) assert.equal(statSync(join(pc.home, f)).mtimeMs, t, f);
      assert.equal(pc.asked.filter((q) => /Write/.test(q)).length, 0);
      assert.match(pc.output(), /Cursor · ~\/\.cursor\/mcp\.json: "genter" is already there\n/);
      assert.match(pc.output(), /Nothing to change: Genter is in every tool found\.$/);
      // Genter Cloud later: only it is added, and then nothing again.
      await pc.run({ cloud: true }, { write: true });
      assert.match(pc.read(".cursor/mcp.json"), /"genter": \{[\s\S]*"genter-cloud": \{/);
      const twice = tree(pc.base);
      await pc.run({ cloud: true }, { write: true });
      assert.deepEqual(tree(pc.base), twice);
    } finally {
      pc.done();
    }
    const theirs = computer({
      ".cursor/mcp.json": '{\n  "mcpServers": {\n    "genter": { "command": "npx", "args": ["-y", "genter-cli", "mcp", "."], "env": { "GENTER_SEMANTIC": "1" } }\n  }\n}\n',
      ".gemini/settings.json": '{ "mcpServers": { "docs-search": { "command": "npx", "args": ["genter-cli", "mcp", "./docs"] }, "team": { "httpUrl": "https://genter.ai/api/mcp" } } }\n',
      ".codex/config.toml": '[mcp_servers.genter]\ncommand = "node"\nargs = ["genter.js"]\n',
      ".config/goose/config.yaml": 'extensions:\n  my-genter:\n    type: stdio\n    cmd: npx\n    args: ["-y", "genter-cli", "mcp"]\n',
    });
    try {
      const before = tree(theirs.base);
      await theirs.run({ only: ["cursor", "gemini", "codex", "goose"], cloud: true }, { write: true });
      assert.match(theirs.output(), /Cursor · ~\/\.cursor\/mcp\.json: "genter" is already there, set differently: left as you have it/);
      assert.match(theirs.output(), /Gemini CLI · ~\/\.gemini\/settings\.json: "genter" is already there as docs-search\nGemini CLI · ~\/\.gemini\/settings\.json: "genter-cloud" is already there as team/);
      assert.match(theirs.output(), /Codex · ~\/\.codex\/config\.toml: "genter" is already there, set differently/);
      assert.match(theirs.output(), /goose · ~\/\.config\/goose\/config\.yaml: "genter" is already there as my-genter/);
      const after = tree(theirs.base);
      assert.ok(before["home/.gemini/settings.json"].equals(after["home/.gemini/settings.json"]));
      assert.equal(theirs.read(".codex/config.toml"), `${before["home/.codex/config.toml"]}\n[mcp_servers.genter-cloud]\nurl = "https://genter.ai/api/mcp"\n`);
      assert.ok(before["home/.cursor/mcp.json"].length < after["home/.cursor/mcp.json"].length, "only genter-cloud is added beside their genter");
      assert.doesNotMatch(theirs.read(".cursor/mcp.json").replace(/"genter-cloud": \{[^}]*\}/, ""), /"genter": \{ "command": "npx", "args": \["-y", "genter-cli", "mcp"\] \}/);
    } finally {
      theirs.done();
    }
    // Windows line ends: what is added has them too, and the second run sees Genter's own entries as the same.
    const crlf = computer({ ".codex/config.toml": 'model = "o3"\r\n', ".config/goose/config.yaml": "extensions:\r\n  developer:\r\n    type: builtin\r\n" });
    try {
      await crlf.run({ only: ["codex", "goose"] }, { cloud: false, write: true });
      assert.equal(crlf.read(".codex/config.toml"), 'model = "o3"\r\n\r\n[mcp_servers.genter]\r\ncommand = "npx"\r\nargs = ["-y", "genter-cli", "mcp"]\r\n');
      const goose = /\n( {2}genter:\n[\s\S]*? {4}timeout: 300\n)/.exec(AFTER[".config/goose/config.yaml"])[1];
      assert.equal(crlf.read(".config/goose/config.yaml"), `extensions:\n  developer:\n    type: builtin\n${goose}`.replace(/\n/g, "\r\n"));
      const once = tree(crlf.base);
      crlf.lines.length = 0;
      assert.equal(await crlf.run({ only: ["codex", "goose"] }, { cloud: false, write: true }), 0);
      assert.deepEqual(tree(crlf.base), once);
      assert.match(crlf.output(), /Codex · ~\/\.codex\/config\.toml: "genter" is already there\n\ngoose · ~\/\.config\/goose\/config\.yaml: "genter" is already there\n/);
      assert.match(crlf.output(), /Nothing to change: Genter is in every tool found\.$/);
    } finally {
      crlf.done();
    }
  });

  it("[rl:install/undo] [rl:install/asks-first] --undo puts every file back byte for byte, and leaves a file changed by hand since", async () => {
    const pc = computer();
    try {
      const original = tree(pc.base);
      const modes = Object.fromEntries(Object.keys(BEFORE).map((f) => [f, statSync(join(pc.home, f)).mode & 0o777]));
      await pc.run({}, { cloud: false, write: true });
      await pc.run({ cloud: true }, { write: true });
      // Without a terminal it only says what it would do.
      assert.equal(await pc.run({ undo: true }), 0);
      assert.match(pc.output(), /~\/\.cursor\/mcp\.json: put back as it was before genter install\n/);
      assert.match(pc.output(), /~\/\.config\/Claude\/claude_desktop_config\.json: deleted \(genter install made it\)/);
      assert.match(pc.output(), /Nothing put back \(no terminal to ask in\)/);
      assert.equal(await pc.run({ undo: true }, { back: true }), 0, pc.output());
      const back = tree(pc.base);
      const ours = (t) => Object.fromEntries(Object.entries(t).filter(([f]) => !f.startsWith("home/.genter/")));
      assert.deepEqual(ours(back), ours(original));
      for (const [f, bytes] of Object.entries(ours(original))) assert.ok(bytes.equals(back[f]), f);
      assert.equal(existsSync(join(pc.home, DESKTOP)), false);
      if (posix) for (const [f, mode] of Object.entries(modes)) assert.equal(statSync(join(pc.home, f)).mode & 0o777, mode, f);
      assert.deepEqual(readdirSync(join(pc.home, ".genter/install")).filter((n) => n.endsWith(".bak")), []);
      pc.lines.length = 0;
      assert.equal(await pc.run({ undo: true }, { back: true }), 0);
      assert.match(pc.output(), /^Nothing to undo: genter install has changed no file\.$/);
    } finally {
      pc.done();
    }
    // Changed by hand after genter install wrote it: never overwritten; Genter's entry alone is taken out.
    const edited = computer();
    try {
      await edited.run({}, { cloud: false, write: true });
      writeFileSync(join(edited.home, ".cursor/mcp.json"), edited.read(".cursor/mcp.json").replace('"github"', '"gh"'));
      await edited.run({ cloud: true, only: ["gemini"] }, { write: true });
      assert.equal(await edited.run({ undo: true }, { back: true }), 0, edited.output());
      assert.equal(edited.read(".cursor/mcp.json"), BEFORE[".cursor/mcp.json"].replace('"github"', '"gh"'));
      assert.match(edited.output(), /~\/\.cursor\/mcp\.json: saved since genter install wrote it, so Genter's entries are taken out of it as it is now\n/);
      assert.match(edited.output(), /\nTook Genter out of ~\/\.cursor\/mcp\.json\n/);
      assert.equal(edited.read(".gemini/settings.json"), BEFORE[".gemini/settings.json"]);
      assert.equal(edited.read(".codex/config.toml"), BEFORE[".codex/config.toml"]);
      assert.deepEqual(readdirSync(join(edited.home, ".genter/install")).filter((n) => n.endsWith(".bak")), []);
    } finally {
      edited.done();
    }
    // The person changed Genter's entry: it is theirs now, and the file is left as it is.
    const theirs = computer();
    try {
      await theirs.run({ only: ["cursor"] }, { cloud: false, write: true });
      const handEdit = theirs.read(".cursor/mcp.json").replace('"genter-cli", "mcp"]', '"genter-cli", "mcp", "."]');
      writeFileSync(join(theirs.home, ".cursor/mcp.json"), handEdit);
      assert.equal(await theirs.run({ undo: true }, { back: true }), 1);
      assert.equal(theirs.read(".cursor/mcp.json"), handEdit);
      assert.match(theirs.output(), /~\/\.cursor\/mcp\.json: changed since genter install wrote it, and "genter" in it is not as genter install wrote it, so it is left as it is \(as it was before: ~\/\.genter\/install\/[0-9a-f]{16}-0\.bak\)/);
      await assert.rejects(theirs.run({ undo: true, only: ["cursor"] }, { back: true }), /--undo puts back every file genter install changed: it takes no tool name/);
    } finally {
      theirs.done();
    }
    // Changed by hand between two runs: the last run goes back byte for byte, then the first run's entry is taken out.
    const between = computer();
    try {
      await between.run({ only: ["cursor"] }, { cloud: false, write: true });
      writeFileSync(join(between.home, ".cursor/mcp.json"), between.read(".cursor/mcp.json").replace('"github"', '"gh"'));
      await between.run({ only: ["cursor"], cloud: true }, { write: true });
      assert.equal(await between.run({ undo: true }, { back: true }), 0, between.output());
      assert.equal(between.read(".cursor/mcp.json"), BEFORE[".cursor/mcp.json"].replace('"github"', '"gh"'));
      assert.match(between.output(), /put back as it was before genter install wrote it on \d{4}-\d\d-\d\d, then Genter's earlier entries taken out \(it was changed before that\)/);
    } finally {
      between.done();
    }
  });

  it("[rl:install/undo] --undo after the tool saved its own file takes out Genter's entries alone; what it cannot find as written is left", async () => {
    const pc = computer();
    try {
      await pc.run({}, { cloud: true, write: true });
      // Claude Code restarts, as genter install tells the person, and saves ~/.claude.json its own way.
      const c = JSON.parse(pc.read(".claude.json"));
      c.numStartups++;
      const saved = JSON.stringify(c, null, 2);
      writeFileSync(join(pc.home, ".claude.json"), saved);
      // The person adds a line to Codex's file and a key to goose's.
      writeFileSync(join(pc.home, ".codex/config.toml"), `${pc.read(".codex/config.toml")}\n[profiles.fast]\nmodel = "o4-mini"\n`);
      writeFileSync(join(pc.home, ".config/goose/config.yaml"), pc.read(".config/goose/config.yaml").replace("GOOSE_MODE: smart_approve\n", "GOOSE_MODE: auto\n"));
      pc.lines.length = 0;
      assert.equal(await pc.run({ undo: true }, { back: true }), 0, pc.output());
      assert.match(pc.output(), /~\/\.claude\.json: saved since genter install wrote it, so Genter's entries are taken out of it as it is now/);
      // Claude Code's own file is what it saved, without "genter" and "genter-cloud": one run of text taken out.
      const { genter, "genter-cloud": cloud, ...rest } = c.mcpServers;
      assert.ok(genter && cloud);
      assert.deepEqual(JSON.parse(pc.read(".claude.json")), { ...c, mcpServers: rest });
      assert.match(added(pc.read(".claude.json"), saved), /^\s*"genter": \{[^}]*\},\s*"genter-cloud": \{[^}]*\}\s*$/);
      assert.equal(pc.read(".codex/config.toml"), `${BEFORE[".codex/config.toml"]}\n[profiles.fast]\nmodel = "o4-mini"\n`);
      assert.equal(pc.read(".config/goose/config.yaml"), BEFORE[".config/goose/config.yaml"].replace("GOOSE_MODE: smart_approve\n", "GOOSE_MODE: auto\n"));
      // Every other file went back byte for byte.
      assert.equal(pc.read(".cursor/mcp.json"), BEFORE[".cursor/mcp.json"]);
      assert.equal(existsSync(join(pc.home, DESKTOP)), false);
    } finally {
      pc.done();
    }
    // goose saved its file its own way: Genter's lines are not there as written, so the file is left, with its copy.
    const rewritten = computer();
    try {
      await rewritten.run({ only: ["goose"] }, { cloud: false, write: true });
      writeFileSync(join(rewritten.home, ".config/goose/config.yaml"), rewritten.read(".config/goose/config.yaml").replace('args: ["-y", "genter-cli", "mcp"]', "args:\n    - -y\n    - genter-cli\n    - mcp"));
      assert.equal(await rewritten.run({ undo: true }, { back: true }), 1);
      assert.match(rewritten.output(), /~\/\.config\/goose\/config\.yaml: changed since genter install wrote it, and Genter's lines in it are not as genter install wrote them, so it is left as it is \(as it was before: /);
    } finally {
      rewritten.done();
    }
  });

  it("[rl:install/one-insertion] a file it cannot edit as one insertion is left as it is, with the lines to paste", async () => {
    const pc = computer({
      ".config/Code/User/mcp.json": '{\n  "servers": { /* a comment that never closes\n}\n',
      ".cursor/mcp.json": '{ "mcpServers": {}, "mcpServers": {} }\n',
      ".gemini/settings.json": '{ "mcpServers": ["not", "an", "object"] }\n',
      ".codex/config.toml": 'mcp_servers = { docs = { command = "docs-mcp" } }\n',
      ".config/goose/config.yaml": "extensions: {}\n",
      ".config/zed/settings.json": "\uFEFF{\r\n  // with a byte-order mark and Windows line ends\r\n  \"vim_mode\": true\r\n}\r\n",
    });
    try {
      const before = tree(pc.base);
      await pc.run({}, { cloud: false, write: true });
      const out = pc.output();
      assert.match(out, /VS Code · ~\/\.config\/Code\/User\/mcp\.json: left as it is, because it does not read as JSON \(a comment that never closes at character \d+\)\. To add Genter, put this in it yourself:\n {2}"servers": \{\n {4}"genter": \{/);
      assert.match(out, /Cursor · .*: left as it is, because it has "mcpServers" twice/);
      assert.match(out, /Gemini CLI · .*: left as it is, because its "mcpServers" is not an object/);
      assert.match(out, /Codex · .*: left as it is, because its "mcp_servers" is written in a form Genter does not extend\. To add Genter, put this in it yourself:\n {2}\[mcp_servers\.genter\]\n {2}command = "npx"/);
      assert.match(out, /goose · .*: left as it is, because its "extensions" is written in a form Genter does not extend[\s\S]*\n {2}extensions:\n {4}genter:\n {6}type: stdio/);
      const after = tree(pc.base);
      for (const f of [".config/Code/User/mcp.json", ".cursor/mcp.json", ".gemini/settings.json", ".codex/config.toml", ".config/goose/config.yaml"]) assert.ok(before[`home/${f}`].equals(after[`home/${f}`]), f);
      // The byte-order mark and the Windows line ends stay, and what is added has them too.
      const zed = pc.read(".config/zed/settings.json");
      assert.equal(added(before["home/.config/zed/settings.json"].toString(), zed), ',\r\n  "context_servers": {\r\n    "genter": {\r\n      "command": "npx",\r\n      "args": ["-y", "genter-cli", "mcp"]\r\n    }\r\n  }');
      // A link may lead into a repository: never written through.
      if (posix) {
        const target = join(pc.base, "dotfiles-mcp.json");
        writeFileSync(target, '{ "mcpServers": {} }\n');
        rmSync(join(pc.home, ".cursor/mcp.json"));
        symlinkSync(target, join(pc.home, ".cursor/mcp.json"));
        pc.lines.length = 0;
        await pc.run({ only: ["cursor"] }, { cloud: false, write: true });
        assert.match(pc.output(), /Cursor · ~\/\.cursor\/mcp\.json: left as it is, because it is a link to another file/);
        assert.equal(readFileSync(target, "utf8"), '{ "mcpServers": {} }\n');
      }
    } finally {
      pc.done();
    }
  });

  it("[rl:install/desktop-folder] [rl:install/asks-first] --folder is for Claude Desktop alone, a folder that is there, never the home folder or the root; install's flags elsewhere exit 1", async () => {
    const pc = computer();
    try {
      const notes = join(pc.base, "notes");
      mkdirSync(notes);
      await pc.run({ folder: notes }, { cloud: false, write: true });
      assert.deepEqual(JSON.parse(pc.read(DESKTOP)).mcpServers.genter.args, ["-y", "genter-cli", "mcp", notes]);
      assert.deepEqual(JSON.parse(pc.read(".cursor/mcp.json")).mcpServers.genter.args, ["-y", "genter-cli", "mcp"]);
      assert.match(pc.output(), /Claude Desktop opens no project: there Genter searches your notes and .*notes\./);
      await assert.rejects(pc.run({ folder: pc.home }), /--folder .*: name a folder of notes or docs, not your home folder/);
      await assert.rejects(pc.run({ folder: "/" }), /not the root/);
      await assert.rejects(pc.run({ folder: join(pc.base, "nowhere") }), /no such folder/);
      await assert.rejects(pc.run({ only: ["windsurf"] }), /no AI tool called windsurf; it knows claude-code, claude-desktop, cursor, vscode, codex, gemini, zed, goose/);
      const env = { PATH: process.env.PATH, HOME: pc.home, ...pc.env, GENTER_HOME: join(pc.home, ".genter") };
      const bad = spawnSync(process.execPath, [join(root, "bin/genter.js"), "install", "--folder", pc.home], { env, encoding: "utf8" });
      assert.equal(bad.status, 1);
      assert.match(bad.stderr, /not your home folder/);
      const none = spawnSync(process.execPath, [join(root, "bin/genter.js"), "install", "--folder"], { env, encoding: "utf8" });
      assert.equal(none.status, 1);
      assert.match(none.stderr, /--folder <dir>: name the folder Claude Desktop is to search/);
      // install's own flags on another command: said and refused, never dropped.
      for (const flag of [["--folder", notes], ["--undo"], ["--dry-run"]]) {
        const other = spawnSync(process.execPath, [join(root, "bin/genter.js"), "mcp", ...flag], { env, encoding: "utf8" });
        assert.equal(other.status, 1, flag[0]);
        assert.match(other.stderr, new RegExp(`^${flag[0]} is for genter install`), flag[0]);
      }
    } finally {
      pc.done();
    }
  });
});

describe("one insertion, format by format", () => {
  const local = { command: "npx", args: ["-y", "genter-cli", "mcp"] };
  const want = (value = local) => [{ name: "genter", value, is: (t) => t.includes("genter-cli") }];

  it("[rl:install/one-insertion] JSON: an empty file, an empty object, a single line, and keys that are data", () => {
    assert.equal(editJson("", "mcpServers", want()).text, '{\n  "mcpServers": {\n    "genter": {\n      "command": "npx",\n      "args": ["-y", "genter-cli", "mcp"]\n    }\n  }\n}\n');
    assert.equal(editJson("{}", "mcpServers", want()).text, '{\n  "mcpServers": {\n    "genter": {\n      "command": "npx",\n      "args": ["-y", "genter-cli", "mcp"]\n    }\n  }\n}');
    assert.equal(editJson('{"a":1,"mcpServers":{"x":{"command":"y"}}}', "mcpServers", want()).text, '{"a":1,"mcpServers":{"x":{"command":"y"},"genter":{"command":"npx","args":["-y","genter-cli","mcp"]}}}');
    const proto = '{ "__proto__": { "polluted": true }, "mcpServers": {} }';
    assert.equal(added(proto, editJson(proto, "mcpServers", want()).text) !== null, true);
    assert.equal({}.polluted, undefined);
    assert.match(editJson("[1, 2]", "mcpServers", want()).snippet, /top level is not an object/);
    assert.match(editJson('{ "a": 1 } trailing', "mcpServers", want()).snippet, /does not read as JSON/);
    assert.deepEqual(editJson('{ "mcpServers": { "genter": { "command": "npx", "args": ["-y", "genter-cli", "mcp"] } } }', "mcpServers", want()), { kept: [{ name: "genter", how: "same" }] });
    // A file holding only a byte-order mark keeps it first.
    const bom = editJson("\uFEFF", "mcpServers", want());
    assert.equal(bom.at, 1);
    assert.equal(bom.text.charCodeAt(0), 0xfeff);
    assert.deepEqual(parseJsonc(bom.text).value, { mcpServers: { genter: local } });
  });

  it("[rl:install/one-insertion] TOML: appended as tables, with Genter already there seen in every form", () => {
    const block = '[mcp_servers.genter]\ncommand = "npx"\nargs = ["-y", "genter-cli", "mcp"]\n';
    assert.equal(editToml("", "mcp_servers", want()).text, block);
    assert.equal(editToml('model = "o3"', "mcp_servers", want()).text, `model = "o3"\n\n${block}`);
    assert.equal(editToml('model = "o3"\n', "mcp_servers", want({ ...local, env: { GENTER_SEMANTIC: "1" } })).text, `model = "o3"\n\n${block}env = { GENTER_SEMANTIC = "1" }\n`);
    assert.deepEqual(editToml(`x = 1\n\n${block}`, "mcp_servers", want()).kept, [{ name: "genter", how: "same" }]);
    for (const there of ['[mcp_servers]\ngenter = { command = "npx" }\n', '[mcp_servers]\ngenter.command = "npx"\n', '[mcp_servers."genter"]\ncommand = "npx"\n', '[mcp_servers.genter.env]\nA = "1"\n', `${block}env = { X = "1" }\n`]) {
      assert.deepEqual(editToml(there, "mcp_servers", want()), { kept: [{ name: "genter", how: "differs" }] }, there);
    }
    assert.deepEqual(editToml('[mcp_servers.search]\ncommand = "npx"\nargs = ["genter-cli", "mcp"]\n', "mcp_servers", want()).kept, [{ name: "genter", how: "as search" }]);
    assert.match(editToml('note = """\nnever closed\n', "mcp_servers", want()).snippet, /multi-line string/);
    assert.match(editToml("[[mcp_servers]]\nname = 1\n", "mcp_servers", want()).snippet, /form Genter does not extend/);
    // A header-looking line inside a multi-line string is text, not a table; a "#" or quotes inside a string are text.
    assert.equal(editToml("a = '''\n[mcp_servers.genter]\n'''\n", "mcp_servers", want()).kept.length, 0);
    assert.deepEqual(editToml('a = """x # y"""\n[mcp_servers.genter]\ncommand = "x"\n', "mcp_servers", want()).kept, [{ name: "genter", how: "differs" }]);
    assert.deepEqual(editToml('url = "https://x.test/#a" # """\n[mcp_servers."genter"] # here\n', "mcp_servers", want()).kept, [{ name: "genter", how: "differs" }]);
    assert.equal(editToml('note = "say \\"hi\\" # not a comment"\n', "mcp_servers", want()).text, `note = "say \\"hi\\" # not a comment"\n\n${block}`);
    // A line inside a multi-line array (of arrays too) is no header and no key: the inline table after it is seen.
    assert.match(editToml('notify = [\n  ["a", "b"]\n]\nmcp_servers = { x = { command = "y" } }\n', "mcp_servers", want()).snippet, /form Genter does not extend/);
    assert.equal(editToml('notify = [\n  ["a", "b"],\n]\n', "mcp_servers", want()).text, `notify = [\n  ["a", "b"],\n]\n\n${block}`);
    assert.match(editToml('notify = [\n  "a",\n', "mcp_servers", want()).snippet, /never closes/);
    // Genter under another name, inline or dotted in [mcp_servers], its value over several lines too.
    assert.deepEqual(editToml('[mcp_servers]\nsearch = { command = "npx", args = ["genter-cli", "mcp"] }\n', "mcp_servers", want()).kept, [{ name: "genter", how: "as search" }]);
    assert.deepEqual(editToml('[mcp_servers]\nsearch.command = "npx"\nsearch.args = [\n  "genter-cli",\n  "mcp",\n]\n', "mcp_servers", want()).kept, [{ name: "genter", how: "as search" }]);
    // Windows line ends: Genter's own table is the same.
    assert.deepEqual(editToml(block.replace(/\n/g, "\r\n"), "mcp_servers", want()).kept, [{ name: "genter", how: "same" }]);
  });

  it("[rl:install/one-insertion] YAML: a child of the block, in its indentation, before what follows it", () => {
    const goose = { type: "stdio", name: "genter", enabled: true, cmd: "npx", args: ["-y", "genter-cli", "mcp"], envs: {} };
    const two = '  genter:\n    type: stdio\n    name: genter\n    enabled: true\n    cmd: npx\n    args: ["-y", "genter-cli", "mcp"]\n    envs: {}\n';
    assert.equal(editYaml("", "extensions", want(goose)).text, `extensions:\n${two}`);
    assert.equal(editYaml("GOOSE_MODE: auto", "extensions", want(goose)).text, `GOOSE_MODE: auto\nextensions:\n${two}`);
    assert.equal(editYaml("extensions:\n    dev:\n        type: builtin\nother: 1\n", "extensions", want(goose)).text, `extensions:\n    dev:\n        type: builtin\n${two.replace(/^ {2}/gm, "    ")}other: 1\n`);
    assert.equal(editYaml("extensions:\n  dev:\n    type: builtin", "extensions", want(goose)).text, `extensions:\n  dev:\n    type: builtin\n${two}`);
    assert.equal(editYaml("extensions:\n# none yet\nGOOSE_MODE: auto\n", "extensions", want(goose)).text, `extensions:\n${two}# none yet\nGOOSE_MODE: auto\n`);
    assert.deepEqual(editYaml(`extensions:\n${two}`, "extensions", want(goose)).kept, [{ name: "genter", how: "same" }]);
    assert.deepEqual(editYaml("extensions:\n  genter:\n    type: builtin\n", "extensions", want(goose)).kept, [{ name: "genter", how: "differs" }]);
    assert.match(editYaml("extensions:\n  - dev\n", "extensions", want(goose)).snippet, /a list/);
    assert.match(editYaml("extensions:\n\tdev: 1\n", "extensions", want(goose)).snippet, /tabs/);
    assert.match(editYaml("---\na: 1\n---\nb: 2\n", "extensions", want(goose)).snippet, /several documents/);
    assert.match(editYaml("- a\n- b\n", "extensions", want(goose)).snippet, /not a mapping/);
    assert.match(editYaml("extensions:\n    a:\n      x: 1\n  b: 2\n", "extensions", want(goose)).snippet, /unevenly/);
    // A quoted key is the key; a block scalar's lines are its text, a "#" and a blank line in them too.
    assert.equal(editYaml('"extensions":\n  dev:\n    type: builtin\n', "extensions", want(goose)).text, `"extensions":\n  dev:\n    type: builtin\n${two}`);
    assert.equal(editYaml("extensions:\n  dev:\n    instructions: |\n      do this\n\n      # and this\nother: 1\n", "extensions", want(goose)).text, `extensions:\n  dev:\n    instructions: |\n      do this\n\n      # and this\n${two}other: 1\n`);
    assert.equal(editYaml("extensions:\n  note: >-\n    a: b\n  # mine\n", "extensions", want(goose)).text, `extensions:\n  note: >-\n    a: b\n${two}  # mine\n`);
    assert.match(editYaml("extensions:\n  dev:\n    instructions: |+\n      keep\n\nother: 1\n", "extensions", want(goose)).snippet, /block scalar/);
    // Windows line ends: Genter's own entry is the same.
    assert.deepEqual(editYaml(`extensions:\n${two}`.replace(/\n/g, "\r\n"), "extensions", want(goose)).kept, [{ name: "genter", how: "same" }]);
  });

  it("[rl:install/undo] Genter's entries taken out again: each with its comma, the person's comments kept, or the reason not", () => {
    const G = '"genter": { "command": "npx", "args": ["-y", "genter-cli", "mcp"] }';
    const out = (text) => removeJson(text, "mcpServers", { genter: local });
    // Before another member, the last one, the last with a trailing comma, past a comment, the only one, compact.
    assert.equal(out(`{ "mcpServers": {\n  ${G},\n  "x": 1\n} }`).text, '{ "mcpServers": {\n  "x": 1\n} }');
    assert.equal(out(`{ "mcpServers": {\n  "x": 1,\n  ${G}\n} }`).text, '{ "mcpServers": {\n  "x": 1\n} }');
    assert.equal(out(`{ "mcpServers": {\n  "x": 1, // mine\n  ${G},\n} }`).text, '{ "mcpServers": {\n  "x": 1, // mine\n} }');
    assert.equal(out(`{ "mcpServers": {\n  "x": 1, // mine\n  ${G}\n} }`).text, '{ "mcpServers": {\n  "x": 1 // mine\n} }');
    assert.equal(out(`{ "mcpServers": { ${G} } }`).text, '{ "mcpServers": { } }');
    assert.equal(out(`{"mcpServers":{"x":1,${G.replace(/ /g, "")}}}`).text, '{"mcpServers":{"x":1}}');
    assert.equal(out('{ "mcpServers": { "x": 1 } }').text, '{ "mcpServers": { "x": 1 } }');
    // Not as genter install wrote it, not one object, not JSON, or a cut a comment would swallow: the reason.
    assert.match(out('{ "mcpServers": { "genter": { "command": "node" } } }').why, /"genter" in it is not as genter install wrote it/);
    assert.match(out('{ "mcpServers": {}, "mcpServers": {} }').why, /not one object/);
    assert.match(out("{ nope").why, /does not read as JSON/);
    assert.match(out(`{ "mcpServers": { "x": 1, // mine\n ${G}} }`).why, /would change more than them/);
    // TOML and YAML: the run genter install added, when it is there once as written.
    assert.equal(removeRun("a\nRUN\nb\n", "RUN\n").text, "a\nb\n");
    assert.match(removeRun("a\nRUN\nRUN\n", "RUN\n").why, /not as genter install wrote them/);
    assert.match(removeRun("a\n", "RUN\n").why, /not as genter install wrote them/);
  });
});
