import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { mismatches, sync } from "../.github/scripts/versions.mjs";
import { packedFiles, pointedAt, stage } from "../.github/scripts/mcpb.mjs";
import { HEADING, notesOf } from "../.github/scripts/notes.mjs";
import { conformance } from "../src/conformance.js";
import { mcpTools } from "../src/mcp-server.js";

// What clients and listings read: server.json for the official MCP Registry, manifest.json for Claude Desktop's .mcpb,
// glama.json for Glama, and the release job that attaches genter.mcpb. These tests read them as the registry and the
// host do, and start the extension's own command from a staged bundle.
const root = fileURLToPath(new URL("..", import.meta.url));
const at = (path) => join(root, path);
const text = (path) => readFileSync(at(path), "utf8");
const json = (path) => JSON.parse(text(path));
const pkg = json("package.json");
// The owner of the repository as GitHub spells it (https://github.com/Genterai/genter): the registry grants
// io.github.<owner>/* by that spelling, capitals included.
const owner = /github\.com\/([^/]+)\//.exec(pkg.repository.url)[1];
const CLOUD = "https://genter.ai/api/mcp";

describe("the registry entry", () => {
  const server = json("server.json");

  it("[rl:cli/registry-entry] server.json is the official MCP Registry's entry: the name package.json's mcpName gives, one npm package started as `genter mcp`, and the hosted URL", () => {
    // https://modelcontextprotocol.io/registry/quickstart (the name must equal mcpName) and /authentication (a GitHub
    // sign-in grants io.github.<owner>/*, matched case for case).
    assert.equal(server.$schema, "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json");
    assert.equal(server.name, pkg.mcpName);
    assert.equal(server.name, `io.github.${owner}/genter`);
    assert.match(server.name, /^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/);
    assert.ok(server.name.length >= 3 && server.name.length <= 200);
    // The schema's limits: a description of 1 to 100 characters, a specific version (never a range).
    assert.ok(server.description.length >= 1 && server.description.length <= 100, `${server.description.length} characters`);
    assert.ok(server.title.length >= 1 && server.title.length <= 100);
    assert.match(server.version, /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);
    assert.deepEqual(server.repository, { url: `https://github.com/${owner}/genter`, source: "github" });
    assert.match(server.websiteUrl, /^https:\/\/genter\.ai$/);
    assert.deepEqual(Object.keys(server).sort(), ["$schema", "description", "name", "packages", "remotes", "repository", "title", "version", "websiteUrl"]);

    // The package: genter-cli from npm, over stdio, as `npx genter-cli mcp`; no environment, no key.
    assert.equal(server.packages.length, 1);
    const [npm] = server.packages;
    assert.deepEqual(npm, {
      registryType: "npm",
      registryBaseUrl: "https://registry.npmjs.org",
      identifier: pkg.name,
      version: pkg.version,
      runtimeHint: "npx",
      transport: { type: "stdio" },
      packageArguments: [{ type: "positional", value: "mcp" }],
    });
    // The command it starts is a command genter has.
    const help = spawnSync(process.execPath, [at("bin/genter.js"), "help"], { encoding: "utf8" }).stdout;
    assert.match(help, /genter mcp \[folder\|url \.\.\.\]/);

    // The hosted one: Genter Cloud as its own server, which the client signs in to with OAuth. Nothing to send.
    assert.deepEqual(server.remotes, [{ type: "streamable-http", url: CLOUD }]);
    assert.ok(help.includes(CLOUD), "the command prints the same address");
    // No header, variable, key or private address anywhere in it.
    assert.doesNotMatch(text("server.json"), /headers|variables|environmentVariables|isSecret|token|api[_-]?key|secret|bearer|gnt_|sk-|\/api\/mcp\//i);
  });

  it("[rl:cli/versions-agree] package.json, server.json (twice) and manifest.json name one version, and the helper writes it into the others without moving a byte besides", () => {
    const wrong = mismatches();
    assert.deepEqual(wrong, [], `${wrong.map((m) => `${m.file} says ${m.found}`).join(", ")}, package.json says ${pkg.version}: run node .github/scripts/versions.mjs`);
    assert.equal(server.version, pkg.version);
    assert.equal(server.packages[0].version, pkg.version);
    assert.equal(json("manifest.json").version, pkg.version);

    const dir = mkdtempSync(join(tmpdir(), "genter-versions-"));
    try {
      writeFileSync(join(dir, "package.json"), JSON.stringify({ version: pkg.version }));
      for (const file of ["server.json", "manifest.json"]) writeFileSync(join(dir, file), text(file).replaceAll(`"version": "${pkg.version}"`, '"version": "0.0.1"'));
      assert.equal(mismatches(dir).length, 3, "server.json twice, manifest.json once");
      sync(dir);
      assert.deepEqual(mismatches(dir), []);
      for (const file of ["server.json", "manifest.json"]) assert.equal(readFileSync(join(dir, file), "utf8"), text(file), `${file}: only its version lines moved`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("[rl:cli/listings] docs/listings.md gives the entry's name and one line as server.json has them, and glama.json names an owner CODEOWNERS names", () => {
    const listings = text("docs/listings.md");
    assert.ok(listings.includes(server.name), "the registry name");
    assert.ok(listings.includes(server.description), "the one line");
    assert.ok(listings.includes(CLOUD));
    const glama = json("glama.json");
    assert.equal(glama.$schema, "https://glama.ai/mcp/schemas/server.json");
    assert.deepEqual(Object.keys(glama).sort(), ["$schema", "maintainers"]);
    assert.ok(glama.maintainers.length >= 1);
    const owners = new Set(text(".github/CODEOWNERS").split("\n").filter((l) => l && !l.startsWith("#")).flatMap((l) => l.split(/\s+/).slice(1)));
    for (const handle of glama.maintainers) assert.ok(owners.has(`@${handle}`), `@${handle} is in CODEOWNERS`);
  });
});

describe("the Claude Desktop extension", () => {
  const manifest = json("manifest.json");
  // The keys MANIFEST.md of github.com/modelcontextprotocol/mcpb (manifest_version 0.3) allows at the top of a manifest.
  const ALLOWED = ["manifest_version", "name", "display_name", "version", "description", "long_description", "author", "repository", "homepage", "documentation", "support", "icon", "icons", "screenshots", "localization", "server", "tools", "tools_generated", "prompts", "prompts_generated", "keywords", "license", "privacy_policies", "compatibility", "user_config", "dxt_version", "$schema"];

  it("[rl:cli/mcpb-manifest] manifest.json is an MCPB 0.3 manifest that asks the person for one folder, starts `genter mcp` on it, and holds no key", () => {
    for (const key of Object.keys(manifest)) assert.ok(ALLOWED.includes(key), `${key} is a manifest key`);
    for (const key of ["manifest_version", "name", "version", "description", "author", "server"]) assert.ok(manifest[key], `${key} is required`);
    assert.equal(manifest.manifest_version, "0.3");
    assert.match(manifest.version, /^\d+\.\d+\.\d+/);
    assert.ok(manifest.author.name);
    assert.equal(manifest.license, pkg.license);

    // It runs the package's own command in Claude Desktop's Node: node bin/genter.js mcp <the folder>.
    const { type, entry_point: entry, mcp_config: config, ...otherServer } = manifest.server;
    assert.deepEqual(otherServer, {});
    assert.equal(type, "node");
    assert.equal(entry, pkg.bin.genter);
    assert.deepEqual(config, { command: "node", args: [`\${__dirname}/bin/genter.js`, "mcp", `\${user_config.folder}`] });
    assert.ok(existsSync(at(entry)));
    assert.deepEqual(pointedAt(manifest), [entry]);

    // The folder: a directory the person picks, required, with no default (nothing is searched until they choose one),
    // one folder, and nothing secret to ask for.
    assert.deepEqual(Object.keys(manifest.user_config), ["folder"]);
    const { type: kind, title, description, required, ...other } = manifest.user_config.folder;
    assert.equal(kind, "directory");
    assert.equal(required, true);
    assert.ok(title && description);
    assert.deepEqual(other, {}, "no default, no multiple, no sensitive");

    // The tools it lists are the contract's two (cli/local-mcp-tools), and Claude Desktop is the host it names.
    assert.deepEqual(manifest.tools.map((t) => t.name), mcpTools.slice(0, 2).map((t) => t.name));
    assert.deepEqual(manifest.tools.map((t) => t.name), ["search", "read"]);
    assert.deepEqual(manifest.compatibility.platforms, ["darwin", "win32"]);
    assert.equal(manifest.compatibility.runtimes.node, `>=${pkg.engines.node.replace(/^>=/, "")}.0.0`);
    assert.doesNotMatch(text("manifest.json"), /"env"|token|api[_-]?key|secret|bearer|gnt_|sk-|sensitive|privacy_policies/i);
  });

  it("[rl:cli/mcpb-starts] the bundle is what npm ships plus the manifest, and the manifest's command, started where a host would, passes genter-cli/conformance on the folder the person chose", { timeout: 120_000 }, async () => {
    const base = mkdtempSync(join(tmpdir(), "genter-mcpb-"));
    try {
      // What goes in the bundle: npm's own list of the package, and manifest.json; no tests, bench or workflows.
      const bundle = join(base, "extension");
      const files = stage(bundle);
      assert.deepEqual(files, [...new Set([...packedFiles(), "manifest.json"])].sort());
      for (const file of files) assert.match(file, /^(bin\/|src\/|readers\/|rules\/|LICENSE$|README(\.ru)?\.md$|package\.json$|manifest\.json$)/, file);
      for (const file of ["bin/genter.js", "src/mcp-server.js", "package.json", "manifest.json"]) assert.ok(existsSync(join(bundle, file)), file);
      assert.ok(!existsSync(join(bundle, "node_modules")));

      // The person's folder, with a space in its name, as a project; and an unrelated folder where the host starts it.
      const folder = join(base, "My Notes");
      for (const [path, body] of Object.entries({
        ".git/HEAD": "ref: refs/heads/main\n",
        "docs/runbook.md": "> **Deprecated:** replaced by [Release process v2](release-process-v2.md)\n\n# Release process\n\n## Friday\n\nDeploys go out on Fridays from the release branch.\n",
        "docs/release-process-v2.md": "# Release process v2\n\nDate: 2026-10-03\n\n## Friday\n\nNo deploys on Fridays since October 3: deploy on Thursday.\n",
        "docs/oncall.md": "# On-call\n\nPage the on-call engineer in #oncall.\n",
      })) {
        mkdirSync(join(folder, path, ".."), { recursive: true });
        writeFileSync(join(folder, path), body);
      }
      utimesSync(join(folder, "docs/release-process-v2.md"), new Date("2026-10-03T12:00:00Z"), new Date("2026-10-03T12:00:00Z"));
      const elsewhere = join(base, "elsewhere");
      mkdirSync(elsewhere);
      writeFileSync(join(elsewhere, "decoy.md"), "# Decoy\n\nFriday deploys are decided by the decoy folder.\n");

      // What Claude Desktop does with mcp_config (MANIFEST.md, "Variable substitution"): ${__dirname} is where the
      // extension is installed and ${user_config.folder} is the folder the person picked; no shell, so a space is safe.
      const sub = (s) => s.replaceAll(`\${__dirname}`, bundle).replaceAll(`\${user_config.folder}`, folder);
      const { command, args } = manifest.server.mcp_config;
      assert.equal(command, "node");
      const child = spawn(process.execPath, args.map(sub), { cwd: elsewhere, env: { PATH: process.env.PATH, HOME: join(base, "home"), GENTER_HOME: join(base, "home/.genter") } });
      const waiting = new Map();
      let buffer = "";
      let stderr = "";
      child.stderr.on("data", (d) => {
        stderr += d;
      });
      child.stdout.on("data", (d) => {
        buffer += d;
        for (let i = buffer.indexOf("\n"); i >= 0; i = buffer.indexOf("\n")) {
          const msg = JSON.parse(buffer.slice(0, i));
          buffer = buffer.slice(i + 1);
          waiting.get(msg.id)?.(msg);
          waiting.delete(msg.id);
        }
      });
      const send = (req) =>
        new Promise((resolve) => {
          if (req.id !== undefined) waiting.set(req.id, resolve);
          child.stdin.write(`${JSON.stringify(req)}\n`);
          if (req.id === undefined) resolve(null);
        });
      try {
        const report = await conformance(send, { query: "can we deploy on Friday?", mark: true });
        assert.equal(report.ok, true, JSON.stringify(report.checks.filter((c) => !c.ok), null, 2) + stderr);
        // It searched the folder the person chose, not the folder it was started in.
        const found = (await send({ jsonrpc: "2.0", id: 9001, method: "tools/call", params: { name: "search", arguments: { query: "deploy on Friday" } } })).result.content[0].text;
        assert.match(found, /docs\/release-process-v2\.md/);
        assert.match(found, /superseded by \[\d+\]/);
        assert.doesNotMatch(found, /decoy/i);
        assert.match(stderr, /searching the project .*My Notes/);
      } finally {
        child.stdin.end();
        await new Promise((done) => child.on("close", done));
      }
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("[rl:cli/mcpb-starts] staging refuses a folder that is not empty, a manifest of another version, and a manifest that points at a file the package does not ship", () => {
    const base = mkdtempSync(join(tmpdir(), "genter-stage-"));
    try {
      const make = (name, { version, entry }) => {
        const dir = join(base, name);
        mkdirSync(join(dir, "bin"), { recursive: true });
        writeFileSync(join(dir, "bin/genter.js"), "");
        writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x", version: "1.0.0", files: ["bin"] }));
        const m = json("manifest.json");
        writeFileSync(join(dir, "manifest.json"), JSON.stringify({ ...m, version, server: { ...m.server, entry_point: entry, mcp_config: { command: "node", args: [`\${__dirname}/${entry}`] } } }));
        return dir;
      };
      assert.throws(() => stage(join(base, "out1"), make("one", { version: "2.0.0", entry: "bin/genter.js" })), /manifest\.json is 2\.0\.0 and package\.json 1\.0\.0: run node \.github\/scripts\/versions\.mjs/);
      assert.throws(() => stage(join(base, "out2"), make("two", { version: "1.0.0", entry: "bin/missing.js" })), /starts the server from bin\/missing\.js, which the package does not ship/);
      const ok = make("three", { version: "1.0.0", entry: "bin/genter.js" });
      assert.deepEqual(stage(join(base, "out3"), ok), ["bin/genter.js", "manifest.json", "package.json"]);
      assert.throws(() => stage(join(base, "out3"), ok), /is not empty/);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});

describe("the release attaches genter.mcpb", () => {
  const release = text(".github/workflows/release.yml");
  // The jobs of the workflow: the text from `  name:` to the next job's.
  const jobs = Object.fromEntries([...release.matchAll(/^ {2}([a-z][a-z0-9-]*):\n([\s\S]*?)(?=^ {2}[a-z][a-z0-9-]*:\n|(?![\s\S]))/gm)].map((m) => [m[1], m[2]]));
  const steps = (job) => job.split(/^ {6}- /m).slice(1);

  it("[rl:cli/mcpb-release] a job of its own after the release job stages the package and the manifest, packs them with a pinned mcpb, and uploads genter.mcpb to this commit's release only when it lacks one", () => {
    assert.ok(jobs.release && jobs.mcpb, Object.keys(jobs).join(", "));
    const job = jobs.mcpb;
    assert.match(job, /^ {4}needs: release$/m);
    assert.match(job, /^ {4}permissions:\n {6}contents: write/m);
    const all = steps(job);
    // The gate: the tag is at this commit and the release has no genter.mcpb yet; every later step waits on it.
    const gate = all.find((s) => /id: gate/.test(s));
    assert.ok(gate, "a gate step");
    assert.match(gate, /rev-parse -q --verify "refs\/tags\/\$tag\^\{commit\}"/);
    assert.match(gate, /gh release view "\$tag" --json assets/);
    assert.match(gate, /grep -qx genter\.mcpb/);
    const later = all.slice(all.indexOf(gate) + 1);
    assert.equal(later.length, 4);
    for (const step of later) assert.match(step, /if: steps\.gate\.outputs\.attach == 'true'/);
    assert.match(later[0], /node \.github\/scripts\/mcpb\.mjs stage "\$RUNNER_TEMP\/genter"/);
    // The one outside tool is pinned to an exact version, and has no token in reach.
    assert.match(later[1], /npx --yes --ignore-scripts @anthropic-ai\/mcpb@\d+\.\d+\.\d+ pack "\$RUNNER_TEMP\/genter" genter\.mcpb/);
    assert.doesNotMatch(later[1], /token|GH_TOKEN|secrets\./i);
    assert.match(job, /persist-credentials: false/);
    // What the packer wrote, with the packages it pulls by range, is checked against what was staged, byte for byte,
    // before the bundle is started and before it is uploaded.
    assert.match(later[2], /unzip -q genter\.mcpb -d "\$RUNNER_TEMP\/unpacked"\n\s+diff -r "\$RUNNER_TEMP\/genter" "\$RUNNER_TEMP\/unpacked"\n\s+test /);
    assert.match(later[2], /node "\$RUNNER_TEMP\/unpacked\/bin\/genter\.js" --version/);
    assert.match(later[3], /gh release upload "\$TAG" genter\.mcpb/);
    assert.match(later[3], /GH_TOKEN: \$\{\{ github\.token \}\}/);
  });

  it("[rl:cli/mcpb-release] the npm release job does not know about it: nothing of mcpb in it, and it still publishes and tags", () => {
    assert.doesNotMatch(jobs.release, /mcpb/i);
    assert.match(jobs.release, /npm publish --provenance --access public/);
    assert.match(jobs.release, /gh release create/);
    assert.doesNotMatch(jobs.release, /continue-on-error/);
  });
});

describe("the release notes", () => {
  const release = text(".github/workflows/release.yml");
  const job = release.slice(release.indexOf("\n  release:\n"), release.indexOf("\n  image:\n"));
  const steps = job.split(/^ {6}- /m).slice(1);

  it("[rl:cli/release-notes] CHANGELOG.md has this version's section, what can break first, and the release job puts it before GitHub's list of pull requests; the tests that ask for it run before npm publish", () => {
    const notes = notesOf(pkg.version);
    assert.ok(notes, `CHANGELOG.md has no "## ${pkg.version}": add what ${pkg.version} brings, in plain words`);
    const headings = notes.split("\n").filter((l) => l.startsWith("### "));
    const breaking = headings.findIndex((h) => /^### Breaking/i.test(h));
    assert.ok(breaking <= 0, `"${headings[breaking]}" comes first, before ${headings.slice(0, breaking).join(", ")}`);
    // A release page resolves no relative link, so the notes link to whole addresses.
    for (const [link] of notes.matchAll(/\]\(([^)]*)\)/g)) assert.match(link, /^\]\(https:\/\//, `${link}: a whole address`);
    // Every section of CHANGELOG.md is a version once, newest first, so the notes of one are never another's. The
    // headings are the ones notes.mjs reads; a release candidate comes before its release (semver's order).
    const versions = text("CHANGELOG.md").split(/\r?\n/).map((l) => HEADING.exec(l)?.[1]).filter(Boolean);
    assert.equal(versions[0], pkg.version, "the newest section is package.json's version");
    const order = (v) => {
      const [core, pre = ""] = v.split("+")[0].split(/-(.*)/);
      return [...core.split(".").map(Number), pre ? 0 : 1, pre];
    };
    const newer = (a, b) => {
      const [x, y] = [order(a), order(b)];
      const i = x.findIndex((n, j) => j < 4 && n !== y[j]);
      return i >= 0 ? x[i] > y[i] : x[4].localeCompare(y[4], "en", { numeric: true }) > 0;
    };
    for (let i = 1; i < versions.length; i++) assert.ok(newer(versions[i - 1], versions[i]), `${versions[i]} after ${versions[i - 1]}`);

    // The tag step writes the section to a file and gives it to gh with --generate-notes, which puts it first.
    const tag = steps.find((s) => s.startsWith("name: Tag and GitHub release"));
    assert.ok(tag, "the tag step");
    assert.match(tag, /run: \|\n\s+node \.github\/scripts\/notes\.mjs "\$V" > "\$RUNNER_TEMP\/notes\.md"\n\s+gh release create "v\$V" --target "\$GITHUB_SHA" --title "v\$V" --notes-file "\$RUNNER_TEMP\/notes\.md" --generate-notes\n/);
    assert.match(tag, /V: \$\{\{ steps\.version\.outputs\.version \}\}/);
    // The tests (which ask for the section) run before npm publish, and the tag comes after it: a version without notes
    // stops before anything is published or tagged.
    const stepOf = (re) => steps.findIndex((s) => re.test(s));
    assert.ok(stepOf(/run: npm test$/m) >= 0 && stepOf(/run: npm test$/m) < stepOf(/npm publish/), "npm test before npm publish");
    assert.ok(stepOf(/npm publish/) < steps.indexOf(tag), "the tag after npm publish");
  });

  it("[rl:cli/release-notes] notes.mjs takes a version's section up to the next one, in either heading form, and exits 1 without one", () => {
    const changelog = ["# Changelog", "", "Intro.", "", "## [1.2.0] - 2026-01-02", "", "### Breaking changes", "", "- one", "", "## 1.1.0", "", "- two", "", "## 1.1.0-rc.1", "", "- three", "", "## 1.0.0", ""].join("\n");
    assert.equal(notesOf("1.2.0", changelog), "### Breaking changes\n\n- one");
    assert.equal(notesOf("1.1.0", changelog), "- two");
    assert.equal(notesOf("1.1.0-rc.1", changelog), "- three");
    assert.equal(notesOf("1.0.0", changelog), null, "an empty section is no notes");
    assert.equal(notesOf("1.3.0", changelog), null);
    assert.equal(notesOf("1.2", changelog), null);

    const script = at(".github/scripts/notes.mjs");
    const ok = spawnSync(process.execPath, [script, pkg.version], { encoding: "utf8" });
    assert.equal(ok.status, 0, ok.stderr);
    assert.equal(ok.stdout, `${notesOf(pkg.version)}\n`);
    const missing = spawnSync(process.execPath, [script, "0.0.0"], { encoding: "utf8" });
    assert.equal(missing.status, 1);
    assert.equal(missing.stdout, "");
    assert.match(missing.stderr, /CHANGELOG\.md has no section for 0\.0\.0/);
  });
});
