import { createHash, timingSafeEqual } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { genterHome, realOf, under } from "./local.js";
import { handle, serveInstructions, twoTools, VERSIONS } from "./mcp-server.js";

// `genter serve`: the local engine for a small team, over MCP Streamable HTTP, with no package (node:http). The same
// two tools as `genter mcp`, answered by the same handle(), so the same text and the same conformance; nothing else is
// listed or run, so no client can add a source, keep a note or make the server fetch an address it names.
// One token per person, in a file whoever runs it keeps (GENTER_TOKENS_FILE, "name token" a line), read again when it
// changes, so removing a line revokes that token at the next request. Every token holder reads everything served: there
// are no per-person rules here (they come with the full server), so serve only what the whole team may read.
// It listens on 127.0.0.1 unless --host says otherwise, and away from loopback only with tokens and a seal key kept
// outside its data (GENTER_SECRET_FILE). It speaks plain HTTP: TLS sits in front of it, in a reverse proxy.
// Tool calls run one at a time (the store is one file, as over stdio); the files' text is read off the main thread, so
// /health and every refusal answer at once while searches run.

export const SERVE = { host: "127.0.0.1", port: 8787, bodyBytes: 1_000_000, keyChars: 32, keyKinds: 10, waiting: 64 };

// A host name or address on this computer only: localhost, 127.0.0.0/8, ::1 (and 127.x written in IPv6).
export function isLoopback(host) {
  const h = String(host ?? "").toLowerCase().replace(/^\[|\]$/g, "");
  return h === "localhost" || h === "::1" || /^(::ffff:)?127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h);
}
const hostOf = (value) => {
  try {
    return new URL(`http://${value}`).hostname;
  } catch {
    return "";
  }
};
const originHost = (value) => {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
};

// A key or token hard to guess: 32 characters or more, of 10 kinds or more (`openssl rand -hex 32` gives 64 of
// 16, `openssl rand -base64 32` 44 of about 30).
const strong = (text) => text.length >= SERVE.keyChars && new Set(text).size >= SERVE.keyKinds;
const digest = (text) => createHash("sha256").update(text).digest();

// The tokens of a tokens file: { tokens: [{ name, digest }], problems }. A line is "name token"; empty lines and lines
// starting with # are skipped. A line that is not two words, a weak token, or one already on an earlier line is not
// used, and its problem names the line and the name, never the token.
export function parseTokens(text) {
  const tokens = [];
  const problems = [];
  const seen = new Set();
  for (const [i, raw] of String(text ?? "").split("\n").entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const words = line.split(/\s+/);
    const [name, token] = words;
    const d = words.length === 2 && digest(token);
    if (words.length !== 2) problems.push(`line ${i + 1} is not "name token": not used`);
    else if (!strong(token)) problems.push(`line ${i + 1} (${name}): a token is ${SERVE.keyChars} characters or more of ${SERVE.keyKinds} kinds or more (openssl rand -hex 32): not used`);
    else if (seen.has(d.toString("hex"))) problems.push(`line ${i + 1} (${name}): the same token as an earlier line: not used`);
    else {
      seen.add(d.toString("hex"));
      tokens.push({ name, digest: d });
    }
  }
  return { tokens, problems };
}

// The tokens file, read again whenever it changes (its inode, size or times), so a line removed revokes its token at
// the next request. A file that cannot be read holds no token: every request is refused until it can. { file, count,
// unreadable, who(authorization) }: who gives the name of the token holder, or null, comparing in constant time;
// unreadable says why the file cannot be read, when it cannot.
export function tokensFile(file, { log = () => {} } = {}) {
  let seen = null;
  let list = [];
  let unreadable = null;
  const cannot = (key, error) => {
    const why = `${file} cannot be read by this user${process.getuid ? ` (uid ${process.getuid()})` : ""}: ${error.code ?? error.message}`;
    if (seen !== null && seen !== key) log(`genter: ${why}; every request is refused until it can`); // at start, serveSetup says it
    seen = key;
    list = [];
    unreadable = why;
  };
  const load = () => {
    let st;
    try {
      st = statSync(file);
    } catch (error) {
      return cannot("gone", error);
    }
    const key = `${st.ino}:${st.size}:${st.mtimeMs}:${st.ctimeMs}`;
    if (key === seen) return;
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch (error) {
      return cannot(key, error);
    }
    const first = seen === null;
    seen = key;
    unreadable = null;
    const { tokens, problems } = parseTokens(text);
    list = tokens;
    for (const p of problems) log(`genter: ${file}: ${p}`);
    if (!first) log(`genter: ${file} read again: ${tokens.length} ${tokens.length === 1 ? "token" : "tokens"}`);
  };
  return {
    file,
    get count() {
      load();
      return list.length;
    },
    get unreadable() {
      load();
      return unreadable;
    },
    who(authorization) {
      load();
      const m = /^Bearer[ \t]+(\S+)[ \t]*$/i.exec(authorization ?? "");
      if (!m) return null;
      const d = digest(m[1]);
      let name = null;
      for (const t of list) if (timingSafeEqual(d, t.digest) && name === null) name = t.name; // every token compared
      return name;
    },
  };
}

// What genter serve needs before it reads anything, or the reason it does not start: { host, port, loopback, tokens,
// secret? }. secret: the seal key from GENTER_SECRET_FILE; none on loopback without it (the config's secret then).
// Its home is its own, never the person's ~/.genter: a team's server does not open, seal again or share their store.
export function serveSetup({ env = process.env, home = genterHome(), host = SERVE.host, port = SERVE.port, log = () => {} } = {}) {
  if (!host || typeof host !== "string") throw new Error("--host takes an address: 127.0.0.1 (the default), or 0.0.0.0 to listen on every network");
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`--port takes a port number (${SERVE.port} by default)`);
  if (realOf(resolve(home)) === realOf(join(homedir(), ".genter"))) throw new Error(`genter serve keeps a store of its own, apart from yours in ${home}: set GENTER_HOME to a folder for it, such as GENTER_HOME=~/genter/data (docs/team.md)`);
  const loopback = isLoopback(host);
  let tokens = null;
  if (env.GENTER_TOKENS_FILE) {
    tokens = tokensFile(resolve(env.GENTER_TOKENS_FILE), { log });
    if (tokens.unreadable) throw new Error(`GENTER_TOKENS_FILE ${tokens.unreadable}`);
    if (!tokens.count) throw new Error(`No token in ${env.GENTER_TOKENS_FILE}: write one line per person, "name token" (make a token with openssl rand -hex 32)`);
  } else if (!loopback) throw new Error(`genter serve --host ${host} leaves this computer, so it needs one token per person: GENTER_TOKENS_FILE, a file of "name token" lines (docs/team.md)`);
  return { host, port, loopback, tokens, ...sealKey({ file: env.GENTER_SECRET_FILE, home, loopback, host }) };
}

// The seal key of the store, from a file outside Genter's home (the data volume), so a copy of the store opens with
// nothing that is beside it. Away from loopback it is needed; a key file named is used only when strong.
function sealKey({ file, home, loopback, host }) {
  if (!file) {
    if (loopback) return {};
    throw new Error(`genter serve --host ${host} needs the seal key of its store in a file outside ${home}: GENTER_SECRET_FILE (make one with openssl rand -base64 32)`);
  }
  if (under(realOf(resolve(file)), [realOf(resolve(home))])) throw new Error(`GENTER_SECRET_FILE ${file} is inside Genter's home ${home}: keep the seal key outside it (the data volume), so a copy of the store does not carry its key`);
  let key;
  try {
    key = readFileSync(file, "utf8").trim();
  } catch (error) {
    throw new Error(`GENTER_SECRET_FILE ${file} cannot be read by this user${process.getuid ? ` (uid ${process.getuid()})` : ""}: ${error.code ?? error.message}`);
  }
  if (!strong(key)) throw new Error(`The seal key in ${file} is weak: ${SERVE.keyChars} characters or more of ${SERVE.keyKinds} kinds or more (openssl rand -base64 32 > ${file})`);
  return { secret: key };
}

// Serves the engine at http://host:port/mcp until close(): { server, url, close(), closed }. Without tokens it answers
// only on loopback, and only to requests sent to a loopback name (a web page's DNS rebinding is refused); a request
// that carries an Origin from anywhere but loopback is refused too (a web page has no business here).
export function serveHttp(local, { host = SERVE.host, port = SERVE.port, tokens = null, version, waiting = SERVE.waiting, log = console.error } = {}) {
  if (!tokens && !isLoopback(host)) throw new Error(`genter serve --host ${host} needs tokens (GENTER_TOKENS_FILE)`);
  const options = { version, tools: twoTools, about: serveInstructions };
  // One tool call at a time, in the order they came; at most `waiting` wait, the rest are asked to come back.
  let tail = Promise.resolve();
  let queued = 0;
  const inTurn = (fn) => {
    queued++;
    const p = tail.then(fn).finally(() => queued--);
    tail = p.catch(() => {});
    return p;
  };
  // A message with a method and no id is a notification, and a client's answer to a request (this server sends none) is
  // taken too: neither runs anything nor gets a reply.
  const notice = (msg) => msg.jsonrpc === "2.0" && (typeof msg.method === "string" ? msg.id === undefined || msg.id === null : msg.method === undefined && ("result" in msg || "error" in msg));
  const answer = (msg) => (notice(msg) ? null : msg.method === "tools/call" ? inTurn(() => handle(local, msg, options)) : handle(local, msg, options));

  const server = createServer(async (req, res) => {
    try {
      await route(req, res);
    } catch (error) {
      if (!res.headersSent) rpcError(req, res, 500, `genter: ${error.message}`);
      else res.end();
    }
  });
  async function route(req, res) {
    const path = (req.url ?? "/").split("?")[0];
    if (path === "/health") {
      if (req.method !== "GET" && req.method !== "HEAD") return send(req, res, 405, { error: "GET /health" }, { Allow: "GET, HEAD" });
      return send(req, res, 200, { status: "ok" });
    }
    if (path !== "/mcp") return send(req, res, 404, { error: "Genter answers MCP at /mcp" });
    const origin = req.headers.origin;
    if (origin !== undefined && !isLoopback(originHost(origin))) return rpcError(req, res, 403, "A request from a web page is refused: Genter answers MCP clients");
    if (!tokens && !isLoopback(hostOf(req.headers.host))) return rpcError(req, res, 403, "With no tokens, Genter answers only requests sent to this computer's own address");
    if (tokens && !tokens.who(req.headers.authorization)) return rpcError(req, res, 401, "A token is needed: Authorization: Bearer <your token>", { "WWW-Authenticate": 'Bearer realm="genter"' });
    if (req.method !== "POST") return rpcError(req, res, 405, "POST a JSON-RPC message to /mcp (this server opens no stream and keeps no session)", { Allow: "POST" });
    if (!/^application\/json\b/i.test(req.headers["content-type"] ?? "")) return rpcError(req, res, 415, "Content-Type: application/json");
    const asked = req.headers["mcp-protocol-version"];
    if (asked !== undefined && !VERSIONS.includes(asked)) return rpcError(req, res, 400, `MCP-Protocol-Version ${asked} is not supported: ${VERSIONS.join(", ")}`);
    let body;
    try {
      body = await bodyOf(req, SERVE.bodyBytes);
    } catch (error) {
      return rpcError(req, res, error.status ?? 400, error.message, error.status === 413 ? { Connection: "close" } : {});
    }
    let msg;
    try {
      msg = JSON.parse(body);
    } catch {
      return send(req, res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    }
    const batch = Array.isArray(msg);
    const messages = batch ? msg : [msg];
    // Each message is a JSON-RPC object: an empty batch, null, a number or a list inside is not.
    if (!messages.length || messages.some((m) => !m || typeof m !== "object" || Array.isArray(m))) return send(req, res, 400, { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } });
    const calls = messages.filter((m) => m.method === "tools/call" && !notice(m)).length;
    if (calls && queued + calls > waiting) return rpcError(req, res, 503, `${queued} searches are waiting: ask again in a moment`, { "Retry-After": "1" });
    const answers = (await Promise.all(messages.map(answer))).filter(Boolean);
    if (!answers.length) {
      res.writeHead(202, { "Content-Length": 0 });
      return res.end();
    }
    return send(req, res, 200, batch ? answers : answers[0]);
  }

  return new Promise((ready, fail) => {
    server.once("error", fail);
    server.listen(port, host, () => {
      server.off("error", fail);
      const at = server.address();
      const url = `http://${at.family === "IPv6" ? `[${at.address}]` : at.address}:${at.port}/mcp`;
      let done;
      const closed = new Promise((r) => {
        done = r;
      });
      server.on("close", () => done());
      const close = () => {
        server.close();
        server.closeAllConnections?.();
        return closed;
      };
      const places = local.sources().map((src) => src.place);
      const said = [`genter: serving ${places.length ? places.join(", ") : local.project().place} at ${url} (MCP over Streamable HTTP): search and read only, nothing written, no notes`];
      if (tokens) said.push(`genter: ${tokens.count} ${tokens.count === 1 ? "token" : "tokens"} in ${tokens.file}, read again when it changes: every token holder reads everything served here, so serve only what the whole team may read`);
      else said.push("genter: no tokens (GENTER_TOKENS_FILE): anyone on this computer can read what is served here; it answers only on loopback");
      if (!isLoopback(host)) said.push("genter: plain HTTP: put TLS in front of it (a reverse proxy such as Caddy or nginx) before anyone reaches it over a network");
      log(said.join("\n")); // one write, so whoever waits for the address reads the rest with it
      ready({ server, url, close, closed });
    });
  });
}

// The body of a request, as text, up to max bytes; past that, an error with status 413.
function bodyOf(req, max) {
  return new Promise((done, fail) => {
    const tooBig = () => Object.assign(new Error(`The request is over ${max} bytes`), { status: 413 });
    if (Number(req.headers["content-length"]) > max) {
      req.resume();
      return fail(tooBig());
    }
    const chunks = [];
    let size = 0;
    let over = false;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > max && !over) {
        over = true;
        fail(tooBig());
      }
      if (!over) chunks.push(chunk);
    });
    req.on("end", () => !over && done(Buffer.concat(chunks).toString("utf8")));
    req.on("error", fail);
  });
}

function send(req, res, status, body, headers = {}) {
  const text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers });
  res.end(req.method === "HEAD" ? undefined : text);
}
// A refusal at /mcp, as a JSON-RPC error with no id (the shape MCP's own servers give one).
const rpcError = (req, res, status, message, headers) => send(req, res, status, { jsonrpc: "2.0", id: null, error: { code: -32000, message } }, headers);
