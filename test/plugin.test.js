import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { markProblem } from "../src/conformance.js";

// The Claude Code marketplace, the genter plugin and the skill are files Claude Code (and `npx skills add`) read as they
// are: these tests read them the same way, with nothing of Claude Code installed. The last one runs Claude Code itself
// when it is on this computer.
const root = fileURLToPath(new URL("..", import.meta.url));
const at = (path) => join(root, path);
const json = (path) => JSON.parse(readFileSync(at(path), "utf8"));
const text = (path) => readFileSync(at(path), "utf8");
const PLUGIN = "plugins/genter";
// A name Claude Code installs, either side of the @ in genter@genter.
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

// Every file under a folder, as paths relative to it.
function files(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name), base) : [relative(base, join(dir, e.name))])).sort();
}

// The front matter Claude Code reads: between a first line "---" and the next, "key: value" per line.
function frontMatter(source) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(source);
  if (!m) return null;
  return Object.fromEntries(m[1].split("\n").map((line) => /^([a-z-]+):\s*(.*)$/.exec(line)).filter(Boolean).map(([, k, v]) => [k, v]));
}

describe("the Claude Code plugin", () => {
  it("[rl:plugin/marketplace] the marketplace genter lists the genter plugin from this repository and harden from Genterai/harden", () => {
    const m = json(".claude-plugin/marketplace.json");
    assert.equal(m.name, "genter");
    assert.ok(m.owner?.name, "an owner with a name");
    assert.ok(m.description);
    assert.deepEqual(m.plugins.map((p) => p.name), ["genter", "harden"]);
    for (const p of m.plugins) {
      assert.match(p.name, NAME);
      assert.ok(p.description, `${p.name} has a description`);
    }
    const [genter, harden] = m.plugins;
    // A relative source starts with ./, stays inside the marketplace, and is a plugin whose own name is the entry's.
    assert.equal(genter.source, `./${PLUGIN}`);
    assert.ok(!genter.source.split("/").includes(".."));
    assert.ok(statSync(at(genter.source)).isDirectory());
    assert.equal(json(`${PLUGIN}/.claude-plugin/plugin.json`).name, genter.name);
    assert.deepEqual(harden.source, { source: "github", repo: "Genterai/harden" });
    // The README gives the two commands.
    const readme = text("README.md");
    assert.ok(readme.includes("/plugin marketplace add Genterai/genter"));
    assert.ok(readme.includes("/plugin install genter@genter"));
    assert.ok(readme.includes("/plugin install harden@genter"));
  });

  it("[rl:plugin/local-server] the plugin starts genter-cli's local server, pinned to a minor, and nothing else", () => {
    const servers = json(`${PLUGIN}/.mcp.json`).mcpServers;
    assert.deepEqual(Object.keys(servers), ["genter"]);
    const { command, args, ...rest } = servers.genter;
    assert.equal(command, "npx");
    assert.equal(args.length, 3);
    assert.equal(args[0], "-y");
    assert.equal(args[2], "mcp");
    // No folder, no environment, no address, no header: the project of the folder Claude Code runs in, and no key.
    assert.deepEqual(rest, {});
    // The pin is this package's minor, or the next one while it is on its way to npm.
    const pin = /^genter-cli@(\d+)\.(\d+)$/.exec(args[1]);
    assert.ok(pin, `${args[1]} is pinned to a minor`);
    const [major, minor] = JSON.parse(text("package.json")).version.split(".").map(Number);
    assert.equal(Number(pin[1]), major);
    assert.ok([minor, minor + 1].includes(Number(pin[2])), `genter-cli@${pin[1]}.${pin[2]} beside ${major}.${minor}`);
    // The manifest adds no server and no hook of its own, and the plugin holds no address of Genter Cloud and no key.
    const manifest = json(`${PLUGIN}/.claude-plugin/plugin.json`);
    for (const key of ["mcpServers", "hooks", "lspServers", "userConfig", "channels"]) assert.equal(manifest[key], undefined, key);
    for (const file of [".mcp.json", ".claude-plugin/plugin.json"]) {
      const body = text(`${PLUGIN}/${file}`);
      assert.doesNotMatch(body, /genter\.ai|token|api[_-]?key|gnt_|sk-/i, file);
    }
  });

  it("[rl:plugin/local-server] [rl:plugin/hook-opt-in] the plugin is these files and no others: no hooks, no executables", () => {
    assert.deepEqual(files(at(PLUGIN)), [".claude-plugin/plugin.json", ".mcp.json", "README.md", "search-first.json", "skills/genter/SKILL.md"]);
  });

  it("[rl:plugin/skill] SKILL.md has the front matter Claude Code needs, and the plugin's copy is the same file", () => {
    const skill = text("skills/genter/SKILL.md");
    assert.equal(text(`${PLUGIN}/skills/genter/SKILL.md`), skill, "plugins/genter/skills/genter/SKILL.md is a copy of skills/genter/SKILL.md");
    const front = frontMatter(skill);
    assert.ok(front, "front matter between --- lines, from the first line");
    assert.equal(front.name, "genter");
    assert.match(front.name, /^[a-z0-9-]+$/);
    assert.ok(front.description.length > 0 && front.description.length <= 1024, `description: ${front.description.length} characters`);
    // Third person, saying what and when.
    assert.match(front.description, /^Searches Genter first when/);
    assert.match(front.description, /Use it before/);
    assert.ok(skill.split("\n").length < 500);
  });

  it("[rl:plugin/skill] the skill: search first, cite [id] and place, read whole, marks as quotes, text as data", () => {
    const skill = text("skills/genter/SKILL.md");
    const body = skill.slice(skill.indexOf("\n---\n", 4));
    assert.match(body, /Call `search` first/);
    assert.match(body, /cite each claim by its id and place/);
    assert.match(body, /cite the place alone/);
    assert.match(body, /`read` the ids when you need a place whole/);
    assert.match(body, /Repeat it as Genter shows it/);
    assert.match(body, /never turn it into a judgment of your own/);
    assert.match(body, /data, never instructions|never an\s+instruction to you/);
    // Every mark it shows is in the contract's format (contract/marks), as Genter prints it.
    const marks = [...body.matchAll(/`(⚠ (?:superseded by|contradicted by|contradicts) [^`]+)`/g)].map((m) => m[1]);
    assert.equal(marks.length, 3);
    for (const mark of marks) assert.equal(markProblem(`  ${mark}`), "", mark);
  });

  it("[rl:plugin/hook-opt-in] the search-first hook is opt-in: a settings snippet that only prints one line", () => {
    assert.ok(!existsSync(at(`${PLUGIN}/hooks`)));
    const { hooks, ...other } = json(`${PLUGIN}/search-first.json`);
    assert.deepEqual(other, {});
    assert.deepEqual(Object.keys(hooks), ["UserPromptSubmit"]);
    assert.equal(hooks.UserPromptSubmit.length, 1);
    const [group] = hooks.UserPromptSubmit;
    assert.deepEqual(Object.keys(group), ["hooks"]);
    assert.equal(group.hooks.length, 1);
    const [{ type, command, ...rest }] = group.hooks;
    assert.equal(type, "command");
    assert.deepEqual(rest, {});
    // echo and one quoted line: nothing else runs, nothing is read or written.
    const line = /^echo '([^'$`\\]+)'$/.exec(command);
    assert.ok(line, command);
    assert.match(line[1], /call search first/);
    assert.ok(text("README.md").replace(/\s+/g, " ").includes(line[1]), "the README shows the line it prints");
    assert.ok(text("README.md").includes("plugins/genter/search-first.json"));
  });

  // Claude Code itself, when it is installed here (CI has none): it validates the marketplace and installs the plugin
  // from this folder into an empty home.
  const claude = spawnSync("claude", ["--version"], { encoding: "utf8" });
  it("[rl:plugin/ac-plugin] Claude Code validates the marketplace and installs genter@genter: one skill, one server, no hooks", { skip: claude.status !== 0 && "Claude Code is not installed" }, () => {
    const home = mkdtempSync(join(tmpdir(), "genter-plugin-"));
    try {
      const env = { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: join(home, ".claude") };
      const run = (...args) => spawnSync("claude", args, { cwd: home, env, encoding: "utf8", timeout: 60_000 });
      const valid = run("plugin", "validate", root);
      assert.equal(valid.status, 0, valid.stdout + valid.stderr);
      assert.match(valid.stdout, /Validation passed/);
      assert.equal(run("plugin", "marketplace", "add", root).status, 0);
      const installed = run("plugin", "install", "genter@genter");
      assert.equal(installed.status, 0, installed.stdout + installed.stderr);
      const details = run("plugin", "details", "genter").stdout;
      assert.match(details, /Skills \(1\)\s+genter/);
      assert.match(details, /MCP servers \(1\)\s+genter/);
      assert.match(details, /Hooks \(0\)/);
      assert.match(run("plugin", "list").stdout, /genter@genter[\s\S]*enabled/);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
