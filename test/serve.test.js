import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs, { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import fsp from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { conformance } from "../src/conformance.js";
import { isLoopback, parseTokens, serveHttp, serveSetup, tokensFile } from "../src/http.js";
import { createLocal } from "../src/local.js";
import { handle, mcpTools, searchText } from "../src/mcp-server.js";
import { cipher } from "../src/seal.js";
import { check, post, QUERY, sender, setup } from "./serve-smoke.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const bin = join(root, "bin/genter.js");
const hex = () => randomBytes(32).toString("hex");

function box() {
  const base = mkdtempSync(join(tmpdir(), "genter-serve-"));
  return { base, at: (p) => join(base, p), done: () => rmSync(base, { recursive: true, force: true }) };
}
function put(dir, path, text) {
  mkdirSync(join(dir, path, ".."), { recursive: true });
  writeFileSync(join(dir, path), text);
}

// `genter serve` as a process: { base (http://host:port), code (when it ended), stderr(), stop() }. Resolves once it
// listens, or when it ends first (a refusal).
function serve(args, { cwd, env = {} }) {
  const child = spawn(process.execPath, [bin, "serve", ...args], { cwd, env: { PATH: process.env.PATH, HOME: join(cwd, "home"), ...env } });
  let stderr = "";
  const ended = new Promise((done) => child.on("close", (code) => done(code)));
  return new Promise((ready) => {
    child.stderr.on("data", (d) => {
      stderr += d;
      const url = / at (http:\/\/\S+)\/mcp /.exec(stderr)?.[1];
      if (url) ready({ base: url, stderr: () => stderr, stop: () => (child.kill("SIGTERM"), ended), ended });
    });
    ended.then((code) => ready({ code, stderr: () => stderr, ended }));
  });
}

// Another genter command, run to its end: { code, err }.
function command(args, { cwd, env = {} }) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [bin, ...args], { cwd, env: { PATH: process.env.PATH, HOME: join(cwd, "home"), ...env } });
    let err = "";
    child.stderr.on("data", (d) => {
      err += d;
    });
    child.on("close", (code) => done({ code, err }));
  });
}

// A request with headers fetch does not let one set (Host): { status, body }.
function raw(base, { method = "POST", headers = {}, body = "" } = {}) {
  const u = new URL(`${base}/mcp`);
  return new Promise((done, fail) => {
    const req = request({ host: u.hostname, port: u.port, path: u.pathname, method, headers: { "Content-Type": "application/json", ...headers } }, (res) => {
      let text = "";
      res.on("data", (d) => {
        text += d;
      });
      res.on("end", () => done({ status: res.statusCode, headers: res.headers, body: text ? JSON.parse(text) : null }));
    });
    req.on("error", fail);
    req.end(body);
  });
}

const textOf = (res) => (res?.body?.result?.content ?? []).map((c) => c.text).join("\n");
const searchMsg = (query, id = 1) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "search", arguments: { query } } });

describe("genter serve: the local engine for a small team over HTTP", () => {
  it("[rl:serve/same-contract] [rl:serve/tokens] [rl:serve/health] [rl:serve/read-only] [rl:serve/async-reads] [rl:serve/team-reads-all] the smoke test passes against genter serve: conformance over HTTP, 401 without a token, nothing to add or keep, /health while 20 searches run, the folders unchanged", { timeout: 120_000 }, async () => {
    const b = box();
    const { tokens, repos } = setup(b.base);
    const s = await serve(["repos", "--port", "0"], { cwd: b.base, env: { GENTER_HOME: b.at("data"), GENTER_TOKENS_FILE: b.at("genter_tokens"), GENTER_SECRET_FILE: b.at("genter_seal") } });
    try {
      assert.ok(s.base, s.stderr());
      assert.match(s.stderr(), / at http:\/\/127\.0\.0\.1:\d+\/mcp /, "127.0.0.1 by default");
      assert.match(s.stderr(), /2 tokens in .*genter_tokens.*every token holder reads everything served here, so serve only what the whole team may read/);
      const checks = await check(s.base, { token: tokens.bo, repos });
      assert.deepEqual(checks.filter((c) => !c.ok), [], JSON.stringify(checks, null, 2));
      assert.equal(checks.length, 12);
      for (const t of Object.values(tokens)) assert.ok(!s.stderr().includes(t), "no token is printed");
    } finally {
      await s.stop?.();
      b.done();
    }
  });

  it("[rl:serve/same-contract] search over HTTP answers word for word what genter mcp answers over stdio, from the same store", { timeout: 60_000 }, async () => {
    const b = box();
    const token = setup(b.base, { filler: 3 }).tokens.ana;
    const env = { GENTER_HOME: b.at("data"), GENTER_TOKENS_FILE: b.at("genter_tokens") }; // loopback, the config's secret: genter mcp opens the same store
    const s = await serve(["repos", "--port", "0"], { cwd: b.base, env });
    let overHttp;
    let tools;
    try {
      await post(s.base, searchMsg(QUERY), { token });
      overHttp = textOf(await post(s.base, searchMsg(QUERY, 2), { token }));
      tools = (await post(s.base, { jsonrpc: "2.0", id: 3, method: "tools/list" }, { token })).body.result.tools;
    } finally {
      await s.stop();
    }
    const child = spawn(process.execPath, [bin, "mcp", "repos"], { cwd: b.base, env: { PATH: process.env.PATH, HOME: b.at("home"), GENTER_HOME: b.at("data") } });
    let out = "";
    child.stdout.on("data", (d) => {
      out += d;
    });
    child.stdin.end(`${JSON.stringify(searchMsg(QUERY, 7))}\n`);
    await new Promise((done) => child.on("close", done));
    const overStdio = JSON.parse(out.trim().split("\n")[0]).result.content[0].text;
    try {
      assert.match(overHttp, /^\[\d+\] Release process v2/m);
      assert.equal(overHttp, overStdio);
      assert.deepEqual(tools, mcpTools.slice(0, 2), "the same two tools as genter mcp, as they are");
    } finally {
      b.done();
    }
  });

  it("[rl:serve/same-contract] [rl:contract/conformance] Streamable HTTP: JSON answers, a notification 202 (a tools/call too, run not), no JSON-RPC object 400, a batch as a batch, GET and DELETE 405, bad JSON -32700, an unknown protocol version 400, another content type 415, over 1 MB 413, another path 404, the two tools alone", async () => {
    const b = box();
    put(b.base, "repo/docs/deploy.md", "# Deploy\n\nWe deploy on Thursday.\n");
    const token = hex();
    writeFileSync(b.at("tokens"), `ana ${token}\n`);
    const g = createLocal({ home: b.at("home"), secret: hex(), cwd: b.at("repo"), notes: false });
    await g.add(b.at("repo"));
    const s = await serveHttp(g, { port: 0, tokens: tokensFile(b.at("tokens")), log: () => {} });
    const base = s.url.replace(/\/mcp$/, "");
    try {
      const init = await post(base, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } }, { token });
      assert.equal(init.status, 200);
      assert.match(init.headers.get("content-type"), /^application\/json/);
      assert.equal(init.body.result.protocolVersion, "2025-06-18");
      assert.match(init.body.result.instructions, /folders this server reads for the team/);
      const note = await post(base, { jsonrpc: "2.0", method: "notifications/initialized" }, { token });
      assert.equal(note.status, 202);
      assert.equal(note.body, null);
      for (const method of ["tools/call", "tools/list", "initialize"]) {
        const quiet = await post(base, { jsonrpc: "2.0", method, params: { name: "search", arguments: { query: "deploy" } } }, { token });
        assert.equal(quiet.status, 202, `a ${method} notification runs nothing and gets no answer`);
        assert.equal(quiet.body, null);
      }
      for (const body of ["null", "[null]", "5", '"x"', "[[]]"]) {
        const invalid = await post(base, body, { token });
        assert.equal(invalid.status, 400, body);
        assert.deepEqual(invalid.body, { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } }, body);
      }
      const batch = await post(base, [{ jsonrpc: "2.0", id: 2, method: "ping" }, { jsonrpc: "2.0", method: "notifications/initialized" }, searchMsg("when do we deploy", 3)], { token, headers: { "MCP-Protocol-Version": "2025-06-18" } });
      assert.equal(batch.status, 200);
      assert.deepEqual(batch.body.map((m) => m.id), [2, 3]);
      assert.match(batch.body[1].result.content[0].text, /We deploy on Thursday/);
      for (const method of ["GET", "DELETE"]) {
        const res = await raw(base, { method, headers: { Authorization: `Bearer ${token}` } });
        assert.equal(res.status, 405, method);
        assert.equal(res.headers.allow, "POST");
      }
      const bad = await post(base, "{not json", { token });
      assert.equal(bad.status, 400);
      assert.equal(bad.body.error.code, -32700);
      assert.equal((await post(base, { jsonrpc: "2.0", id: 4, method: "ping" }, { token, headers: { "MCP-Protocol-Version": "1999-01-01" } })).status, 400);
      assert.equal((await post(base, "{}", { token, headers: { "Content-Type": "text/plain" } })).status, 415);
      assert.equal((await post(base, JSON.stringify({ jsonrpc: "2.0", id: 5, method: "ping", params: { pad: "x".repeat(1_100_000) } }), { token })).status, 413);
      assert.equal((await fetch(`${base}/elsewhere`)).status, 404);
      const listed = await post(base, { jsonrpc: "2.0", id: 6, method: "tools/list" }, { token });
      assert.deepEqual(listed.body.result.tools.map((t) => t.name), ["search", "read"]);
      for (const name of ["genter_find", "genter_add", "genter_remember", "genter_sources"]) {
        const res = await post(base, { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name, arguments: { question: "deploy", source: "/", text: "x" } } }, { token });
        assert.equal(res.body.error.code, -32602, name);
      }
      const report = await conformance(sender(base, token), { query: "when do we deploy" });
      assert.equal(report.ok, true, JSON.stringify(report.checks.filter((c) => !c.ok)));
    } finally {
      await s.close();
      b.done();
    }
  });

  it("[rl:serve/tokens] one token per person: Bearer compared in constant time, a line removed is refused at the next request, one added works at once, a weak or malformed line is not used and no token is printed", async () => {
    const b = box();
    put(b.base, "repo/docs/deploy.md", "# Deploy\n\nWe deploy on Thursday.\n");
    const [ana, bo, carl] = [hex(), hex(), hex()];
    writeFileSync(b.at("tokens"), `# the team\nana ${ana}\nbo short-token\nlonely\ndup ${ana}\n`);
    const parsed = parseTokens(readFileSync(b.at("tokens"), "utf8"));
    assert.deepEqual(parsed.tokens.map((t) => t.name), ["ana"]);
    assert.deepEqual(parsed.problems, [
      'line 3 (bo): a token is 32 characters or more of 10 kinds or more (openssl rand -hex 32): not used',
      'line 4 is not "name token": not used',
      "line 5 (dup): the same token as an earlier line: not used",
    ]);
    assert.ok(!parseTokens(`x ${"a".repeat(40)}\n`).tokens.length, "40 times the same letter is weak");
    const logs = [];
    const tokens = tokensFile(b.at("tokens"), { log: (l) => logs.push(l) });
    assert.equal(tokens.who(`Bearer ${ana}`), "ana");
    assert.equal(tokens.who(`bearer   ${ana} `), "ana");
    for (const h of [undefined, "", ana, `Basic ${ana}`, `Bearer ${ana}x`, "Bearer short-token", `Bearer ${ana} ${ana}`]) assert.equal(tokens.who(h), null, String(h));
    assert.equal(readFileSync(new URL("../src/http.js", import.meta.url), "utf8").match(/timingSafeEqual\(/g)?.length, 1, "tokens are compared with timingSafeEqual");

    const g = createLocal({ home: b.at("home"), secret: hex(), cwd: b.at("repo"), notes: false });
    await g.add(b.at("repo"));
    const s = await serveHttp(g, { port: 0, tokens, log: () => {} });
    const base = s.url.replace(/\/mcp$/, "");
    const list = { jsonrpc: "2.0", id: 1, method: "tools/list" };
    try {
      assert.equal((await post(base, list, { token: ana })).status, 200);
      writeFileSync(b.at("tokens"), `bo ${bo}\ncarl ${carl}\n`); // ana's line removed, in place
      const revoked = await post(base, list, { token: ana });
      assert.equal(revoked.status, 401);
      assert.equal(revoked.headers.get("www-authenticate"), 'Bearer realm="genter"');
      assert.equal(revoked.body.result, undefined);
      assert.equal((await post(base, list, { token: carl })).status, 200);
      unlinkSync(b.at("tokens"));
      writeFileSync(b.at("tokens.new"), `carl ${carl}\n`);
      assert.equal((await post(base, list, { token: carl })).status, 401, "a tokens file that cannot be read holds no token");
      await fsp.rename(b.at("tokens.new"), b.at("tokens")); // replaced by a new file, as editors do
      assert.equal((await post(base, list, { token: carl })).status, 200);
      assert.equal((await post(base, list, { token: bo })).status, 401);
      const all = logs.join("\n");
      for (const t of [ana, bo, carl, "short-token"]) assert.ok(!all.includes(t), "no token in what it says");
      assert.match(all, /line 3 \(bo\)/);
      assert.match(all, /cannot be read by this user/);
    } finally {
      await s.close();
      b.done();
    }
  });

  it("[rl:serve/tokens] it does not start with a tokens file that holds no token or cannot be read", { timeout: 30_000 }, async () => {
    const b = box();
    const home = b.at("data");
    writeFileSync(b.at("empty"), "");
    writeFileSync(b.at("comments"), "# ana\n\n# bo\n");
    writeFileSync(b.at("weak"), "ana short-token\n");
    mkdirSync(b.at("folder"));
    for (const f of ["empty", "comments", "weak"]) assert.throws(() => serveSetup({ home, env: { GENTER_TOKENS_FILE: b.at(f) } }), /^Error: No token in .*: write one line per person, "name token"/, f);
    for (const f of ["folder", "missing"]) assert.throws(() => serveSetup({ home, env: { GENTER_TOKENS_FILE: b.at(f) } }), /^Error: GENTER_TOKENS_FILE .* cannot be read by this user/, f);
    setup(b.base, { filler: 0 });
    const s = await serve(["repos", "--port", "0"], { cwd: b.base, env: { GENTER_HOME: home, GENTER_TOKENS_FILE: b.at("comments") } });
    assert.equal(s.code, 1);
    assert.match(s.stderr(), /No token in /);
    assert.doesNotMatch(s.stderr(), /serving/);
    b.done();
  });

  it("[rl:serve/loopback-default] 127.0.0.1 unless --host; away from loopback only with tokens, saying TLS must sit in front; with no tokens, a loopback Host only, and never a web page", { timeout: 60_000 }, async () => {
    for (const h of ["127.0.0.1", "localhost", "::1", "[::1]", "127.8.9.10", "::ffff:127.0.0.1"]) assert.ok(isLoopback(h), h);
    for (const h of ["0.0.0.0", "::", "10.0.0.1", "192.168.1.2", "genter.example", "localhost.example", "", undefined]) assert.ok(!isLoopback(h), String(h));
    const b = box();
    setup(b.base, { filler: 0 });
    const open = await serve(["repos", "--host", "0.0.0.0", "--port", "0"], { cwd: b.base, env: { GENTER_HOME: b.at("data") } });
    assert.equal(open.code, 1);
    assert.match(open.stderr(), /genter serve --host 0\.0\.0\.0 leaves this computer, so it needs one token per person: GENTER_TOKENS_FILE/);
    const env = { GENTER_HOME: b.at("data"), GENTER_TOKENS_FILE: b.at("genter_tokens"), GENTER_SECRET_FILE: b.at("genter_seal") };
    const away = await serve(["repos", "--host", "0.0.0.0", "--port", "0"], { cwd: b.base, env });
    try {
      assert.match(away.stderr(), /plain HTTP: put TLS in front of it/);
      assert.match(away.stderr(), / at http:\/\/0\.0\.0\.0:\d+\/mcp /);
    } finally {
      await away.stop?.();
    }
    const near = await serve(["repos", "--port", "0"], { cwd: b.base, env: { GENTER_HOME: b.at("data"), GENTER_SECRET_FILE: b.at("genter_seal") } });
    try {
      assert.match(near.stderr(), /no tokens \(GENTER_TOKENS_FILE\): anyone on this computer can read what is served here; it answers only on loopback/);
      assert.doesNotMatch(near.stderr(), /plain HTTP/);
      const ping = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" });
      assert.equal((await raw(near.base, { body: ping })).status, 200, "no token needed on loopback without tokens");
      const rebound = await raw(near.base, { body: ping, headers: { Host: "genter.attacker.example:8787" } });
      assert.equal(rebound.status, 403, "a Host that is not loopback (DNS rebinding)");
      for (const origin of ["https://attacker.example", "null"]) assert.equal((await raw(near.base, { body: ping, headers: { Origin: origin } })).status, 403, origin);
      assert.equal((await raw(near.base, { body: ping, headers: { Origin: `http://localhost:${new URL(near.base).port}` } })).status, 200);
    } finally {
      await near.stop?.();
      b.done();
    }
    assert.throws(() => serveHttp({}, { host: "0.0.0.0", port: 0 }), /needs tokens/);
    for (const port of [-1, 70000, Number.NaN]) assert.throws(() => serveSetup({ env: {}, home: "/tmp/x", port }), /--port takes a port number/);
  });

  it("[rl:serve/seal-outside] the seal key comes from GENTER_SECRET_FILE outside Genter's home: needed away from loopback, refused when inside the home (as written or where its link leads), weak or unreadable; the store opens with it and the config keeps none", { timeout: 60_000 }, async () => {
    const b = box();
    setup(b.base, { filler: 0 });
    const home = b.at("data");
    const tokensEnv = { GENTER_TOKENS_FILE: b.at("genter_tokens") };
    mkdirSync(home, { recursive: true });
    writeFileSync(join(home, "seal"), `${hex()}\n`);
    writeFileSync(b.at("weak"), "changemechangemechangemechangeme\n");
    const away = { home, host: "0.0.0.0" };
    assert.throws(() => serveSetup({ ...away, env: tokensEnv }), /needs the seal key of its store in a file outside .*: GENTER_SECRET_FILE/);
    assert.throws(() => serveSetup({ ...away, env: { ...tokensEnv, GENTER_SECRET_FILE: join(home, "seal") } }), /is inside Genter's home/);
    assert.throws(() => serveSetup({ home, env: { GENTER_SECRET_FILE: join(home, "seal") } }), /is inside Genter's home/, "on loopback too");
    symlinkSync(join(home, "seal"), b.at("seal-link"));
    assert.throws(() => serveSetup({ ...away, env: { ...tokensEnv, GENTER_SECRET_FILE: b.at("seal-link") } }), /is inside Genter's home/, "a key file outside it that links into it");
    assert.throws(() => serveSetup({ ...away, env: { ...tokensEnv, GENTER_SECRET_FILE: b.at("weak") } }), /is weak/);
    assert.throws(() => serveSetup({ ...away, env: { ...tokensEnv, GENTER_SECRET_FILE: b.at("missing") } }), /cannot be read/);
    assert.deepEqual(serveSetup({ home, env: {} }).secret, undefined, "loopback without a key file: the config's secret");
    const key = readFileSync(b.at("genter_seal"), "utf8").trim();
    assert.equal(serveSetup({ ...away, env: { ...tokensEnv, GENTER_SECRET_FILE: b.at("genter_seal") } }).secret, key);

    const s = await serve(["repos", "--host", "0.0.0.0", "--port", "0"], { cwd: b.base, env: { GENTER_HOME: home, ...tokensEnv, GENTER_SECRET_FILE: b.at("genter_seal") } });
    await s.stop();
    const store = cipher(`${key}:default:local`).open(JSON.parse(readFileSync(join(home, "local.json"), "utf8")).blob);
    assert.ok(Object.keys(store.anchors).length >= 3, "the store is sealed with the key from the file");
    let config = {};
    try {
      config = JSON.parse(readFileSync(join(home, "config.json"), "utf8"));
    } catch {}
    assert.equal(config.secret, undefined, "no secret written to Genter's home");
    const refused = await serve(["repos", "--host", "0.0.0.0", "--port", "0"], { cwd: b.base, env: { GENTER_HOME: home, ...tokensEnv, GENTER_SECRET_FILE: b.at("weak") } });
    assert.equal(refused.code, 1);
    assert.match(refused.stderr(), /The seal key in .*weak is weak/);
    b.done();
  });

  it("[rl:serve/team-reads-all] it serves exactly what its command names: a folder dropped from the command line, or one added with genter add in that project, is neither found nor read, and it names each place it serves", { timeout: 60_000 }, async () => {
    const b = box();
    put(b.base, "team/deploy.md", "# Deploy\n\nWe deploy on Thursday.\n");
    put(b.base, "secret/salaries.md", "# Salaries\n\nThe salary bands are secret.\n");
    put(b.base, "hr/reviews.md", "# Reviews\n\nThe calibration of the performance reviews.\n");
    const token = hex();
    writeFileSync(b.at("tokens"), `ana ${token}\n`);
    const env = { GENTER_HOME: b.at("data"), GENTER_TOKENS_FILE: b.at("tokens") };
    const search = async (s, query) => textOf(await post(s.base, searchMsg(query), { token }));
    const both = await serve(["team", "secret", "--port", "0"], { cwd: b.base, env });
    let secretId;
    try {
      assert.match(both.stderr(), /serving team, secret at http/);
      secretId = Number(/^\[(\d+)\] Salaries/m.exec(await search(both, "salary bands"))?.[1]);
      assert.ok(secretId, "served while named");
    } finally {
      await both.stop();
    }
    // Whoever runs it adds a folder for themselves in the same project, with the same home.
    const add = await command(["add", "../hr"], { cwd: b.at("team"), env: { GENTER_HOME: b.at("data") } });
    assert.equal(add.code, 0, add.err);
    const one = await serve(["team", "--port", "0"], { cwd: b.base, env });
    try {
      assert.match(one.stderr(), /serving team at http/);
      assert.match(await search(one, "deploy"), /^\[\d+\] Deploy/m);
      for (const query of ["salary bands", "calibration of the performance reviews"]) assert.match(await search(one, query), /^Nothing in this project's 1 places matches/m, query);
      const read = textOf(await post(one.base, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "read", arguments: { ids: [secretId] } } }, { token }));
      assert.match(read, new RegExp(`^Not in this project \\(team\\): ${secretId}\\.`, "m"));
      assert.doesNotMatch(read, /salary bands/);
    } finally {
      await one.stop();
      b.done();
    }
  });

  it("[rl:serve/own-home] it keeps a store of its own: with Genter's home at the person's own ~/.genter (GENTER_HOME unset, naming it or linking to it) it does not start and writes nothing there", { timeout: 60_000 }, async () => {
    const b = box();
    setup(b.base, { filler: 0 });
    const personal = b.at("home/.genter"); // serve() runs with HOME at <dir>/home
    for (const env of [{}, { GENTER_HOME: personal }]) {
      const s = await serve(["repos", "--port", "0"], { cwd: b.base, env: { ...env, GENTER_TOKENS_FILE: b.at("genter_tokens"), GENTER_SECRET_FILE: b.at("genter_seal") } });
      assert.equal(s.code, 1, JSON.stringify(env));
      assert.match(s.stderr(), /^genter serve keeps a store of its own, apart from yours in .*\.genter: set GENTER_HOME to a folder for it, such as GENTER_HOME=~\/genter\/data/m);
      assert.ok(!existsSync(personal), "nothing written in the person's home");
    }
    mkdirSync(personal, { recursive: true });
    writeFileSync(join(personal, "local.json"), "the person's own store");
    symlinkSync(personal, b.at("alias"));
    const linked = await serve(["repos", "--port", "0"], { cwd: b.base, env: { GENTER_HOME: b.at("alias") } });
    assert.equal(linked.code, 1);
    assert.match(linked.stderr(), /keeps a store of its own/);
    assert.equal(readFileSync(join(personal, "local.json"), "utf8"), "the person's own store");
    assert.deepEqual(fs.readdirSync(personal), ["local.json"]);
    b.done();
  });

  it("[rl:serve/notes-off] the person's notes in Genter's home are neither searched nor read, and remember is off", { timeout: 60_000 }, async () => {
    const b = box();
    setup(b.base, { filler: 0 });
    const home = b.at("data");
    const person = createLocal({ home, cwd: b.at("repos") }); // the config's secret, as genter serve on loopback opens it
    person.remember("The zebra-crossing rota lives in the notes only.");
    const noteId = (await person.find("zebra-crossing rota")).results.find((r) => r.kind === "notes")?.id;
    assert.ok(noteId, "the notes answer for the person");

    const team = createLocal({ home, cwd: b.at("repos"), notes: false });
    const out = await team.find("zebra-crossing rota");
    assert.ok(!out.results.some((r) => r.kind === "notes"), JSON.stringify(out.results));
    assert.deepEqual((await team.read([noteId])).refused, [noteId]);
    assert.throws(() => team.remember("a note"), /Notes are off here/);
    assert.ok(!team.sources().some((src) => src.kind === "notes"));

    const token = hex();
    writeFileSync(b.at("tokens"), `ana ${token}\n`);
    const s = await serve(["repos", "--port", "0"], { cwd: b.base, env: { GENTER_HOME: home, GENTER_TOKENS_FILE: b.at("tokens") } });
    try {
      const text = textOf(await post(s.base, searchMsg("zebra-crossing rota"), { token }));
      assert.doesNotMatch(text, /lives in the notes only|notes\.md/);
      assert.match(text, /^Nothing in this project's 3 places matches/m);
      assert.match(textOf(await post(s.base, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "read", arguments: { ids: [noteId] } } }, { token })), /^Not in this project/m);
      assert.match(s.stderr(), /no notes/);
    } finally {
      await s.stop();
      b.done();
    }
  });

  it("[rl:serve/async-reads] [rl:contract/search-shape] a file whose read does not finish in time is left out of that search and named, and the others answer; its read is not started again while it runs, and the next search takes what it read; a file over 1 MB is not read", { timeout: 20_000 }, async () => {
    const b = box();
    put(b.base, "repo/docs/deploy.md", "# Deploy\n\nWe deploy on Thursday, after the freeze.\n");
    put(b.base, "repo/docs/stuck.md", "# Stuck\n\nThe freeze starts on Monday.\n");
    put(b.base, "repo/docs/huge.md", `# Huge\n\n${"The freeze is everywhere in this file. ".repeat(30_000)}\n`);
    const g = createLocal({ home: b.at("home"), secret: "s", cwd: b.at("repo"), readMs: 50 });
    const real = fs.open;
    const held = [];
    fs.open = (path, ...rest) => (String(path).endsWith("stuck.md") ? held.push([path, ...rest]) : real(path, ...rest)); // a read held until released
    syncBuiltinESMExports();
    let out;
    let second;
    const started = Date.now();
    try {
      out = await g.find("when is the freeze");
      second = await g.find("when is the freeze");
    } finally {
      fs.open = real;
      syncBuiltinESMExports();
    }
    assert.ok(Date.now() - started < 5000, "the searches did not wait for the stuck file");
    assert.deepEqual(out.late, ["docs/stuck.md"]);
    assert.deepEqual(out.results.map((r) => r.place.split(":")[0]), ["docs/deploy.md"], "the others answer; huge.md is over 1 MB");
    assert.match(searchText(out), /^Not read in time, so not in this answer: docs\/stuck\.md; read again at the next search\.$/m);
    assert.deepEqual(second.late, ["docs/stuck.md"], "still late while its read runs");
    assert.equal(held.length, 1, "a read under way is not started again: no second thread held by the same file");
    await new Promise((done) => {
      const [path, ...rest] = held[0];
      const cb = rest.pop();
      real(path, ...rest, (...a) => (cb(...a), setTimeout(done, 20))); // the slow read ends
    });
    const again = await g.find("when is the freeze");
    assert.equal(again.late, undefined);
    assert.ok(again.results.some((r) => r.place.startsWith("docs/stuck.md")), "read at the next search");
    b.done();
  });

  it("[rl:serve/async-reads] a replacing place whose read runs late is not read on the main thread to date its mark: the search answers at once, the mark still names it", { timeout: 20_000 }, async () => {
    const b = box();
    setup(b.base, { filler: 0 });
    const repo = b.at("repos/acme");
    const home = b.at("home");
    const warm = await createLocal({ home, secret: "s", cwd: repo }).find(QUERY); // the store knows v2 and the runbook's mark
    const v2 = warm.results.find((r) => r.place.startsWith("docs/release-process-v2.md"));
    assert.ok(v2, JSON.stringify(warm.results.map((r) => r.place)));
    const g = createLocal({ home, secret: "s", cwd: repo, readMs: 50 }); // a restart: nothing read yet in this process
    const [realOpen, realSync] = [fs.open, fs.readFileSync];
    const isV2 = (path) => String(path).endsWith("release-process-v2.md");
    let syncReads = 0;
    fs.open = (path, ...rest) => (isV2(path) ? undefined : realOpen(path, ...rest)); // v2's read never ends
    fs.readFileSync = (path, ...rest) => {
      if (isV2(path)) syncReads++;
      return realSync(path, ...rest);
    };
    syncBuiltinESMExports();
    let ticks = 0;
    const tick = setInterval(() => ticks++, 10);
    let out;
    let read;
    const started = Date.now();
    try {
      out = await g.find(QUERY);
      read = await g.read([out.results.find((r) => r.place.startsWith("docs/runbook.md")).id]);
    } finally {
      clearInterval(tick);
      [fs.open, fs.readFileSync] = [realOpen, realSync];
      syncBuiltinESMExports();
    }
    assert.ok(Date.now() - started < 2000, `the search and the read did not wait for v2 (${Date.now() - started} ms)`);
    assert.ok(ticks > 0, "the event loop kept turning");
    assert.equal(syncReads, 0, "v2 was not read on the main thread");
    assert.deepEqual(out.late, ["docs/release-process-v2.md"]);
    const runbook = out.results.find((r) => r.place.startsWith("docs/runbook.md"));
    assert.equal(runbook.superseded?.id, v2.id, "the mark still names v2");
    assert.equal(read.results[0].superseded?.id, v2.id);
    b.done();
  });

  it("[rl:serve/async-reads] tool calls run one at a time while /health answers at once; past the waiting limit a call is asked to come back (503)", async () => {
    const b = box();
    put(b.base, "repo/docs/deploy.md", "# Deploy\n\nWe deploy on Thursday.\n");
    const token = hex();
    writeFileSync(b.at("tokens"), `ana ${token}\n`);
    const g = createLocal({ home: b.at("home"), secret: "s", cwd: b.at("repo"), notes: false });
    await g.add(b.at("repo"));
    let open;
    const gate = new Promise((r) => {
      open = r;
    });
    let running = 0;
    let most = 0;
    const slow = {
      ...g,
      async find(...args) {
        running++;
        most = Math.max(most, running);
        await gate;
        try {
          return await g.find(...args);
        } finally {
          running--;
        }
      },
    };
    const s = await serveHttp(slow, { port: 0, tokens: tokensFile(b.at("tokens")), waiting: 2, log: () => {} });
    const base = s.url.replace(/\/mcp$/, "");
    try {
      const two = [post(base, searchMsg("deploy", 1), { token }), post(base, searchMsg("deploy", 2), { token })];
      await new Promise((r) => setTimeout(r, 50));
      const third = await post(base, searchMsg("deploy", 3), { token });
      assert.equal(third.status, 503);
      assert.equal(third.headers.get("retry-after"), "1");
      const health = await fetch(`${base}/health`);
      assert.equal(health.status, 200);
      assert.deepEqual(await health.json(), { status: "ok" });
      assert.equal((await post(base, { jsonrpc: "2.0", id: 4, method: "tools/list" }, { token })).status, 200, "listing waits for no search");
      open();
      for (const r of await Promise.all(two)) assert.match(textOf(r), /We deploy on Thursday/);
      assert.equal(most, 1, "one tool call at a time");
    } finally {
      await s.close();
      b.done();
    }
  });

  it("[rl:serve/async-reads] searches over files already read give the event loop its turns: a timer due at once fires before 20 of them, one after the other, end", { timeout: 60_000 }, async () => {
    const b = box();
    setup(b.base);
    const g = createLocal({ home: b.at("data"), secret: hex(), cwd: b.base, notes: false, only: true });
    await g.add(b.at("repos"));
    await g.find(QUERY); // every file is read now: no search below waits for a read
    let fired = null;
    setTimeout(() => {
      fired = performance.now();
    }, 0);
    for (let i = 0; i < 20; i++) assert.ok((await g.find(`${["billing", "rollback", "worker", "cache"][i % 4]} step ${i}`)).results.length);
    const ended = performance.now();
    assert.ok(fired !== null && fired < ended, "the timer fired while the searches ran, not after them");
    b.done();
  });

  it("[rl:security/public-only] genter serve refuses a website at a private address, saying so, and does not start", { timeout: 30_000 }, async () => {
    const b = box();
    for (const url of ["http://169.254.169.254/latest/meta-data/", "http://10.0.0.1/wiki/"]) {
      const s = await serve([url, "--port", "0"], { cwd: b.base, env: { GENTER_HOME: b.at("data") } });
      assert.equal(s.code, 1, url);
      assert.match(s.stderr(), /is not a public address: Genter reads websites at public addresses only/);
      assert.doesNotMatch(s.stderr(), /serving/);
    }
    b.done();
  });

  it("[rl:serve/image] the image runs as node on node:22-alpine with nothing installed and writes only to /data; the compose file publishes loopback only, mounts the repositories read-only, takes tokens and the seal key as secrets and keeps its root read-only", () => {
    const docker = readFileSync(join(root, "Dockerfile"), "utf8");
    assert.match(docker, /^FROM node:22-alpine$/m);
    assert.match(docker, /^USER node$/m);
    assert.match(docker, /^ENV NODE_ENV=production GENTER_HOME=\/data$/m);
    assert.match(docker, /^COPY --from=folders --chown=node:node \/out\/data \/data$/m, "/data is the user node's");
    const image = docker.slice(docker.lastIndexOf("\nFROM "));
    assert.doesNotMatch(image, /^RUN /m, "the image runs nothing while it builds");
    assert.doesNotMatch(docker, /npm (ci|install)|apk add|COPY \. /, "nothing installed, nothing but the package copied");
    assert.match(docker, /^CMD \["serve", "\/repos", "--host", "0\.0\.0\.0", "--port", "8787"\]$/m);
    assert.match(docker, /org\.opencontainers\.image\.source="https:\/\/github\.com\/Genterai\/genter"/);
    const ignore = readFileSync(join(root, ".dockerignore"), "utf8").split("\n").filter((l) => l && !l.startsWith("#"));
    assert.equal(ignore[0], "*", "only what is named goes into the image: never genter_tokens, genter_seal, .env or repos");
    for (const l of ignore.filter((x) => x.startsWith("!"))) assert.match(l, /^!(package\.json|LICENSE|README\.md|bin\/|src\/|rules\/|readers\/)$/);
    const compose = readFileSync(join(root, "docker-compose.yml"), "utf8");
    assert.match(compose, /image: ghcr\.io\/genterai\/genter:\$\{GENTER_VERSION:\?/);
    assert.match(compose, /command: serve \/repos --host 0\.0\.0\.0 --port 8787/);
    assert.match(compose, /volumes: \["\.\/repos:\/repos:ro", "genter-data:\/data"\]/);
    assert.match(compose, /ports: \["127\.0\.0\.1:8787:8787"\]/);
    assert.match(compose, /GENTER_TOKENS_FILE: \/run\/secrets\/genter_tokens/);
    assert.match(compose, /GENTER_SECRET_FILE: \/run\/secrets\/genter_seal/);
    assert.match(compose, /secrets: \[genter_tokens, genter_seal\]/);
    assert.match(compose, /read_only: true/);
    assert.match(compose, /cap_drop: \[ALL\]/);
    assert.match(compose, /profiles: \[meaning\]/);
    assert.match(compose, /GENTER_EMBED_URL: \$\{GENTER_EMBED_URL:-\}/);
    const release = readFileSync(join(root, ".github/workflows/release.yml"), "utf8");
    const job = release.slice(release.indexOf("\n  image:"));
    assert.match(job, /needs: release\n {4}if: needs\.release\.outputs\.released == 'true'/, "only once the release job released the version");
    assert.match(job, /permissions:\n {6}contents: read\n {6}packages: write/);
    assert.match(job, /docker login ghcr\.io -u "\$\{\{ github\.actor \}\}" --password-stdin\n {8}env:\n {10}GH_TOKEN: \$\{\{ github\.token \}\}/, "the run's own token");
    assert.match(job, /--tag "ghcr\.io\/genterai\/genter:\$v" --tag ghcr\.io\/genterai\/genter:latest --push \./);
    assert.match(release, /released: \$\{\{ steps\.version\.outputs\.npm == 'true' \|\| steps\.version\.outputs\.tag == 'true' \}\}/);
    const ignored = readFileSync(join(root, ".gitignore"), "utf8");
    for (const f of ["/repos/", "/genter_tokens", "/genter_seal", "/.env"]) assert.ok(ignored.split("\n").includes(f), `${f} stays out of git`);
  });

  it("[rl:serve/team-reads-all] docs/team.md says every token holder reads everything served and to serve only what the whole team may read, names the clients that can connect and that claude.ai cannot; the README points to it", () => {
    const team = readFileSync(join(root, "docs/team.md"), "utf8");
    const said = team.replace(/\s+/g, " ");
    assert.match(said, /Every token holder reads every folder it serves/);
    assert.match(said, /serve only what the whole team may read/);
    assert.match(said, /claude\.ai, the Claude apps' connectors and ChatGPT cannot connect yet/);
    for (const client of ["Claude Code", "Cursor", "VS Code", "Codex", "Gemini CLI"]) assert.ok(team.includes(client), client);
    assert.match(team, /--header "Authorization: Bearer/);
    const readme = readFileSync(join(root, "README.md"), "utf8");
    assert.match(readme, /^## For a small team$/m);
    assert.match(readme, /\(docs\/team\.md\)/);
  });

  it("[rl:cli/no-packages] [rl:serve/loopback-default] genter serve needs a folder, and its --host and --port mean nothing to the other commands", { timeout: 30_000 }, async () => {
    const b = box();
    const run = (args) =>
      new Promise((done) => {
        const child = spawn(process.execPath, [bin, ...args], { cwd: b.base, env: { PATH: process.env.PATH, HOME: b.base, GENTER_HOME: b.at("data") } });
        let err = "";
        child.stderr.on("data", (d) => {
          err += d;
        });
        child.on("close", (code) => done({ code, err }));
      });
    const none = await run(["serve"]);
    assert.equal(none.code, 1);
    assert.match(none.err, /genter serve <folder\|url> \.\.\.: the folders to serve/);
    for (const flag of ["--host", "--port"]) {
      const other = await run(["ask", "deploy", flag, "1"]);
      assert.equal(other.code, 1);
      assert.match(other.err, new RegExp(`^${flag} is for genter serve`));
    }
    const help = await run(["help"]);
    assert.equal(help.code, 0);
    b.done();
  });
});

// handle() with the serve options answers as genter serve does, without a server.
describe("genter serve's handle", () => {
  it("[rl:serve/read-only] tools/call names only search and read; tools/list gives them as genter mcp does", async () => {
    const b = box();
    put(b.base, "repo/docs/deploy.md", "# Deploy\n\nWe deploy on Thursday.\n");
    const g = createLocal({ home: b.at("home"), secret: "s", cwd: b.at("repo"), notes: false });
    const { twoTools, serveInstructions } = await import("../src/mcp-server.js");
    const opts = { tools: twoTools, about: serveInstructions };
    const list = await handle(g, { jsonrpc: "2.0", id: 1, method: "tools/list" }, opts);
    assert.deepEqual(list.result.tools, mcpTools.slice(0, 2));
    const add = await handle(g, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "genter_add", arguments: { source: b.at("repo") } } }, opts);
    assert.equal(add.error.code, -32602);
    assert.deepEqual(g.sources(), [], "nothing was added");
    b.done();
  });
});
