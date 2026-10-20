import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { check, EXEMPT, signOffs } from "../.github/scripts/dco.mjs";
import { conformance } from "../src/conformance.js";

// The files that say how the project is run (STEWARDSHIP.md, TRADEMARKS.md, GOVERNANCE.md, ip-boundary.md, CODEOWNERS)
// and the checks that hold them: the sign-off check, the owner's review of the code Genter Cloud imports, and the
// promises a test can hold.
const root = fileURLToPath(new URL("..", import.meta.url));
const at = (path) => join(root, path);
const text = (path) => readFileSync(at(path), "utf8");
const json = (path) => JSON.parse(text(path));
const pkg = json("package.json");
const org = /github\.com\/([^/]+)\//.exec(pkg.repository.url)[1]; // Genterai
const OWNER = "@dangenter";

const commit = (over = {}) => ({ sha: "a".repeat(40), subject: "Add a thing", parents: 1, authorEmail: "ann@example.com", committerEmail: "ann@example.com", message: "Add a thing\n\nSigned-off-by: Ann Dev <ann@example.com>\n", ...over });
const failing = (commits, options) => check(commits, options).failures.map((f) => f.why);

describe("the sign-off check", () => {
  it("[rl:community/dco] a commit needs a Signed-off-by line with its author's or committer's own address", () => {
    assert.deepEqual(failing([commit()]), []);
    // None, or one that is not one.
    assert.deepEqual(failing([commit({ message: "Add a thing\n" })]), ["no Signed-off-by line"]);
    for (const line of ["Signed-off-by: Ann Dev", "Signed-off-by: <ann@example.com>", "Signed-off-by Ann Dev <ann@example.com>", "> Signed-off-by: Ann Dev <ann@example.com>", "Co-Authored-By: Ann Dev <ann@example.com>"]) {
      assert.deepEqual(failing([commit({ message: `Add a thing\n\n${line}\n` })]), ["no Signed-off-by line"], line);
    }
    // The address is the author's or the committer's, however it is cased; never someone else's.
    assert.deepEqual(failing([commit({ message: "x\n\nSigned-off-by: Ann <ANN@Example.com>\n" })]), []);
    assert.deepEqual(failing([commit({ authorEmail: "bob@example.com", committerEmail: "ann@example.com" })]), []);
    assert.deepEqual(failing([commit({ authorEmail: "ann@example.com", committerEmail: "web-flow@github.com", message: "x\n\nSigned-off-by: Ann <ann@example.com>\n" })]), []);
    const other = failing([commit({ message: "x\n\nSigned-off-by: Eve <eve@example.com>\n" })]);
    assert.equal(other.length, 1);
    assert.match(other[0], /signed off as eve@example\.com, which is neither its author \(ann@example\.com\) nor its committer \(ann@example\.com\)/);
    // Anywhere in the message, in any case of the key (git's trailers are not case-sensitive), CRLF too, several allowed.
    assert.deepEqual(signOffs("x\n\nsigned-off-by: Ann Dev <ann@example.com>\r\nbody after\n"), [{ name: "Ann Dev", email: "ann@example.com" }]);
    assert.deepEqual(failing([commit({ message: "x\n\nSigned-off-by: Ann <ann@example.com>\n\nmore text\n" })]), []);
    assert.equal(signOffs("Signed-off-by: A <a@b.c>\nSigned-off-by: B <b@b.c>\n").length, 2);
    // Each commit is judged, and every failure named.
    const two = check([commit({ sha: "1".repeat(40), message: "no" }), commit({ sha: "2".repeat(40) }), commit({ sha: "3".repeat(40), message: "also no" })]).failures;
    assert.deepEqual(two.map((f) => f.sha[0]), ["1", "3"]);
  });

  it("[rl:community/dco] a merge commit is not checked, and only a pull request opened by Dependabot is exempt, never a commit that says it is", () => {
    assert.deepEqual(failing([commit({ parents: 2, message: "Merge branch 'main' into claude/x\n" })]), []);
    assert.deepEqual(EXEMPT, ["dependabot[bot]"]);
    const unsigned = [commit({ message: "Bump a from 1 to 2\n", authorEmail: "49699333+dependabot[bot]@users.noreply.github.com", committerEmail: "noreply@github.com" })];
    assert.deepEqual(check(unsigned, { prAuthor: "dependabot[bot]" }), { exempt: "dependabot[bot]", failures: [] });
    // The same commits in a pull request somebody else opened, or by another bot, are checked.
    assert.equal(check(unsigned, { prAuthor: "mallory" }).failures.length, 1);
    assert.equal(check(unsigned, { prAuthor: "renovate[bot]" }).failures.length, 1);
    assert.equal(check(unsigned).failures.length, 1);
  });

  it("[rl:community/dco] [rl:community/ac-dco] the script reads a pull request's commits from git: signed ones pass, an unsigned one fails with how to fix it, a merge of main is skipped", () => {
    const dir = mkdtempSync(join(tmpdir(), "genter-dco-"));
    const identity = { GIT_AUTHOR_NAME: "Ann Dev", GIT_AUTHOR_EMAIL: "ann@example.com", GIT_COMMITTER_NAME: "Ann Dev", GIT_COMMITTER_EMAIL: "ann@example.com" };
    const env = { PATH: process.env.PATH, HOME: dir, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null", ...identity };
    const git = (...args) => execFileSync("git", args, { cwd: dir, env, encoding: "utf8" }).trim();
    const script = at(".github/scripts/dco.mjs");
    const run = (extra = {}) => spawnSync(process.execPath, [script], { cwd: dir, env: { ...env, ...extra }, encoding: "utf8" });
    try {
      git("init", "-q", "-b", "main");
      writeFileSync(join(dir, "a"), "a");
      git("add", "a");
      git("commit", "-q", "-m", "base");
      const base = git("rev-parse", "HEAD");
      git("switch", "-q", "-c", "pr");
      writeFileSync(join(dir, "b"), "b");
      git("add", "b");
      git("commit", "-q", "-s", "-m", "signed");
      writeFileSync(join(dir, "c"), "c");
      git("add", "c");
      // A subject with the bytes a parser might split on, and a body that looks like a header and a half sign-off: it
      // is still one commit, with one parent, and unsigned.
      const subject = "unsigned \u001f\u001e with\ta tab";
      git("commit", "-q", "-m", subject, "-m", "parent 0000000000000000000000000000000000000000\nauthor x <ann@example.com> 1 +0000", "-m", "Signed-off-by: Nobody");
      const head = git("rev-parse", "HEAD");

      const failed = run({ DCO_BASE: base, DCO_HEAD: head, DCO_PR_AUTHOR: "ann" });
      assert.equal(failed.status, 1, failed.stdout + failed.stderr);
      assert.ok(failed.stderr.includes(`${head.slice(0, 7)} ${subject}: no Signed-off-by line`), failed.stderr);
      assert.equal(failed.stderr.split("\n").filter((line) => line.includes("no Signed-off-by line")).length, 1, "the signed commit is not named");
      assert.match(failed.stderr, /git rebase --signoff origin\/main/);
      assert.match(failed.stderr, /git commit --amend --signoff --no-edit/);
      // Dependabot's pull request is not checked; the same range from anyone else is.
      assert.equal(run({ DCO_BASE: base, DCO_HEAD: head, DCO_PR_AUTHOR: "dependabot[bot]" }).status, 0);
      assert.equal(run({ DCO_BASE: base, DCO_HEAD: head }).status, 1);

      // Signed off by `git commit --amend -s`, it passes; and a merge of main into the branch adds nothing to check.
      git("commit", "-q", "--amend", "-s", "--no-edit");
      git("switch", "-q", "main");
      writeFileSync(join(dir, "d"), "d");
      git("add", "d");
      git("commit", "-q", "-m", "more on main");
      const newBase = git("rev-parse", "HEAD");
      git("switch", "-q", "pr");
      git("merge", "-q", "--no-ff", "-m", "Merge branch 'main' into pr", "main");
      const merged = git("rev-parse", "HEAD");
      const ok = run({ DCO_BASE: newBase, DCO_HEAD: merged, DCO_PR_AUTHOR: "ann" });
      assert.equal(ok.status, 0, ok.stdout + ok.stderr);
      assert.match(ok.stdout, /^2 commit\(s\), all signed off\.$/m);
      // Without the commits it is told, not silent.
      assert.equal(run().status, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("[rl:community/dco] the dco workflow is plain git and this one script, runs on pull_request with read-only rights, and exempts nobody itself", () => {
    const flow = text(".github/workflows/dco.yml");
    assert.match(flow, /^on:\n {2}pull_request:$/m);
    assert.doesNotMatch(flow, /pull_request_target|secrets\.|workflow_run/);
    assert.match(flow, /^permissions:\n {2}contents: read$/m);
    assert.match(flow, /^ {2}dco:$/m, "the job is `dco`, the name a ruleset requires");
    // Only GitHub's own actions: no app, no third-party action.
    const uses = [...flow.matchAll(/uses: (\S+)/g)].map((m) => m[1].split("@")[0]);
    assert.deepEqual([...new Set(uses)].sort(), ["actions/checkout", "actions/setup-node"]);
    assert.match(flow, /fetch-depth: 0/);
    assert.match(flow, /DCO_BASE: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
    assert.match(flow, /DCO_HEAD: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
    assert.match(flow, /DCO_PR_AUTHOR: \$\{\{ github\.event\.pull_request\.user\.login \}\}/);
    assert.match(flow, /run: node \.github\/scripts\/dco\.mjs$/m);
    // The exemption is the script's (and tested above), not an `if:` that skips the job by who pushed.
    assert.doesNotMatch(flow, /^\s+if:/m);
    // The script has no dependency: node's own modules only.
    for (const [, from] of text(".github/scripts/dco.mjs").matchAll(/from "([^"]+)"/g)) assert.match(from, /^node:/, from);
  });
});

describe("who reviews", () => {
  const lines = text(".github/CODEOWNERS").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((l) => {
    const [pattern, ...owners] = l.split(/\s+/);
    return { pattern, owners };
  });
  const owned = (pattern) => lines.filter((l) => l.pattern === pattern);

  it("[rl:community/owner-review] the owner reviews every change to what decides what is read, marked and sent, and to the checks themselves", () => {
    // Every line is a pattern and users or teams GitHub can ask: never the organization alone.
    for (const { pattern, owners } of lines) {
      assert.ok(owners.length >= 1, `${pattern} has an owner`);
      for (const o of owners) {
        assert.match(o, /^@[A-Za-z0-9][A-Za-z0-9-]*(\/[A-Za-z0-9._-]+)?$/, `${pattern}: ${o}`);
        assert.notEqual(o.toLowerCase(), `@${org}`.toLowerCase(), `${pattern}: an organization cannot be asked for a review`);
      }
    }
    // The code Genter Cloud imports (the plan's D7) and the server's, which may not be in the tree yet; the reader
    // schema; and what runs in CI and on release.
    for (const required of ["/src/memory.js", "/src/readers.js", "/src/net.js", "/src/lexical.js", "/src/local.js", "/src/http.js", "/readers/reader.schema.json", "/.github/", "/Dockerfile", "/docker-compose.yml", "/server.json", "/manifest.json", "/STEWARDSHIP.md", "/TRADEMARKS.md", "/GOVERNANCE.md", "/ip-boundary.md", "/.github/CODEOWNERS"]) {
      assert.deepEqual(owned(required).map((l) => l.owners), [[OWNER]], required);
    }
    // A line is for something that is there, or will be (this file comes with its own pull request).
    const NOT_YET = ["/src/memory.js"];
    for (const { pattern } of lines) {
      assert.ok(pattern.startsWith("/") && !pattern.includes("*"), `${pattern} is anchored at the root`);
      assert.ok(existsSync(at(pattern.slice(1))) || NOT_YET.includes(pattern), `${pattern} is in the tree`);
    }
  });

  it("[rl:community/owner-review] the first-party readers and language files have the owner's line; a line for a reader names the owner its reader.json names, and a reader with no line is allowed", () => {
    const readers = readdirSync(at("readers"), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    assert.ok(readers.length >= 6);
    for (const name of readers) {
      const named = json(`readers/${name}/reader.json`).owner;
      const firstParty = named.toLowerCase() === `@${org}`.toLowerCase();
      const got = owned(`/readers/${name}/`).map((l) => l.owners);
      // A reader that names the organization is a first-party one: the owner's line. Another owner's reader may have no
      // line (the maintainers review it); a line it has names that owner.
      if (firstParty) assert.deepEqual(got, [[OWNER]], `readers/${name}: ${named}`);
      else assert.ok(got.length === 0 || (got.length === 1 && got[0].length === 1 && got[0][0] === named), `readers/${name}: ${named} is the owner its line names, if it has one`);
    }
    // The six that ship, and the two languages, are the owner's.
    for (const name of ["adr", "banners", "changelog", "decisions", "obsidian", "rfc"]) assert.deepEqual(owned(`/readers/${name}/`).map((l) => l.owners), [[OWNER]], `readers/${name}`);
    for (const lang of ["en", "ru"]) assert.deepEqual(owned(`/rules/${lang}.json`).map((l) => l.owners), [[OWNER]], `rules/${lang}`);
    // A line is for a reader or a language file that is there.
    for (const { pattern } of lines) {
      const reader = /^\/readers\/([^/]+)\/$/.exec(pattern)?.[1];
      if (reader) assert.ok(readers.includes(reader), `${pattern} is a reader in the tree`);
    }
  });

  it("[rl:community/manifests-no-brief] a reader, a language file and a CODEOWNERS line for them are in no area's Sources, so harden asks their pull request for no Brief line", () => {
    // The code every area names under Sources, read the way harden reads it: the backticked paths of its Sources field.
    const sources = readdirSync(at("harden/redlines")).filter((f) => f.endsWith(".md")).flatMap((f) => {
      const field = /^Sources:[^\n]*(?:\n(?!\n)[^\n]*)*/m.exec(text(`harden/redlines/${f}`))?.[0] ?? "";
      assert.ok(field, `${f} has a Sources: field`);
      return [...field.matchAll(/`([^`\s]+)`/g)].map((m) => m[1]).filter((p) => /[/.]/.test(p)).map((p) => ({ area: f, path: p }));
    });
    assert.ok(sources.length > 20, `the areas name their code: ${sources.length}`);
    // A path covers a file when it is that file or a folder holding it, or a glob that matches it.
    const glob = (p) => new RegExp(`^${p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\0").replace(/\*/g, "[^/]*").replace(/\0/g, ".*")}$`);
    const covers = (file, p) => (/[*?]/.test(p) ? glob(p).test(file) : file === p || file.startsWith(p.endsWith("/") ? p : `${p}/`));
    // What a pull request that adds a reader (or a language) and its CODEOWNERS line changes.
    const added = ["readers/my-format/reader.json", "readers/my-format/expected.json", "readers/my-format/fixtures/a.md", "rules/es.json", ".github/CODEOWNERS"];
    for (const file of added) assert.deepEqual(sources.filter(({ path }) => covers(file, path)), [], `${file} is in no area's Sources`);
    // The same reading does catch code an area owns, so the check above can fail.
    assert.deepEqual(sources.filter(({ path }) => covers("src/readers.js", path)).map((s) => s.area), ["readers.md"]);
  });
});

describe("works with Genter", () => {
  it("[rl:community/works-with-genter] TRADEMARKS.md asks for genter-cli/conformance, which the package exports, and a server that does not speak the contract does not pass it", async () => {
    const policy = text("TRADEMARKS.md");
    assert.match(policy, /\*\*"Works with Genter"\*\*/);
    assert.match(policy, /passes\s+`genter-cli\/conformance`/);
    assert.match(policy, /import \{ conformance \} from "genter-cli\/conformance";/);
    assert.match(policy, /await conformance\(send, \{ query: "[^"]+", mark: true \}\);/);
    assert.match(policy, /## Forks rename/);
    // The name it asks for is an export of the package, and it is the function the policy calls.
    assert.equal(pkg.exports["./conformance"], "./src/conformance.js");
    assert.ok(existsSync(at(pkg.exports["./conformance"])));
    assert.equal(typeof conformance, "function");
    // A server that answers every request with an error fails it, and says which checks.
    const report = await conformance(async () => ({ jsonrpc: "2.0", id: 1, error: { code: -32601, message: "no" } }), { query: "anything", mark: true });
    assert.equal(report.ok, false);
    assert.ok(report.checks.some((c) => !c.ok));
  });
});

describe("what the project promises", () => {
  it("[rl:community/stewardship] STEWARDSHIP.md holds the seven promises, and what they rest on is true", () => {
    const promises = [...text("STEWARDSHIP.md").matchAll(/^(\d)\. \*\*(.+?)\*\*/gm)].map((m) => `${m[1]} ${m[2]}`);
    assert.deepEqual(promises, [
      "1 No feature moves from open to paid.",
      "2 No artificial limits in the open code.",
      "3 Installing needs no account.",
      "4 Nothing you run sends data.",
      "5 Access rules, shares and source switches are never paid.",
      "6 README numbers reproduce with the open code.",
      "7 The server's license is announced before it opens.",
    ]);
    assert.match(text("STEWARDSHIP.md"), /no\s+CLA/);
    // Apache-2.0, and a package that installs alone.
    assert.equal(pkg.license, "Apache-2.0");
    assert.match(text("LICENSE"), /Apache License\s+Version 2\.0/);
    for (const key of ["dependencies", "peerDependencies", "optionalDependencies"]) assert.equal(pkg[key], undefined, key);
    // The file is a red line of the repository, and the red line says so.
    assert.ok(text("harden/redlines/community.md").includes("STEWARDSHIP.md"));
  });

  it("[rl:community/no-phone-home] only the website fetch (src/net.js), the embeddings call (src/local.js) and genter serve's listening server (src/http.js) name a network primitive: nothing else of the command or the engine can send", () => {
    const NET = /\bfetch\(|node:(?:https?|net|tls|dns|dgram|http2)\b|\bXMLHttpRequest\b|\bWebSocket\b|\bsendBeacon\b|from\s+["'](?:https?|net|tls|dns|dgram|http2)["']/;
    const files = ["src", "bin"].flatMap((dir) => readdirSync(at(dir), { recursive: true }).filter((f) => /\.[cm]?js$/.test(f)).map((f) => `${dir}/${f}`));
    assert.ok(files.includes("src/local.js") && files.includes("bin/genter.js"), files.join(", "));
    const reaching = files.filter((f) => NET.test(text(f))).sort();
    assert.deepEqual(reaching, ["src/http.js", "src/local.js", "src/net.js"]);
    // genter serve only listens and answers: it imports createServer from node:http and nothing that makes a request.
    const serve = text("src/http.js");
    assert.match(serve, /^import \{ createServer \} from "node:http";$/m);
    assert.doesNotMatch(serve, /\bfetch\(|\.request\(|\.get\(\s*["'`]https?:|node:https|node:net|node:tls|node:dns|WebSocket|sendBeacon/);
    // The embeddings call is the one --semantic makes, to the provider the person chose (SECURITY.md says so).
    assert.match(text("SECURITY.md"), /With `--semantic`, the passages to rank go to the embeddings provider you\s+chose/);
  });

  it("[rl:community/community-files] the files that say how the project is run exist, say who they are for, and link only to files that are there", () => {
    const docs = ["STEWARDSHIP.md", "TRADEMARKS.md", "GOVERNANCE.md", "ip-boundary.md", "CONTRIBUTING.md", "SECURITY.md", "docs/first-issues.md", "docs/listings.md"];
    for (const doc of docs) {
      const body = text(doc);
      for (const [, target] of body.matchAll(/\]\(([^)\s#]+)(?:#[^)\s]*)?\)/g)) {
        if (/^[a-z]+:/i.test(target)) continue;
        assert.ok(existsSync(join(dirname(at(doc)), target)), `${doc} links to ${target}`);
      }
    }
    // CONTRIBUTING has the two kinds, and the sign-off.
    const contributing = text("CONTRIBUTING.md");
    assert.match(contributing, /## Two kinds of contribution/);
    assert.match(contributing, /## Core changes/);
    assert.match(contributing, /## Readers and language rules/);
    assert.match(contributing, /## Sign off your commits/);
    assert.match(contributing, /CI is its\s+brief/);
    // GOVERNANCE names the owner as the one who decides, and no foundation.
    const governance = text("GOVERNANCE.md");
    assert.match(governance, /\*\*The owner decides\.\*\*/);
    assert.match(governance, /## No foundation, for now/);
    // The boundary page names what stays private, in general words.
    const boundary = text("ip-boundary.md");
    for (const part of ["The SQL store", "Connectors and their orchestration", "The access engine", "The agent", "Notifiers and the queue", "Billing and plans"]) assert.ok(boundary.includes(part), part);
  });
});
