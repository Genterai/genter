// The smoke test of `genter serve` as a small team runs it, against any running server: `node bin/genter.js serve`
// (test/serve.test.js) or the image started by docker-compose.yml (the serve job of .github/workflows/test.yml).
//
//   node test/serve-smoke.mjs setup <dir>                      repos/acme, genter_tokens and genter_seal in <dir>
//   node test/serve-smoke.mjs check <http://host:port> <tokens file> [repos folder]
//
// check: /health with no token, 401 with none and with a wrong one, genter-cli/conformance over HTTP with a token,
// search and read, nothing a client can add or keep, /health while 20 searches run, and the served folder unchanged.
import { randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { conformance } from "../src/conformance.js";

export const QUERY = "can we deploy on Friday?";
const NOTICE = "> **Deprecated:** replaced by [Release process v2](release-process-v2.md)";

// A team's folder of repositories: acme, whose runbook says at its top that v2 replaced it, and enough other documents
// that 20 searches take a while. Returns the tokens it wrote.
export function setup(dir, { filler = 400 } = {}) {
  const put = (path, text) => {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
  put("repos/acme/.git/HEAD", "ref: refs/heads/main\n");
  put("repos/acme/docs/runbook.md", `${NOTICE}\n\n# Release process\n\n## Friday\n\nDeploys go out on Fridays from the release branch.\n`);
  put("repos/acme/docs/release-process-v2.md", "# Release process v2\n\nDate: 2026-10-03\n\n## Friday\n\nNo deploys on Fridays since October 3: deploy on Thursday.\n");
  put("repos/acme/docs/oncall.md", "# On-call\n\nPage the on-call engineer in #oncall.\n");
  put("repos/beta/.git/HEAD", "ref: refs/heads/main\n");
  const words = ["queue", "billing", "invoice", "cache", "index", "release", "rollback", "schema", "worker", "token", "region", "backup"];
  for (let i = 0; i < filler; i++) {
    const w = (k) => words[(i * 7 + k) % words.length];
    const body = Array.from({ length: 40 }, (_, k) => `The ${w(k)} service keeps its ${w(k + 3)} in step ${i}.${k}, checked by the ${w(k + 5)} job.`).join("\n");
    put(`repos/beta/docs/note-${String(i).padStart(4, "0")}.md`, `# Note ${i}: ${w(0)} and ${w(1)}\n\n## ${w(2)}\n\n${body}\n`);
  }
  // Files written at different moments, so the folder is no fresh clone and file dates show.
  const day = Date.parse("2026-10-03T12:00:00Z") / 1000;
  utimesSync(join(dir, "repos/acme/docs/release-process-v2.md"), day, day);
  utimesSync(join(dir, "repos/acme/docs/runbook.md"), day - 86400 * 200, day - 86400 * 200);
  const tokens = { ana: randomBytes(32).toString("hex"), bo: randomBytes(32).toString("hex") };
  writeFileSync(join(dir, "genter_tokens"), `# name token, one line per person\n${Object.entries(tokens).map(([name, token]) => `${name} ${token}`).join("\n")}\n`, { mode: 0o600 });
  writeFileSync(join(dir, "genter_seal"), `${randomBytes(32).toString("base64")}\n`, { mode: 0o600 });
  return { tokens, repos: join(dir, "repos") };
}

// The first token of a tokens file.
export const tokenOf = (file) =>
  readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim().split(/\s+/))
    .find((w) => w.length === 2 && !w[0].startsWith("#"))?.[1];

// One JSON-RPC message to <base>/mcp: { status, headers, body } (body null for 202).
export async function post(base, message, { token, headers = {} } = {}) {
  const res = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(token && { Authorization: `Bearer ${token}` }), ...headers },
    body: typeof message === "string" ? message : JSON.stringify(message),
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
}
// send(request) for genter-cli/conformance: the JSON-RPC response, over HTTP with a token.
export const sender = (base, token) => async (req) => (await post(base, req, { token })).body;

// Every file of a folder with its size and time: what "read-only" is checked against.
export function listing(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, e.name);
      if (e.isDirectory()) walk(full);
      else {
        const st = statSync(full);
        out.push(`${relative(dir, full)} ${st.size} ${st.mtimeMs}`);
      }
    }
  };
  walk(dir);
  return out.sort().join("\n");
}

export async function waitForHealth(base, ms = 60_000) {
  const until = Date.now() + ms;
  for (;;) {
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) return await res.json();
    } catch {}
    if (Date.now() > until) throw new Error(`${base}/health did not answer in ${ms / 1000} s`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

const textOf = (res) => (res?.body?.result?.content ?? []).map((c) => c.text).join("\n");

// Runs every check against a server: [{ name, ok, detail? }].
export async function check(base, { token, repos } = {}) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), ...(!ok && detail !== undefined && { detail: String(detail).slice(0, 2000) }) });
  const before = repos ? listing(repos) : null;

  const health = await waitForHealth(base);
  add("/health answers with no token", health?.status === "ok", JSON.stringify(health));

  const list = { jsonrpc: "2.0", id: 1, method: "tools/list" };
  const none = await post(base, list);
  add("no token: 401, WWW-Authenticate Bearer, nothing listed", none.status === 401 && /^Bearer/.test(none.headers.get("www-authenticate") ?? "") && !none.body?.result, `${none.status} ${JSON.stringify(none.body)}`);
  const wrong = await post(base, list, { token: randomBytes(32).toString("hex") });
  add("a token that is not listed: 401", wrong.status === 401 && !wrong.body?.result, `${wrong.status} ${JSON.stringify(wrong.body)}`);

  const report = await conformance(sender(base, token), { query: QUERY, mark: true });
  add("genter-cli/conformance passes over HTTP", report.ok, JSON.stringify(report.checks.filter((c) => !c.ok)));

  const tools = await post(base, list, { token });
  add("tools/list is search and read, nothing else", JSON.stringify(tools.body?.result?.tools?.map((t) => t.name)) === '["search","read"]', JSON.stringify(tools.body));

  const found = await post(base, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "search", arguments: { query: QUERY } } }, { token });
  const text = textOf(found);
  const v2 = /^\[(\d+)\] Release process v2/m.exec(text)?.[1];
  const mark = /^ {2}⚠ superseded by \[(\d+)\] on 2026-10-03: “Deprecated: replaced by Release process v2”$/m.exec(text)?.[1];
  const first = text.search(/^\[\d+\] Release process v2/m);
  add("search: v2 first, the runbook after it marked superseded by v2's id", found.status === 200 && v2 && mark === v2 && first >= 0 && first < text.search(/^\[\d+\] Release process ›/m), text);
  const read = await post(base, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "read", arguments: { ids: [Number(v2)] } } }, { token });
  add("read: v2 by its id, read now", read.status === 200 && textOf(read).includes(`[${v2}] Release process v2 · read now`) && textOf(read).includes("deploy on Thursday"), textOf(read));

  for (const [name, args] of [
    ["genter_add", { source: "http://169.254.169.254/latest/meta-data/" }],
    ["genter_remember", { text: "a note a client tries to keep" }],
  ]) {
    const res = await post(base, { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name, arguments: args } }, { token });
    add(`${name}: no such tool here (-32602)`, res.body?.error?.code === -32602, JSON.stringify(res.body));
  }

  // 20 searches at once, then /health: it answers while they run, one at a time, and every search answers.
  const started = Date.now();
  let lastSearch = 0;
  const searches = Array.from({ length: 20 }, (_, i) =>
    post(base, { jsonrpc: "2.0", id: 100 + i, method: "tools/call", params: { name: "search", arguments: { query: `${["billing", "rollback", "worker", "cache"][i % 4]} step ${i}` } } }, { token }).then((r) => {
      lastSearch = Date.now();
      return r;
    }),
  );
  await new Promise((r) => setTimeout(r, 20));
  const asked = Date.now();
  const healthy = await fetch(`${base}/health`).then((r) => r.status);
  const answeredIn = Date.now() - asked;
  const healthAt = Date.now();
  const all = await Promise.all(searches);
  const failed = all.filter((r) => r.status !== 200 || r.body?.result?.isError || !/^\[\d+\] /m.test(textOf(r)));
  add("20 searches at once all answer", !failed.length, JSON.stringify(failed.map((r) => [r.status, r.body]).slice(0, 2)));
  add(`/health answers while 20 searches run (in ${answeredIn} ms; the searches took ${lastSearch - started} ms)`, healthy === 200 && healthAt < lastSearch && answeredIn < 1000, `health ${healthy} after ${answeredIn} ms, at +${healthAt - started} ms; last search at +${lastSearch - started} ms`);

  if (repos) add("the served folders are unchanged", listing(repos) === before, "a file was written, changed or removed under the served folder");
  return checks;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [what, a, b, c] = process.argv.slice(2);
  if (what === "setup" && a) {
    setup(a);
    console.log(`genter smoke: ${join(a, "repos")}, ${join(a, "genter_tokens")}, ${join(a, "genter_seal")}`);
  } else if (what === "check" && a && b) {
    const checks = await check(a.replace(/\/+$/, ""), { token: tokenOf(b), repos: c });
    for (const x of checks) console.log(`${x.ok ? "ok  " : "FAIL"} ${x.name}${x.ok ? "" : `\n     ${x.detail}`}`);
    const failed = checks.filter((x) => !x.ok).length;
    console.log(`genter smoke: ${checks.length - failed} of ${checks.length} passed`);
    process.exitCode = failed ? 1 : 0;
  } else {
    console.error("node test/serve-smoke.mjs setup <dir> | check <http://host:port> <tokens file> [repos folder]");
    process.exitCode = 2;
  }
}
