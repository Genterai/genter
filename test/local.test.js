import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { recipeId } from "../src/anchor.js";
import { bm25, prepare, stem, terms } from "../src/lexical.js";
import { createLocal, embedderFor, embeddingProvider, FILE_READ, findText, listFolder, projectOf } from "../src/local.js";
import { handle } from "../src/mcp-server.js";
import { cipher } from "../src/seal.js";

const root = fileURLToPath(new URL("..", import.meta.url));

// A folder of files and a Genter home of its own, both in a fresh temp folder.
function sandbox(files = {}) {
  const base = mkdtempSync(join(tmpdir(), "genter-local-"));
  const dir = join(base, "project");
  const home = join(base, "home");
  mkdirSync(dir, { recursive: true });
  for (const [path, text] of Object.entries(files)) put(dir, path, text);
  return { base, dir, home, done: () => rmSync(base, { recursive: true, force: true }) };
}
function put(dir, path, text) {
  mkdirSync(join(dir, path, ".."), { recursive: true });
  writeFileSync(join(dir, path), text);
}
const textOf = (out) => out.results.map((r) => r.text).join("\n");
// Folders side by side and one Genter home, in a fresh temp folder; "a/.git/HEAD" makes a a repository.
function folders(files = {}) {
  const base = mkdtempSync(join(tmpdir(), "genter-projects-"));
  for (const [path, text] of Object.entries(files)) put(base, path, text);
  return { base, home: join(base, "home"), at: (path) => join(base, path), done: () => rmSync(base, { recursive: true, force: true }) };
}
const GIT = "ref: refs/heads/main\n";
// The store as it is on disk, opened with the tests' secret.
const storeOf = (home, secret = "s") => cipher(`${secret}:default:local`).open(JSON.parse(readFileSync(join(home, "local.json"), "utf8")).blob);

const DEPLOY = "# Deploy\n\n## Staging\n\nStaging deploys every Tuesday. The pooler listens on port 6432.\n\n## Production\n\nProduction ships on Thursday after the change review.\n";
const ONCALL = "# On-call\n\nPage the on-call engineer in #beacon-oncall. Escalate to Dana after 15 minutes.\n";

describe("lexical ranking", () => {
  it("stems English and Russian words to one form", () => {
    assert.equal(stem("deployed"), stem("deploys"));
    assert.equal(stem("deploying"), "deploy");
    assert.equal(stem("releases"), stem("release"));
    assert.equal(stem("письма"), stem("письмо"));
    assert.deepEqual(terms("The pgBouncer listens on port 6432"), ["pgbouncer", "pg", "bouncer", "listen", "port", "6432"]);
  });

  it("[spec:local-search/ranking-words] counts a word in the headings more than one in the text", () => {
    const docs = [prepare({ head: "notes", body: "we talked about the pooler once" }), prepare({ head: "Database pooler", body: "settings" })];
    const [inText, inHead] = bm25("pooler", docs);
    assert.ok(inHead > inText);
    assert.equal(bm25("nothing shared", docs).every((s) => s === 0), true);
  });
});

describe("local search", () => {
  it("[spec:local-search/ac-changed-file] answers with the file as it is now and says it changed", async () => {
    const box = sandbox({ "docs/deploy.md": DEPLOY, "docs/oncall.md": ONCALL });
    try {
      const g = createLocal({ home: box.home, secret: "s", cwd: box.dir });
      await g.add("docs");
      const before = await g.find("which port does the staging pooler use?");
      assert.match(before.results[0].text, /6432/);
      assert.equal(before.results[0].place, "docs/deploy.md:3-5");
      assert.deepEqual(before.changes, []);

      put(box.dir, "docs/deploy.md", DEPLOY.replace("6432", "5433"));
      const after = await g.find("which port does the staging pooler use?");
      assert.match(after.results[0].text, /5433/);
      assert.ok(after.results[0].facts.includes("changed since the last look"));
      assert.doesNotMatch(textOf(after), /6432/);
      assert.deepEqual(after.changes, [{ place: "docs/deploy.md", event: "changed" }]);
      assert.match(findText(after), /^Since the last look: docs\/deploy\.md changed\./);
    } finally {
      box.done();
    }
  });

  it("[spec:local-search/ac-deleted-file] [spec:local-search/gone-not-answer] lists a deleted file as gone and answers nothing from it", async () => {
    const box = sandbox({ "docs/deploy.md": DEPLOY, "docs/oncall.md": ONCALL });
    try {
      const g = createLocal({ home: box.home, secret: "s", cwd: box.dir });
      await g.add("docs");
      rmSync(join(box.dir, "docs/oncall.md"));
      const out = await g.find("who do I escalate to on-call?");
      assert.deepEqual(out.changes, [{ place: "docs/oncall.md", event: "gone" }]);
      assert.equal(out.results.some((r) => r.path.endsWith("oncall.md")), false);
      assert.equal(g.sources()[0].gone, 1);

      put(box.dir, "docs/oncall.md", ONCALL);
      const back = await g.find("who do I escalate to on-call?");
      assert.ok(back.results[0].path.endsWith("oncall.md"));
      assert.equal(back.results[0].anchor.status, "fresh");
    } finally {
      box.done();
    }
  });

  it("[spec:local-search/ac-replaced] [spec:local-search/follow-replaced] brings what replaces a deprecated file right after it", async () => {
    const box = sandbox({
      "ops/deploy.md": "> **Deprecated:** replaced by [Deploy v2](deploy-v2.md)\n\n# Deploy\n\nProduction deploys run from Jenkins on Thursday.\n",
      "ops/deploy-v2.md": "# Deploy v2\n\nProduction ships from GitHub Actions on Wednesday.\n",
      "ops/other.md": "# Other\n\nNothing about shipping here.\n",
    });
    try {
      const g = createLocal({ home: box.home, secret: "s", cwd: box.dir });
      await g.add(".");
      const out = await g.find("Jenkins production deploys", { limit: 1 });
      assert.equal(out.results[0].path, join(box.dir, "ops/deploy.md"));
      assert.equal(out.results[0].anchor.superseded.by, join(box.dir, "ops/deploy-v2.md"));
      assert.ok(out.results[0].facts.includes("marked as replaced: ops/deploy-v2.md"));
      assert.equal(out.results[1].path, join(box.dir, "ops/deploy-v2.md"));
      assert.equal(out.results[1].replaces, 1);
      assert.match(findText(out), /\[2\] ops\/deploy-v2\.md:1-3 · Deploy v2\n {4}replaces \[1\]/);
    } finally {
      box.done();
    }
  });

  it("[spec:local-search/ac-secrets-skipped] [spec:local-search/private-key-skipped] never reads keys, env files or ignored folders", async () => {
    const box = sandbox({
      "README.md": "# Readme\n\nThe token lives in the vault.\n",
      ".env": "TOKEN=vault-token-123\n",
      id_rsa: "vault-token-123\n",
      "deploy/key.txt": "-----BEGIN OPENSSH PRIVATE KEY-----\nvault-token-123\n",
      "node_modules/x/README.md": "vault-token-123\n",
      "build/out.md": "vault-token-123\n",
      "secret-stuff/notes.md": "vault-token-123\n",
      ".gitignore": "secret-stuff/\n*.log\n",
      "debug.log": "vault-token-123\n",
    });
    try {
      assert.deepEqual(listFolder(box.dir).files.map((f) => f.slice(box.dir.length + 1)), ["README.md", "deploy/key.txt"]);
      const g = createLocal({ home: box.home, secret: "s", cwd: box.dir });
      await g.add(".");
      const out = await g.find("vault token 123");
      assert.doesNotMatch(textOf(out), /vault-token-123/);
    } finally {
      box.done();
    }
  });

  it("[spec:local-search/ac-note] [spec:local-search/notes-are-the-persons] finds a note with its date, and an edited note as edited", async () => {
    const box = sandbox({ "docs/oncall.md": ONCALL });
    try {
      const g = createLocal({ home: box.home, secret: "s", cwd: box.dir });
      await g.add("docs");
      const kept = g.remember("Escalate to Priya now, Dana moved teams");
      const out = await g.find("who do I escalate to?");
      const note = out.results.find((r) => r.path === kept.path);
      assert.ok(note, "the note is an answer");
      assert.ok(note.facts.some((f) => /^noted \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/.test(f)));
      writeFileSync(kept.path, readFileSync(kept.path, "utf8").replace("Priya", "Omar"));
      assert.match(textOf(await g.find("who do I escalate to?")), /Omar/);
      assert.throws(() => g.forget(kept.path), /Notes are a file/);
    } finally {
      box.done();
    }
  });

  it("[spec:local-search/no-text-stored] [spec:local-search/file-is-anchor] keeps sealed places and digests, never the text", async () => {
    const box = sandbox({ "docs/deploy.md": DEPLOY.replace("Tuesday", "Tuesday zebra-unique-77") });
    try {
      const g = createLocal({ home: box.home, secret: "s", userId: "me", cwd: box.dir });
      await g.add("docs");
      await g.find("zebra unique");
      const raw = readFileSync(join(box.home, "local.json"), "utf8");
      assert.doesNotMatch(raw, /zebra-unique-77|deploy\.md/);
      const opened = JSON.stringify(cipher("s:me:local").open(JSON.parse(raw).blob));
      assert.doesNotMatch(opened, /zebra-unique-77/);
      const path = join(box.dir, "docs/deploy.md");
      const anchor = Object.values(cipher("s:me:local").open(JSON.parse(raw).blob).anchors)[0];
      assert.equal(anchor.id, recipeId({ workspaceId: "me", tool: FILE_READ, args: { path } }));
      assert.deepEqual(anchor.items, ["Deploy › Staging", "Deploy › Production"]);
    } finally {
      box.done();
    }
  });

  it("[spec:cli/config-private] keeps its config and its store readable by their owner only", async () => {
    const box = sandbox({ "docs/deploy.md": DEPLOY });
    try {
      const g = createLocal({ home: box.home, cwd: box.dir });
      await g.add("docs");
      for (const file of ["config.json", "local.json"]) assert.equal(statSync(join(box.home, file)).mode & 0o777, 0o600, file);
    } finally {
      box.done();
    }
  });

  it("[rl:local-search/first-search-adds-folder] adds the project's folder when nothing is added in it, and says so", async () => {
    const box = sandbox({ "docs/deploy.md": DEPLOY });
    try {
      const g = createLocal({ home: box.home, secret: "s", cwd: box.dir });
      const out = await g.find("production day");
      assert.equal(out.added.source.place, box.dir);
      assert.equal(out.added.new, true);
      assert.match(out.results[0].text, /Thursday/);
      const again = await g.find("production day");
      assert.equal(again.added, undefined);
    } finally {
      box.done();
    }
    // From a folder inside a repository, its root; in a second project, its own; never the home folder.
    const two = folders({ "a/.git/HEAD": GIT, "a/README.md": "# A\n\nA ships on Fridays.\n", "a/docs/deploy.md": DEPLOY, "b/.git/HEAD": GIT, "b/README.md": "# B\n\nB ships on Mondays.\n" });
    try {
      const a = await createLocal({ home: two.home, secret: "s", cwd: two.at("a/docs") }).find("which day does it ship?");
      assert.equal(a.added.source.place, two.at("a"));
      assert.equal(a.project.root, two.at("a"));
      assert.ok(a.results.some((r) => r.path === two.at("a/README.md")), "the whole repository is read, not only the folder asked from");
      const b = await createLocal({ home: two.home, secret: "s", cwd: two.at("b") }).find("which day does it ship?");
      assert.equal(b.added.source.place, two.at("b"));
      const home = await createLocal({ home: two.home, secret: "s", cwd: homedir() }).find("which day does it ship?");
      assert.equal(home.added, undefined);
      assert.deepEqual(home.results, []);
    } finally {
      two.done();
    }
  });

  it("[spec:local-search/sections] gives at most two sections of one place and the limit asked", async () => {
    const many = Array.from({ length: 6 }, (_, i) => `## Pooler ${i}\n\nThe pooler setting ${i}.\n`).join("\n");
    const box = sandbox({ "a.md": `# A\n\n${many}`, "b.md": "# B\n\nThe pooler of b.\n", "c.md": "# C\n\nThe pooler of c.\n" });
    try {
      const g = createLocal({ home: box.home, secret: "s", cwd: box.dir });
      await g.add(".");
      const out = await g.find("pooler", { limit: 4 });
      assert.equal(out.results.length, 4);
      assert.equal(out.results.filter((r) => r.path.endsWith("a.md")).length, 2);
    } finally {
      box.done();
    }
  });

  it("[spec:local-search/semantic-opt-in] fuses a ranking by vectors when embeddings are given", async () => {
    // Vectors by topic: a question in Russian shares no word with the English doc but its vector is close.
    const topic = (t) => (/escalat|эскал|page|дежур/i.test(t) ? [1, 0, 0] : /deploy|выкат/i.test(t) ? [0, 1, 0] : [0, 0, 1]);
    const embed = async (texts) => texts.map(topic);
    const box = sandbox({ "docs/deploy.md": DEPLOY, "docs/oncall.md": ONCALL });
    try {
      const words = createLocal({ home: box.home, secret: "s", cwd: box.dir });
      await words.add("docs");
      assert.equal((await words.find("кому эскалировать ночью?")).results.length, 0);
      const meaning = createLocal({ home: box.home, secret: "s", cwd: box.dir, embed });
      const out = await meaning.find("кому эскалировать ночью?");
      assert.equal(out.semantic, true);
      assert.ok(out.results[0].path.endsWith("oncall.md"));
    } finally {
      box.done();
    }
  });
});

describe("local search: forget", () => {
  it("[spec:local-search/forget] drops the source and its anchors", async () => {
    const box = sandbox({ "docs/deploy.md": DEPLOY, "other/oncall.md": ONCALL });
    try {
      const g = createLocal({ home: box.home, secret: "s", cwd: box.dir });
      await g.add("docs");
      await g.add("other");
      const out = g.forget("other");
      assert.equal(out.removed, 1);
      assert.equal(out.source.place, "other");
      assert.deepEqual(g.sources().map((s) => s.place), ["docs"]);
      assert.doesNotMatch(textOf(await g.find("escalate on-call")), /Dana/);
      assert.throws(() => g.forget("nowhere"), /Not a source/);
    } finally {
      box.done();
    }
  });

  it("[rl:local-search/forget] forgets a source in this project only; its anchors go once no project searches it", async () => {
    const box = folders({ "a/.git/HEAD": GIT, "b/.git/HEAD": GIT, "handbook/oncall.md": ONCALL });
    try {
      const a = createLocal({ home: box.home, secret: "s", cwd: box.at("a") });
      const b = createLocal({ home: box.home, secret: "s", cwd: box.at("b") });
      await a.add(box.at("handbook"));
      assert.equal((await b.add(box.at("handbook"))).new, true, "new to project b");
      const forgot = a.forget(box.at("handbook"));
      assert.deepEqual([forgot.source.place, forgot.removed, forgot.elsewhere], [box.at("handbook"), 0, 1]);
      assert.doesNotMatch(textOf(await a.find("who do I escalate to on-call?")), /Dana/);
      assert.match(textOf(await b.find("who do I escalate to on-call?")), /Dana/);
      assert.throws(() => a.forget(box.at("handbook")), /Not a source of this project/);
      assert.equal(b.forget(box.at("handbook")).removed, 1);
      assert.deepEqual(Object.keys(storeOf(box.home).anchors), []);
    } finally {
      box.done();
    }
  });
});

describe("local search: projects", () => {
  it("[rl:local-search/project-scope] from project B, a question whose answer lives only in project A finds nothing from A", async () => {
    const box = folders({ "a/.git/HEAD": GIT, "a/docs/deploy.md": DEPLOY, "b/.git/HEAD": GIT, "b/README.md": "# B\n\nProject B ships its mobile app on Mondays.\n" });
    try {
      const a = createLocal({ home: box.home, secret: "s", cwd: box.at("a/docs") });
      assert.match((await a.find("which port does the staging pooler use?")).results[0].text, /6432/);
      const b = createLocal({ home: box.home, secret: "s", cwd: box.at("b") });
      const out = await b.find("which port does the staging pooler use?");
      assert.doesNotMatch(textOf(out), /6432/);
      assert.equal(out.results.some((r) => r.path.startsWith(box.at("a"))), false);
      // The same through the MCP server, and in what it lists.
      const found = await handle(b, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "genter_find", arguments: { question: "which port does the staging pooler use?" } } });
      assert.doesNotMatch(found.result.content[0].text, /6432|deploy\.md/);
      const listed = await handle(b, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "genter_sources", arguments: {} } });
      assert.match(listed.result.content[0].text, /^project {2}.*\bb \(its \.git\)$/m);
      assert.doesNotMatch(listed.result.content[0].text, /\ba\b.*places/);
      // The person's notes are theirs: kept in one project, found in every one, with their date.
      a.remember("The staging pooler moves to port 7000 in November");
      const note = (await b.find("staging pooler port")).results.find((r) => r.path === a.notesPath);
      assert.ok(note?.facts.some((f) => /^noted \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/.test(f)), "the note answers in project b with its date");
    } finally {
      box.done();
    }
  });

  it("[rl:local-search/project-scope] a project is the nearest folder up with a genter.json or a .git, else the folder itself, never the home folder", () => {
    const box = folders({
      "repo/.git/HEAD": GIT,
      "repo/src/x.js": "",
      "repo/packages/web/genter.json": "{}",
      "repo/packages/web/src/x.js": "",
      "worktree/.git": "gitdir: /elsewhere\n",
      "outer/genter.json": "{}",
      "outer/inner/.git/HEAD": GIT,
      "outer/inner/src/x.js": "",
      "loose/sub/x.md": "",
      "dir-named/genter.json/x": "",
      "me/.git/HEAD": GIT,
      "me/genter.json": "{}",
      "me/notes/x.md": "",
    });
    try {
      const of = (path) => projectOf(box.at(path), box.at("me"));
      assert.deepEqual(of("repo/src"), { root: box.at("repo"), by: ".git" });
      assert.deepEqual(of("repo/packages/web/src"), { root: box.at("repo/packages/web"), by: "genter.json" });
      assert.deepEqual(of("worktree"), { root: box.at("worktree"), by: ".git" });
      assert.deepEqual(of("outer/inner/src"), { root: box.at("outer/inner"), by: ".git" }, "a genter.json above a repository does not take it in");
      assert.deepEqual(of("loose/sub"), { root: box.at("loose/sub"), by: "folder" });
      assert.deepEqual(of("dir-named"), { root: box.at("dir-named"), by: "folder" }, "a folder named genter.json is not one");
      assert.deepEqual(of("me/notes"), { root: box.at("me/notes"), by: "folder" }, "the home folder's .git and genter.json make no project");
      assert.deepEqual(of("me"), { root: box.at("me"), by: "folder" });
      symlinkSync(box.at("me"), box.at("me-link"));
      assert.deepEqual(projectOf(box.at("me/notes"), box.at("me-link")), { root: box.at("me/notes"), by: "folder" }, "nor when the home folder is a link");
    } finally {
      box.done();
    }
  });

  it("[rl:local-search/repo-config-narrows] a project's genter.json narrows what it reads; one naming ~/, ../ or a path elsewhere is refused and nothing from it is used", async () => {
    const box = folders({
      "a/.git/HEAD": GIT,
      "a/README.md": "# A\n\nThe zebra code is 111.\n",
      "a/docs/deploy.md": "# Deploy\n\nThe zebra code is 222.\n",
      "a/docs/archive/old.md": "# Old\n\nThe zebra code is 333.\n",
      "a/docs/private.md": "# Private\n\nThe zebra code is 444.\n",
      "b/.git/HEAD": GIT,
      "b/README.md": "# B\n\nThe zebra code is 555.\n",
    });
    const codes = (out) => [...new Set(textOf(out).match(/\d{3}/g) ?? [])].sort();
    const config = (data) => writeFileSync(box.at("a/genter.json"), typeof data === "string" ? data : JSON.stringify(data));
    try {
      const a = createLocal({ home: box.home, secret: "s", cwd: box.at("a") });
      assert.deepEqual(codes(await a.find("zebra code", { limit: 10 })), ["111", "222", "333", "444"]);
      config({ include: ["docs"], exclude: ["docs/archive"], off: ["docs/private.md"], note: "keys it does not know change nothing" });
      const narrowed = await a.find("zebra code", { limit: 10 });
      assert.deepEqual(codes(narrowed), ["222"]);
      assert.deepEqual(narrowed.changes, [], "a place left out is not gone");
      assert.equal(narrowed.project.refused, undefined);
      for (const [data, named] of [
        [{ include: ["~/"] }, '"~/" in "include"'],
        [{ include: ["docs", "../b"] }, '"../b" in "include"'],
        [{ exclude: ["docs/../../b"] }, '"docs/../../b" in "exclude"'],
        [{ exclude: ["docs/../docs/archive"] }, '"docs/../docs/archive" in "exclude"'],
        [{ off: [box.at("b")] }, `"${box.at("b")}" in "off"`],
        [{ include: "docs" }, '"include" is not a list of paths'],
        ["{ include: [docs] }", "it is not JSON"],
      ]) {
        config(data);
        const out = await a.find("zebra code", { limit: 10 });
        assert.ok(out.project.refused?.startsWith(`genter.json is not used: ${named}`), `${JSON.stringify(data)}: ${out.project.refused}`);
        assert.deepEqual(codes(out), ["111", "222", "333", "444"], "nothing from a refused genter.json is used, and nothing outside the project is read");
        const found = await handle(a, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "genter_find", arguments: { question: "zebra code" } } });
        assert.ok(found.result.content[0].text.startsWith(out.project.refused), "the MCP answer says so first");
      }
      assert.equal(a.project().refused, (await a.find("zebra code")).project.refused);
      const added = await handle(a, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "genter_add", arguments: { source: box.at("a/docs") } } });
      assert.ok(added.result.content[0].text.startsWith(a.project().refused), "genter_add says so first too");
    } finally {
      box.done();
    }
  });

  it("[rl:local-search/person-off-wins] the person's off list holds in every project: never read, not kept, and no genter.json brings it back", async () => {
    const box = folders({
      "a/.git/HEAD": GIT,
      "a/genter.json": JSON.stringify({ include: ["docs/private.md", "docs"] }),
      "a/docs/deploy.md": "# Deploy\n\nThe zebra code is 222.\n",
      "a/docs/private.md": "# Private\n\nThe zebra code is 444.\n",
      "b/.git/HEAD": GIT,
      "b/README.md": "# B\n\nThe zebra code is 555.\n",
    });
    const configFile = join(box.home, "config.json");
    try {
      const a = createLocal({ home: box.home, cwd: box.at("a") });
      assert.match(textOf(await a.find("zebra code")), /444/);
      const { secret } = JSON.parse(readFileSync(configFile, "utf8"));
      writeFileSync(configFile, JSON.stringify({ secret, off: [box.at("a/docs/private.md"), box.at("b")] }));
      const out = await a.find("zebra code");
      assert.match(textOf(out), /222/);
      assert.doesNotMatch(textOf(out), /444/);
      assert.equal(Object.values(storeOf(box.home, secret).anchors).some((x) => x.args.path === box.at("a/docs/private.md")), false, "its anchor left the store");
      const b = createLocal({ home: box.home, cwd: box.at("b") });
      const inB = await b.find("zebra code");
      assert.equal(inB.added, undefined, "a project switched off is not added");
      assert.deepEqual(inB.results, []);
      await assert.rejects(b.add(box.at("b")), /is switched off \("off" in .*config\.json\): Genter does not read it/);
      // A config that is not JSON stops Genter instead of being replaced: it holds the secret and the off list.
      writeFileSync(configFile, '{"off": ["x"],}');
      await assert.rejects(a.find("zebra code"), /config\.json is not a JSON object/);
      assert.throws(() => createLocal({ home: box.home, cwd: box.at("a") }), /config\.json is not a JSON object/);
      assert.equal(readFileSync(configFile, "utf8"), '{"off": ["x"],}');
      writeFileSync(configFile, JSON.stringify({ secret, off: "b" }));
      await assert.rejects(createLocal({ home: box.home, cwd: box.at("a") }).find("zebra code"), /"off" must be a list of paths/);
    } finally {
      box.done();
    }
  });

  it("[rl:local-search/repo-config-narrows] a project nested in another keeps its genter.json when the outer one reads it", async () => {
    const box = folders({
      "repo/.git/HEAD": GIT,
      "repo/packages/web/genter.json": JSON.stringify({ off: ["internal"] }),
      "repo/packages/web/README.md": "# Web\n\nThe zebra web code is 1111.\n",
      "repo/packages/web/internal/plan.md": "# Internal\n\nThe zebra launch code is 4242.\n",
      "repo/packages/api/README.md": "# Api\n\nThe api.\n",
    });
    try {
      const web = await createLocal({ home: box.home, secret: "s", cwd: box.at("repo/packages/web") }).find("zebra launch code");
      assert.equal(web.project.root, box.at("repo/packages/web"));
      assert.doesNotMatch(textOf(web), /4242/);
      const repo = await createLocal({ home: box.home, secret: "s", cwd: box.at("repo/packages/api") }).find("zebra launch code");
      assert.equal(repo.added.source.place, box.at("repo"));
      assert.match(textOf(repo), /1111/, "the outer project still reads the nested one");
      assert.doesNotMatch(textOf(repo), /4242/, "but not what the nested genter.json leaves out");
    } finally {
      box.done();
    }
  });

  it("[rl:local-search/person-off-wins] a link never reaches a place switched off, whichever side the link is on", async () => {
    const box = folders({
      "real/proj/.git/HEAD": GIT,
      "real/proj/README.md": "# Proj\n\nThe zebra project.\n",
      "real/proj/hr/salaries.md": "# Salaries\n\nThe zebra salary band is 999.\n",
      "other/.git/HEAD": GIT,
      "other/README.md": "# Other\n\nHello.\n",
    });
    symlinkSync(box.at("real"), box.at("work"));
    const offAt = (home, path) => put(home, "config.json", JSON.stringify({ off: [path] }));
    try {
      // Switched off through the link; searched from the folder itself (the current folder is always the physical one).
      const one = join(box.base, "home-1");
      offAt(one, box.at("work/proj/hr"));
      for (const cwd of [box.at("real/proj"), box.at("work/proj")]) assert.doesNotMatch(textOf(await createLocal({ home: one, secret: "s", cwd }).find("zebra salary band")), /999/, cwd);
      // Switched off as it is; reached through the link from another project.
      const two = join(box.base, "home-2");
      offAt(two, box.at("real/proj/hr"));
      const other = createLocal({ home: two, secret: "s", cwd: box.at("other") });
      await assert.rejects(other.add(box.at("work/proj/hr")), /is switched off/);
      assert.equal((await other.add(box.at("work/proj"))).places, 1, "a linked folder is read without the place switched off");
      assert.doesNotMatch(textOf(await other.find("zebra salary band")), /999/);
    } finally {
      box.done();
    }
  });

  it("[rl:local-search/forget] [rl:local-search/gone-not-answer] sources of two projects that overlap each say what is gone, and forgetting one keeps the other's", async () => {
    const box = folders({ "code/A/.git/HEAD": GIT, "code/A/docs/deploy.md": DEPLOY, "code/A/docs/old.md": "# Old\n\nThe old pooler port was 1111.\n" });
    try {
      const code = createLocal({ home: box.home, secret: "s", cwd: box.at("code") });
      const a = createLocal({ home: box.home, secret: "s", cwd: box.at("code/A") });
      assert.equal((await code.find("pooler port")).project.root, box.at("code"), "a folder above a repository is a project of its own");
      await a.find("pooler port");
      assert.deepEqual(a.sources().filter((x) => x.kind === "folder").map((x) => x.places), [2], "A counts its files, though code read them first");
      unlinkSync(box.at("code/A/docs/old.md"));
      assert.deepEqual((await a.find("pooler port")).changes, [{ place: "docs/old.md", event: "gone" }]);
      assert.equal(code.forget(box.at("code")).removed, 0, "A still searches its files");
      const after = await a.find("which port does the staging pooler use?");
      assert.deepEqual(after.changes, [], "nothing turns new in A");
      assert.match(after.results[0].text, /6432/);
      assert.equal(a.forget(box.at("code/A")).removed, 2);
      assert.deepEqual(Object.keys(storeOf(box.home).anchors), []);
    } finally {
      box.done();
    }
  });

  it("[rl:local-search/store-split] [rl:local-search/ids-stable] splits a 0.3 store by project once, keeping ids, digests and the person's notes", async () => {
    const box = folders({
      "a/.git/HEAD": GIT,
      "a/docs/deploy.md": DEPLOY,
      "b/genter.json": "{}",
      "b/README.md": "# B\n\nThe zebra code is 555.\n",
      "loose/zebra.md": "# Loose\n\nThe loose zebra code is 777.\n",
    });
    try {
      // A store as genter-cli 0.3 kept it: one list of sources, with no project, and the anchors they read.
      const made = (cwd) => createLocal({ home: box.home, secret: "s", cwd: box.at(cwd) });
      await made("a").add(box.at("a"));
      await made("b").add(box.at("b"));
      await made("loose").add(box.at("loose"));
      made("a").remember("Escalate to Priya now, Dana moved teams");
      const old = storeOf(box.home);
      const web = { id: "src_0123456789abcdef", kind: "website", url: "https://93.184.215.14/docs/", added_at: "2026-10-01T00:00:00.000Z" };
      const v03 = { v: 1, sources: { ...Object.fromEntries(Object.values(old.sources).map(({ projects, ...src }) => [src.id, src])), [web.id]: web }, anchors: old.anchors, vectors: {} };
      writeFileSync(join(box.home, "local.json"), JSON.stringify({ v: 1, blob: cipher("s:default:local").seal(v03) }));
      const digests = Object.fromEntries(Object.values(old.anchors).map((x) => [x.id, x.digest]));

      const a = made("a");
      assert.deepEqual(a.sources().map((s) => [s.kind, s.place, Boolean(s.everywhere)]).sort(), [["folder", box.at("a"), false], ["notes", join(box.home, "notes.md"), false], ["website", web.url, true]]);
      const split = storeOf(box.home);
      assert.equal(split.v, 2);
      const projects = Object.fromEntries(Object.values(split.sources).map((s) => [s.url ?? s.path, s.projects ?? (s.everywhere ? "every project" : "the person's")]));
      assert.deepEqual(projects, { [box.at("a")]: [box.at("a")], [box.at("b")]: [box.at("b")], [box.at("loose")]: [box.at("loose")], [join(box.home, "notes.md")]: "the person's", [web.url]: "every project" });
      assert.deepEqual(Object.fromEntries(Object.values(split.anchors).map((x) => [x.id, x.digest])), digests);
      // Once: a second open writes nothing.
      const raw = readFileSync(join(box.home, "local.json"), "utf8");
      made("b").sources();
      assert.equal(readFileSync(join(box.home, "local.json"), "utf8"), raw);

      const inA = await a.find("which port does the staging pooler use?");
      assert.match(inA.results[0].text, /6432/);
      assert.deepEqual(inA.changes, [], "nothing turned new or changed because the store was split");
      assert.equal(inA.added, undefined);
      assert.doesNotMatch(textOf(await a.find("zebra code")), /555|777/);
      assert.match(textOf(await made("b").find("zebra code")), /555/);
      assert.doesNotMatch(textOf(await made("b").find("zebra code")), /777/);
      assert.match(textOf(await made("loose").find("loose zebra code")), /777/, "a source outside any project answers from its own folder");
      const note = (await made("b").find("who do I escalate to?")).results.find((r) => r.path === join(box.home, "notes.md"));
      assert.ok(note?.facts.some((f) => /^noted \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/.test(f)), "notes answer in every project, with their dates");
      // genter-cli 0.3 shares ~/.genter: a source it adds to the split store has no project either, and goes to its own
      // at the next open.
      const later = storeOf(box.home);
      delete Object.values(later.sources).find((x) => x.path === box.at("loose")).projects;
      writeFileSync(join(box.home, "local.json"), JSON.stringify({ v: 1, blob: cipher("s:default:local").seal(later) }));
      assert.deepEqual(made("loose").sources().filter((x) => x.kind === "folder").map((x) => x.place), [box.at("loose")]);
      assert.deepEqual(storeOf(box.home).sources[Object.values(later.sources).find((x) => x.path === box.at("loose")).id].projects, [box.at("loose")]);
      assert.equal(made("loose").forget(box.at("loose")).removed, 1);
    } finally {
      box.done();
    }
  });

  it("a search by meaning in one project keeps the vectors another project's search made", async () => {
    const many = Array.from({ length: 2100 }, (_, i) => `## Part ${i}\n\nBeacon setting ${i}.\n`).join("\n");
    const box = folders({ "a/.git/HEAD": GIT, "a/a.md": "# A\n\nBeacon.\n", "b/.git/HEAD": GIT, "b/b.md": `# B\n\n${many}` });
    const embedded = [];
    const embed = Object.assign(
      async (texts) => {
        embedded.push(texts.length - 1); // the question comes first
        return texts.map((t, i) => [1, i % 7, t.length % 5]);
      },
      { model: "test" },
    );
    try {
      const b = createLocal({ home: box.home, secret: "s", cwd: box.at("b"), embed });
      await b.find("beacon setting");
      await createLocal({ home: box.home, secret: "s", cwd: box.at("a"), embed }).find("beacon setting");
      await b.find("beacon setting");
      assert.ok(embedded[0] > 2000);
      assert.deepEqual(embedded.slice(1), [1, 0], "project b's sections are not embedded again");
    } finally {
      box.done();
    }
  });
});

describe("local search: websites", () => {
  it("[spec:local-search/reads-again] reads a saved page again when its words fit, and marks a removed page gone", async () => {
    const site = "https://93.184.215.14/docs/";
    const pages = {
      "/docs/": '<html><head><title>Docs</title></head><body><h1>Docs</h1><p>Start here.</p><a href="/docs/limits">Limits</a></body></html>',
      "/docs/limits": "<html><head><title>Limits</title></head><body><h1>Limits</h1><p>The API allows 600 requests a minute.</p></body></html>",
    };
    const original = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const u = new URL(String(url));
      if (u.pathname === "/robots.txt") return new Response("", { status: 404 });
      const html = pages[u.pathname];
      return html == null ? new Response("no", { status: 404 }) : new Response(html, { status: 200, headers: { "content-type": "text/html" } });
    };
    const box = sandbox({});
    try {
      const g = createLocal({ home: box.home, secret: "s", cwd: box.dir });
      const added = await g.add(site);
      assert.equal(added.places, 2);
      pages["/docs/limits"] = pages["/docs/limits"].replace("600", "900");
      const out = await g.find("how many API requests a minute?");
      assert.match(out.results[0].text, /900 requests/);
      assert.equal(out.results[0].place, "https://93.184.215.14/docs/limits");
      assert.deepEqual(out.changes, [{ place: "https://93.184.215.14/docs/limits", event: "changed" }]);
      delete pages["/docs/limits"];
      const gone = await g.find("how many API requests a minute?");
      assert.deepEqual(gone.changes, [{ place: "https://93.184.215.14/docs/limits", event: "gone" }]);
      assert.equal(gone.results.some((r) => r.url === "https://93.184.215.14/docs/limits"), false);
    } finally {
      globalThis.fetch = original;
      box.done();
    }
  });
});

describe("embedding providers", () => {
  it("[spec:local-search/semantic-providers] picks the endpoint, the named one, the first key set, else Ollama", () => {
    assert.deepEqual(embeddingProvider({ env: { GENTER_EMBED_URL: "http://lm:1234/v1/", GENTER_EMBED_MODEL: "bge" } }), { name: "custom", url: "http://lm:1234/v1", key: undefined, model: "bge" });
    assert.equal(embeddingProvider({ env: { OPENROUTER_API_KEY: "r", OPENAI_API_KEY: "o" } }).name, "openai");
    assert.deepEqual(embeddingProvider({ env: { AI_GATEWAY_API_KEY: "v" } }), { name: "vercel", url: "https://ai-gateway.vercel.sh/v1", key: "v", model: "openai/text-embedding-3-small" });
    assert.equal(embeddingProvider({ env: { AI_GATEWAY_TOKEN: "t" } }).key, "t");
    assert.equal(embeddingProvider({ env: { OPENAI_API_KEY: "o" }, name: "ollama" }).url, "http://localhost:11434/v1");
    assert.equal(embeddingProvider({ env: {}, config: { openrouter_api_key: "r" } }).name, "openrouter");
    assert.equal(embeddingProvider({ env: {} }).name, "ollama");
    assert.throws(() => embeddingProvider({ env: {}, name: "openai" }), /openai needs OPENAI_API_KEY/);
    assert.throws(() => embeddingProvider({ env: {}, name: "nope" }), /Unknown provider/);
  });

  it("[spec:local-search/semantic-providers] calls any OpenAI-compatible /embeddings and says how to get one when none answers", async () => {
    const original = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, init) => {
      calls.push({ url, auth: init.headers.Authorization, body: JSON.parse(init.body) });
      if (String(url).startsWith("http://localhost:11434")) throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
      return new Response(JSON.stringify({ data: JSON.parse(init.body).input.map((_, index) => ({ index, embedding: [index, 1] })) }), { status: 200 });
    };
    try {
      const embed = embedderFor({ name: "vercel", url: "https://ai-gateway.vercel.sh/v1", key: "v", model: "openai/text-embedding-3-small" });
      assert.deepEqual(await embed(["a", "b"]), [[0, 1], [1, 1]]);
      assert.deepEqual(calls[0], { url: "https://ai-gateway.vercel.sh/v1/embeddings", auth: "Bearer v", body: { model: "openai/text-embedding-3-small", input: ["a", "b"] } });
      assert.equal(embed.model, "openai/text-embedding-3-small");
      await assert.rejects(embedderFor(embeddingProvider({ env: {} }))(["x"]), /No embeddings: set OPENAI_API_KEY.*Ollama.*ECONNREFUSED/);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("the genter command", () => {
  // The package as installed: what package.json's files ship, with no node_modules anywhere above it.
  function installed() {
    const base = mkdtempSync(join(tmpdir(), "genter-bin-"));
    for (const part of ["bin", "src", "rules", "package.json"]) cpSync(join(root, part), join(base, "pkg", part), { recursive: true });
    // What npm ships of readers/: the schema and each reader.json, not the fixtures.
    cpSync(join(root, "readers"), join(base, "pkg/readers"), { recursive: true, filter: (from) => statSync(from).isDirectory() ? !from.includes("fixtures") : /reader(\.schema)?\.json$/.test(from) });
    mkdirSync(join(base, "project/docs"), { recursive: true });
    writeFileSync(join(base, "project/docs/deploy.md"), DEPLOY);
    const home = join(base, "home/.genter");
    const env = { PATH: process.env.PATH, HOME: join(base, "home"), GENTER_HOME: home };
    const bin = join(base, "pkg/bin/genter.js");
    const run = (...args) => spawnSync(process.execPath, [bin, ...args], { cwd: join(base, "project"), env, encoding: "utf8" });
    // The same, without blocking this process (a test server here can answer), with more env and lines on stdin.
    const start = (args, { env: more = {}, input = "", cwd = join(base, "project") } = {}) =>
      new Promise((done) => {
        const child = spawn(process.execPath, [bin, ...args], { cwd, env: { ...env, ...more } });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (d) => {
          stdout += d;
        });
        child.stderr.on("data", (d) => {
          stderr += d;
        });
        child.on("close", (status) => done({ status, stdout, stderr }));
        child.stdin.end(input);
      });
    return { run, start, home, base, done: () => rmSync(base, { recursive: true, force: true }) };
  }

  it("[spec:local-search/ac-no-keys] [rl:cli/no-packages] [rl:cli/output-local] asks with no key and no package", () => {
    const pkg = installed();
    try {
      const out = pkg.run("ask", "which", "day", "does", "production", "ship?");
      assert.equal(out.status, 0, out.stderr);
      assert.match(out.stdout, /^\[1\] docs\/deploy\.md:7-9 · Deploy › Production/m);
      assert.match(out.stderr, /added as a source/);
      const json = JSON.parse(pkg.run("ask", "production", "--json").stdout);
      assert.equal(json.results[0].lines[0], 7);
    } finally {
      pkg.done();
    }
  });

  it("[rl:local-search/project-scope] [rl:local-search/ac-other-project] genter ask and genter mcp in project B answer nothing from project A", async () => {
    const pkg = installed();
    try {
      put(pkg.base, "a/.git/HEAD", GIT);
      put(pkg.base, "a/docs/deploy.md", DEPLOY);
      put(pkg.base, "b/.git/HEAD", GIT);
      put(pkg.base, "b/README.md", "# B\n\nProject B ships its mobile app on Mondays.\n");
      const question = "which port does the staging pooler use?";
      const inA = await pkg.start(["ask", question], { cwd: join(pkg.base, "a") });
      assert.match(inA.stdout, /6432/, inA.stderr);
      const inB = await pkg.start(["ask", question], { cwd: join(pkg.base, "b") });
      assert.equal(inB.status, 0, inB.stderr);
      assert.doesNotMatch(inB.stdout, /6432|deploy\.md/);
      assert.match(inB.stderr, /this project's folder, added as a source/);
      const rpc = (id, method, params) => `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`;
      const mcp = await pkg.start(["mcp"], { cwd: join(pkg.base, "b"), input: rpc(1, "initialize", { protocolVersion: "2025-06-18" }) + rpc(2, "tools/call", { name: "genter_find", arguments: { question } }) + rpc(3, "tools/call", { name: "genter_sources", arguments: {} }) });
      const [, found, sources] = mcp.stdout.trim().split("\n").map((l) => JSON.parse(l));
      assert.doesNotMatch(found.result.content[0].text, /6432|deploy\.md/);
      assert.doesNotMatch(sources.result.content[0].text, /\/a\b/);
      assert.match(mcp.stderr, /searching the project .*\bb and your notes/);
      // An MCP client that starts each server outside its project, with the folder given: each searches that project.
      const serve = (folder) => pkg.start(["mcp", join(pkg.base, folder)], { cwd: pkg.base, input: rpc(1, "initialize", { protocolVersion: "2025-06-18" }) + rpc(2, "tools/call", { name: "genter_find", arguments: { question } }) });
      const fromA = await serve("a");
      assert.match(fromA.stdout, /6432/, fromA.stderr);
      const fromB = await serve("b");
      assert.equal(fromB.status, 0, fromB.stderr);
      assert.doesNotMatch(fromB.stdout.trim().split("\n").at(-1), /6432|deploy\.md/);
      assert.match(fromB.stderr, /searching the project .*\bb and your notes/);
    } finally {
      pkg.done();
    }
  });

  it("[rl:cli/help] prints the help, its last line Genter Cloud's MCP address, and fails on an unknown command", () => {
    const pkg = installed();
    try {
      const help = pkg.run();
      assert.equal(help.status, 0);
      assert.match(help.stdout, /genter ask <question>/);
      assert.match(help.stdout, /genter install \[tool \.\.\.\]/);
      assert.match(help.stdout.trim().split("\n").at(-1), /https:\/\/genter\.ai\/api\/mcp$/);
      assert.doesNotMatch(help.stdout, /login|logout|--local|token|dashboard|composio/i);
      // --cloud is genter install's alone: it adds Genter Cloud's address to the AI tools.
      assert.doesNotMatch(help.stdout.replace(/ {2}genter install[\s\S]*?\n\n/, ""), /--cloud/);
      const bad = pkg.run("nope");
      assert.equal(bad.status, 1);
      assert.match(bad.stderr, /Unknown command: nope/);
      assert.equal(pkg.run("ask").status, 1);
      for (const app of ["search", "run", "execute", "anchors"]) assert.match(pkg.run(app, '{"query":"x"}').stderr, /Unknown command/, app);
    } finally {
      pkg.done();
    }
  });

  it("[rl:cli/cloud-own-server] never reaches Genter Cloud: no token read or kept, ask and mcp answer from this computer, login, logout and --cloud name the MCP address", async () => {
    // A stand-in for the old token API, and a token where 0.3 looked for one: in the env and in config.json.
    const seen = [];
    const server = createServer((req, res) => {
      seen.push(req.url);
      res.writeHead(200, { "content-type": "application/json" }).end('{"user":{"email":"anna@acme.test"},"result":{"text":"From the cloud"}}');
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const pkg = installed();
    try {
      const token = `gnt_${"a".repeat(43)}`;
      const env = { GENTER_TOKEN: token, GENTER_URL: `http://127.0.0.1:${server.address().port}` };
      const file = join(pkg.home, "config.json");
      const config = () => JSON.parse(readFileSync(file, "utf8"));
      // What 0.3's genter login left: the token beside the rest of the config, which stays as it is.
      const signedIn = () => writeFileSync(file, JSON.stringify({ ...config(), cloud: { token, url: env.GENTER_URL, workspace: "Acme" } }), { mode: 0o600 });
      mkdirSync(pkg.home, { recursive: true });
      writeFileSync(file, "{}");
      signedIn();

      const asked = await pkg.start(["ask", "production"], { env });
      assert.equal(asked.status, 0, asked.stderr);
      assert.match(asked.stdout, /docs\/deploy\.md/);
      assert.doesNotMatch(asked.stdout, /Genter Cloud|From the cloud/);
      assert.match(asked.stderr, /removed the Genter Cloud token genter 0\.3 kept in .*config\.json/);
      assert.equal(config().cloud, undefined);
      assert.ok(config().secret, "the rest of the config is kept");
      if (process.platform !== "win32") assert.equal(statSync(file).mode & 0o777, 0o600);
      const again = await pkg.start(["ask", "production"], { env });
      assert.doesNotMatch(again.stderr, /Genter Cloud/);

      signedIn();
      const rpc = (id, method, params) => `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`;
      const mcp = await pkg.start(["mcp"], { env, input: rpc(1, "initialize", { protocolVersion: "2025-06-18" }) + rpc(2, "tools/list") + rpc(3, "tools/call", { name: "genter_find", arguments: { question: "production" } }) });
      const [init, list, found] = mcp.stdout.trim().split("\n").map((l) => JSON.parse(l));
      assert.doesNotMatch(JSON.stringify([init, list]), /Genter Cloud|workspace/);
      assert.match(found.result.content[0].text, /docs\/deploy\.md/);
      assert.doesNotMatch(found.result.content[0].text, /Genter Cloud|From the cloud/);
      assert.equal(config().cloud, undefined);
      // 0.3's --local changes nothing now; its --cloud is gone like login.
      const only = await pkg.start(["mcp", "--local"], { env, input: rpc(1, "initialize", { protocolVersion: "2025-06-18" }) });
      assert.equal(JSON.parse(only.stdout.trim()).result.serverInfo.name, init.result.serverInfo.name, only.stderr);
      assert.equal(JSON.parse((await pkg.start(["ask", "--json", "--local", "production"], { env })).stdout).question, "production");
      assert.deepEqual(seen, []);

      for (const args of [["login", token], ["logout"], ["ask", "production", "--cloud"]]) {
        signedIn();
        const out = await pkg.start(args, { env });
        assert.equal(out.status, 1, args.join(" "));
        assert.equal(out.stdout, "");
        assert.match(out.stderr, new RegExp(`${args[0] === "ask" ? "--cloud" : `genter ${args[0]}`} is gone[\\s\\S]*OAuth[\\s\\S]*https://genter\\.ai/api/mcp`));
        assert.equal(config().cloud, undefined, args.join(" "));
      }
      assert.deepEqual(seen, []);
    } finally {
      server.close();
      pkg.done();
    }
  });

  it("[spec:cli/demo] shows a changed answer and a replaced doc on a temp folder, with no key", () => {
    const pkg = installed();
    try {
      const out = pkg.run("demo");
      assert.equal(out.status, 0, out.stderr);
      assert.match(out.stdout, /port 6432[\s\S]*Since the last look: docs\/deploy\.md changed[\s\S]*changed since the last look[\s\S]*port 5433/);
      assert.match(out.stdout, /still answers:\n {2}"Staging deploys every Tuesday from `main`\. The pooler listens on port 6432\."/);
      assert.match(out.stdout, /\[2\] docs\/runbook-v2\.md:3-5 · Runbook v2 › Restarting the probes\n {6}replaces \[1\]/);
      assert.match(out.stdout, /https:\/\/genter\.ai\/api\/mcp/);
      assert.doesNotMatch(out.stdout, /genter login/);
    } finally {
      pkg.done();
    }
  });
});
