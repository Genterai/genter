import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { recipeId } from "../src/anchor.js";
import { bm25, prepare, stem, terms } from "../src/lexical.js";
import { createLocal, embedderFor, embeddingProvider, FILE_READ, findText, listFolder } from "../src/local.js";
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

  it("[spec:local-search/first-search-adds-folder] adds the current folder when nothing is added, and says so", async () => {
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
  // The package as installed: bin, src and package.json with no node_modules anywhere above it.
  function installed() {
    const base = mkdtempSync(join(tmpdir(), "genter-bin-"));
    for (const part of ["bin", "src", "package.json"]) cpSync(join(root, part), join(base, "pkg", part), { recursive: true });
    mkdirSync(join(base, "project/docs"), { recursive: true });
    writeFileSync(join(base, "project/docs/deploy.md"), DEPLOY);
    const home = join(base, "home/.genter");
    const env = { PATH: process.env.PATH, HOME: join(base, "home"), GENTER_HOME: home };
    const bin = join(base, "pkg/bin/genter.js");
    const run = (...args) => spawnSync(process.execPath, [bin, ...args], { cwd: join(base, "project"), env, encoding: "utf8" });
    // The same, without blocking this process (a test server here can answer), with more env and lines on stdin.
    const start = (args, { env: more = {}, input = "" } = {}) =>
      new Promise((done) => {
        const child = spawn(process.execPath, [bin, ...args], { cwd: join(base, "project"), env: { ...env, ...more } });
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
    return { run, start, home, done: () => rmSync(base, { recursive: true, force: true }) };
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
