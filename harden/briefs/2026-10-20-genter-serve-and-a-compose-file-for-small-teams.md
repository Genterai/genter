# genter serve and a compose file for small teams

Status: shipped
Request: the product owner (dan), 2026-10-20, accepting Genter's open-source plan: "по всему что предлагаешь" (on
everything you propose). This is step 3.3 of that plan, with its section "one story at three sizes" and its table of
the hard constraints in every form: `genter serve` serves the local engine over MCP Streamable HTTP for a small team,
one revocable token per person, loopback unless `--host` (refused there without tokens), the repositories read-only,
notes and `remember` off, the seal key outside the data volume, async reads with a size-and-time skip, an image the
release job publishes to GHCR, a compose file, docs that name the clients that can connect (CLI and IDE, not claude.ai
until it has OAuth), and a CI compose smoke test. No version bump.

Intent: a small team runs Genter on a server it owns, over the repositories it cloned there, and each member's CLI or
IDE client reaches it at one URL with their own token — success: `docker compose up` with `docker-compose.yml` and the
image built from the `Dockerfile`, then a client with a token searches "can we deploy on Friday?" and gets v2 first and
the runbook marked `⚠ superseded by [<v2's id>] on 2026-10-03: “…”`, reads v2 by that id, and `genter-cli/conformance`
passes over HTTP; with no token, or a token whose line was removed, it gets 401 and nothing; `/health` answers while
20 searches run; `genter serve http://169.254.169.254/` refuses the address and does not start.
Searched: `npx -y genter-cli@0.3 ask "how does the MCP server answer, one message at a time, and what seals the
store?"` from the worktree answers `sh: 1: genter: not found` (inside its own repository npx resolves to this package,
which has no `genter` bin there), so the questions were asked with this worktree's engine (`node bin/genter.js ask`,
its own `GENTER_HOME`): "how does the MCP server answer, one message at a time, and what seals the store?"
(`src/mcp-server.js` `serveMcp`: "One at a time, answers in the order of the questions: the store is one file";
`harden/redlines/contract.md` [two-tools], [place-ids]); "where do websites get refused at private addresses, and which
tools could make the engine fetch a URL?" (`harden/redlines/security.md` [public-only], [checked-address];
`test/web.test.js` W4; `SECURITY.md` "Websites. Public addresses only"); "notes file remember every project, GENTER_HOME
config secret written first run" (`README.md` Commands, `harden/redlines/local-search.md` [project-scope],
[notes-are-the-persons]). Then the MCP specification's Streamable HTTP transport (POST per message, 202 for
notifications, 405 for GET when no stream is offered, the `MCP-Protocol-Version` header, Origin validation against DNS
rebinding) and Docker Compose's file secrets, tried here with Docker 29.8 and Compose 5.6: a file secret is a bind
mount of the host file, its long-syntax `uid`, `gid` and `mode` are not applied, so the file must be readable by the
container's user (uid 1000), and an in-place write is seen inside while a file saved in its place is not.
Sources: `src/mcp-server.js` (`handle`, `callTool`, `mcpTools`, `searchText`, `serveMcp`), `src/local.js`
(`createLocal`, `readFile`, `readFiles`, `find`, `remember`, `readWhole`, `ours`, `ensureNotes`, `localSecret`, `LIMITS`,
`findText`, `realOf`, `under`), `src/conformance.js`, `src/web.js` (`crawl`), `src/net.js` (`assertPublic`),
`src/seal.js`, `bin/local.js` (`parse`, `projectFolder`, the `mcp` command), `bin/genter.js`,
`.github/workflows/{release,test}.yml`, `package.json` (`files`, zero dependencies), `README.md`, `SECURITY.md`,
`harden/redlines/{cli,contract,local-search,security}.md`, `test/{contract,local,mcp-server}.test.js`; Genter's
open-source plan, step 3.3, decision D3 (two tools everywhere) and D5 (nothing sends data, `serve` included).
Red lines: a new area, serve: tokens, loopback-default, team-reads-all, same-contract, read-only, notes-off, own-home,
seal-outside, async-reads, health, image, ac-compose. Changed: cli/no-packages (`serve`, its flags refused elsewhere),
contract/two-tools (names the forms), contract/search-shape (the files not read in time), contract/conformance (also
over HTTP), security/public-only (a site whose address is not public is refused saying so, before any fetch). Stay
true: contract/place-ids, read-whole, read-scope, marks; local-search/reads-again, gone-not-answer, project-scope,
private-key-skipped, no-text-stored, ids-stable; cli/local-mcp, local-mcp-tools, local-mcp-stdout, help, cloud-own-server;
security/checked-address, keys-stay, never-run (node's `http` and `crypto` run nothing); zero runtime dependencies.
Decided:
* `genter serve <folder|url> ...` (`src/http.js`, on `node:http` alone) adds what it is given, as `genter mcp` does,
  and serves exactly that: `createLocal({ only: true })` reads the sources added through it alone, so a folder dropped
  from the command, one added with `genter add` in the same project and a website kept from 0.3 are neither searched
  nor read, and it names each place it serves when it starts (a review found the project's other sources served). It
  then serves `POST /mcp` with the same `handle()` as the stdio server, given the contract's two tools alone and its own
  instructions ("the folders this server reads for the team … nothing is added or kept through it"). The tool
  definitions are `genter mcp`'s own, unchanged, so a client sees the same contract; every other name, the 0.3 aliases
  included, is -32602, so no client can add a source, keep a note or make the server fetch an address (the SSRF a
  team server would otherwise carry). JSON answers only, no stream and no session: GET and DELETE are 405, a
  notification 202, a batch answers as a batch, a body over 1 MB 413. A notification runs nothing, a `tools/call` too,
  and a body that is no JSON-RPC object (`null`, `[null]`, a number) is 400 and -32600. (plan step 3.3, D3)
* Tokens: `GENTER_TOKENS_FILE`, one `name token` line per person, `#` comments. A token is 32 characters or more of 10
  kinds or more (`openssl rand -hex 32`); a weak, malformed or repeated line is not used and is named by its line and
  name, never its token. Compared in constant time: the presented token's SHA-256 against each listed one's with
  `timingSafeEqual`, every one compared. The file is stat'ed at each request and read again when its inode, size or
  times change, so removing a line revokes at the next request; a file that cannot be read holds no token (fail
  closed). It does not start with a tokens file that holds none or cannot be read, and it says why (the uid that
  cannot read it). (plan step 3.3)
* Where it listens: `127.0.0.1:8787` by default. Away from loopback (anything but `localhost`, `127.0.0.0/8`, `::1`)
  only with tokens and a seal key file, saying that it speaks plain HTTP and TLS must sit in front. On loopback
  without tokens it starts (one person trying it), says anyone on the computer can read what it serves, and answers
  only a loopback `Host`, against DNS rebinding. A request with an `Origin` that is not loopback is refused (403) in
  every case, as the MCP specification asks of servers: web pages have no business here. (plan step 3.3; MCP
  Streamable HTTP's security warning)
* Its own home: `genter serve` does not start with Genter's home at the person's own `~/.genter` (`GENTER_HOME` unset,
  naming it or linking to it), before it reads or writes anything, and says to set `GENTER_HOME` to a folder for it;
  `docs/team.md`'s recipe without Docker sets `GENTER_HOME=~/genter/data`. Otherwise a team's server would open the
  person's store (refusing to start once it is sealed with their secret), seal it again with the team's key (their own
  `genter` could no longer open it), or, on loopback without a key file, serve their project's sources. Refusing is the
  reversible choice; a default folder of its own is for the product owner if it is wanted. (a review of this step)
* The seal key: `GENTER_SECRET_FILE`, 32 characters or more of 10 kinds or more, refused when it lies inside
  `GENTER_HOME` (as written or where its links lead), so a copy of the data volume opens nothing; needed away from
  loopback; on loopback without it, the config's secret, as for `genter mcp`. With the key file the config keeps no
  secret. (plan step 3.3, the hard-constraints table: "the seal key off the data volume")
* Notes off: `createLocal({ notes: false })` leaves the notes source out of what the project searches and reads and
  makes `remember` throw; serve always passes it. (plan step 3.3)
* Reads that do not block, in every form: a file's text is read off the main thread (one `open`, one `read` of the
  size its stat gave, one `close`, on node's thread pool), `LIMITS.readers` (8) at a time, and each read races
  `readMs` (2 s): one that takes longer (a synced folder that downloads on read, a slow disk) is left out of that
  search and named before the places ("Not read in time, so not in this answer: …; read again at the next search."),
  its anchor untouched; the late read is not started again while it runs (it holds one of node's four threads), and
  what it read once it ends is what the next search takes; one over 1 MB is not read, as before. Nothing reads a
  file's text on the main thread any more: a replaced place's mark dates what replaces it from the text read in time
  (search has just looked at it; read looks at it within `readMs`), else from its file's time, where it used to read
  that file synchronously. The stat and the folder's listing stay synchronous: quick metadata calls (3 ms for 3,000
  files here) on a disk that answers, so docs/team.md says not to serve a network mount that can hang. The store changes only after the reads, in listing order and with nothing awaited, so
  places are numbered as before (contract/place-ids). The cost, measured here on a 3,000-file folder: a fresh
  `genter ask` takes 1.43–1.52 s against main's 1.29–1.41 s (three runs each; reading the text off the main thread
  costs about 0.1 s cold), and a second search in the same process (`genter mcp`, `genter serve`) is as fast as
  main's (70 ms). Tool calls run one at a time in serve, as over stdio (the store is one file); `/health`, listing and
  every refusal answer at once meanwhile; more than 64 waiting calls get 503 and `Retry-After: 1`. DriftBench's guard
  is unchanged. (plan step 3.3, "async reads with a size-and-time skip")
* A website: `crawl` checks the start's address before anything is fetched, so a private or local one is refused
  saying so ("169.254.169.254 is not a public address: Genter reads websites at public addresses only") instead of
  "is the site up?", and `genter serve` given one exits 1. Every fetch still checks its own address
  (security/checked-address). (plan step 3.3: "private addresses refused")
* `/health`: `GET` answers `{"status":"ok"}` with no token and says nothing else (the image's health check uses it).
  (this brief)
* The image: `node:22-alpine`, nothing installed, only what the package ships (`.dockerignore` lists it: never the
  tokens, the seal key, `.env` or repositories), the user `node`, `/data` its own and the only place it writes, `/repos`
  served on `0.0.0.0:8787` inside. Its two folders are made in a stage on the building machine, so the image runs
  nothing while it builds and the arm64 image needs no emulation (checked here: `docker buildx build --platform
  linux/arm64` with no QEMU). The compose file is the plan's, plus `read_only: true`, `cap_drop: [ALL]`,
  `no-new-privileges`, `restart: unless-stopped`, an `ollama` volume, and `GENTER_SEMANTIC`, `GENTER_EMBED_URL`,
  `GENTER_EMBED_MODEL` read from `.env` (empty by default), so the meaning profile needs no edit of the file; ranking
  by meaning needs `GENTER_SEMANTIC=1` beside `GENTER_EMBED_URL`. `/repos/`, `/genter_tokens`, `/genter_seal` and
  `/.env` are in `.gitignore`. (plan step 3.3)
* GHCR: release.yml's release job gains outputs (`version`, `released`: something was to release and the job ran to the
  end), and a new `image` job, `needs: release`, runs only when `released` is true, with `contents: read` and
  `packages: write`, signs in with the run's `GITHUB_TOKEN` and pushes `ghcr.io/genterai/genter:<version>` and
  `:latest` for amd64 and arm64 with `docker buildx` (no third-party action). The npm job's steps are unchanged; a run
  that releases nothing, or whose npm publish fails (as it does until trusted publishing is configured), publishes no
  image. (plan step 3.3)
* CI: a `serve` job in test.yml runs `test/serve-compose.test.js` with `GENTER_COMPOSE=1` on ubuntu-latest, whose Docker
  and Compose run the real thing: the image built from the Dockerfile, `docker compose up` in a temp folder with the
  smoke fixture, `test/serve-smoke.mjs` (health, 401 without a token and with an unknown one, conformance over HTTP,
  search and read, the 0.3 tools refused, `/health` while 20 searches run, the served folder unchanged), the user and
  the read-only filesystem checked, and a private address refused through `docker compose run`. The same smoke runs in
  `npm test` against `node bin/genter.js serve`. (plan step 3.3)
* `docs/team.md` says first that every token holder reads every folder it serves and to serve only what the whole team
  may read; then the compose steps, tokens and revoking (in Docker: a file saved in place of the old one is seen after
  `docker compose restart genter`), TLS in front (Caddy), the clients that send a Bearer header (Claude Code, Cursor,
  VS Code, Codex, Gemini CLI, with their configs) and that claude.ai, the Claude apps' connectors and ChatGPT cannot
  connect yet (they reach a server from their own cloud and sign in with OAuth); running it without Docker; meaning
  with Ollama; the limits. It says the image is published from the first release that carries `genter serve`, and how
  to build it until then. The README gains "For a small team" and a Commands row; SECURITY.md gains what serve
  promises. (plan step 3.3)
Open:
* The plan's Docker MCP Catalog PR goes to another organization's repository, which this step does not publish to. →
  For the lead, once the first image is on GHCR. [non-blocking]
* GitHub makes a new container package private, linked to the repository by the image's
  `org.opencontainers.image.source` label. → After the first push, an org owner sets ghcr.io/genterai/genter to public
  in the package's settings. [non-blocking]
* Dependabot watches npm and the workflows' actions, not the Dockerfile's base image. → Add the `docker` ecosystem in
  `.github/dependabot.yml` in a later PR. [non-blocking]
* The agents' map (`.claude/AGENTS.md`) does not list `src/http.js`, `Dockerfile`, `docker-compose.yml` and the serve
  area yet; agents may not edit `.claude/`. → For the maintainers; harden finds the area by its Sources. [non-blocking]
* Search's "nothing found" sentence, shared with `genter mcp`, says "the person adds folders, files and websites with
  genter add"; on a team's server that is whoever runs it. → Kept word for word (serve/same-contract); revisit with the
  contract if clients stumble on it. [non-blocking]
* One search at a time fits a few people; a larger team waits. → The full server (plan, Phase 4), or Genter Cloud.
  [non-blocking]
Proof: `test/serve.test.js` "[rl:serve/same-contract] [rl:serve/tokens] [rl:serve/health] [rl:serve/read-only]
[rl:serve/async-reads] [rl:serve/team-reads-all]": `node bin/genter.js serve repos --port 0` over 400 filler documents
and the runbook fixture passes all 12 checks of `test/serve-smoke.mjs` (the 20 searches took about 0.5 s; `/health`
answered in 1 ms), no token printed / "search over HTTP answers word for word what genter mcp answers over stdio": the
same text from the same store, the same two tool definitions / "Streamable HTTP …" (also [rl:contract/conformance]):
202, a `tools/call`, `tools/list` and `initialize` notification 202 with nothing run, `null`, `[null]`, `5`, `"x"` and
`[[]]` 400 and -32600, a batch, 405 with `Allow: POST`, -32700, 400, 415, 413, 404, the four 0.3 names -32602,
conformance over HTTP /
"[rl:serve/tokens] one token per person …": the parser's problems by line and name, `who()` on nine headers, one
`timingSafeEqual`, a line removed in place refused at the next request with `WWW-Authenticate`, a line added accepted,
the file removed (401) then saved anew (200), no token in the log / "[rl:serve/tokens] it does not start with a tokens
file that holds no token or cannot be read": an empty file, one of comments only and one of a weak token say "No
token in", a folder and a missing file "cannot be read by this user", and `genter serve` exits 1 /
"[rl:serve/loopback-default] …": `isLoopback` on 14
hosts, `--host 0.0.0.0` with no tokens exits 1, with tokens and a key says TLS, loopback with no tokens answers a
loopback Host and refuses `Host: genter.attacker.example` and two Origins (403), a loopback Origin passes /
"[rl:serve/seal-outside] …": no key away from loopback, a key inside the home (also on loopback), a key file outside
it that links into it, a weak and a missing one all refused; the store opens with the file's key and config.json holds no secret / "[rl:serve/notes-off] …":
the notes answer for the person; `notes: false` finds nothing in them, refuses their id, `remember` throws, and serve
over HTTP says nothing found / "[rl:serve/team-reads-all] it serves exactly what its command names …": `genter serve
team secret`, then `genter add ../hr` in team with the same home, then `genter serve team`: it says "serving team",
neither the salaries nor hr's reviews are found, and the salaries' id is refused by read / "[rl:serve/own-home] …":
with `GENTER_HOME` unset, naming `~/.genter` or a link to it, `genter serve` exits 1 saying to set `GENTER_HOME`, and
nothing is written there / "[rl:serve/async-reads] [rl:contract/search-shape] …": a read held open (node's `fs.open`
replaced for that file, `syncBuiltinESMExports`) with `readMs: 50` leaves `docs/stuck.md` out and names it, the other
file answers, a 1.2 MB file is not read; a second search while it is held names it again and opens it no second time;
once that read ends, the next search finds it / "[rl:serve/async-reads] a replacing place whose read runs late …":
after a restart, v2's read never ends: search and read answer in under 2 s with the event loop turning, v2 is read on
the main thread 0 times (`fs.readFileSync` counted), and the runbook's mark still names v2's id / "[rl:serve/async-reads] tool calls run one at a time …": with
`waiting: 2`, a third call gets 503 and `Retry-After: 1` while `/health` and tools/list answer, at most one find ran at
once / "[rl:security/public-only] …": `serve http://169.254.169.254/…` and `http://10.0.0.1/…` exit 1 saying the address
is not public / "[rl:serve/image] …": the Dockerfile, `.dockerignore`, compose file, the release workflow's image job and
`.gitignore` / "[rl:serve/team-reads-all] docs/team.md …" / "[rl:cli/no-packages] [rl:serve/loopback-default] genter
serve needs a folder …" / "[rl:serve/read-only] tools/call names only search and read …" (handle with serve's
options: `genter_add` -32602 and nothing added). `test/serve-compose.test.js` "[rl:serve/ac-compose] [rl:serve/image] …"
with `GENTER_COMPOSE=1` here (Docker 29.8, Compose 5.6, the base image through a registry mirror): 12 of 12 smoke
checks through `docker compose up`, uid 1000, `/repos` and the root not writable, the private address refused by
`docker compose run`, no token in the logs; in CI the serve job runs it on ubuntu-latest. `test/local.test.js`
"[rl:cli/help]" now allows "token" in `genter serve`'s lines only. Each fix the review asked for was undone by hand
in turn (`only: true`, `documentAt`'s synchronous read, the reads under way, notifications): each makes its test fail.
`npm test` 185 of 185 (167 before), `npm run lint` no new finding, DriftBench guard (`node bench/drift/run.mjs --no-takes --guard README.md`) exits 0, `harden check`
0 errors.

## Red lines after

* serve/tokens: new, one token per person from GENTER_TOKENS_FILE, constant-time Bearer, read again on change (a line
  removed revokes at the next request), weak or malformed lines unused and never printed, 401 with WWW-Authenticate
* serve/loopback-default: new, 127.0.0.1:8787 by default; away from loopback only with tokens, saying TLS must sit in
  front; without tokens a loopback Host only; a non-loopback Origin refused
* serve/team-reads-all: new, every token holder reads everything served, and it serves exactly what its command names
  (each place named at start); said at start and first in docs/team.md, which names the clients that can connect and
  that claude.ai cannot yet
* serve/same-contract: new, the two tools alone through the same handle(), the same text as genter mcp, conformance
  over HTTP, Streamable HTTP's answers (a notification runs nothing, 202; no JSON-RPC object 400)
* serve/read-only: new, any tool but search and read is -32602; the served folders are left as they were
* serve/notes-off: new, notes neither searched nor read, remember off (`createLocal({ notes: false })`)
* serve/own-home: new, it does not start with Genter's home at the person's own ~/.genter, and writes nothing there
* serve/seal-outside: new, the seal key from GENTER_SECRET_FILE outside GENTER_HOME, strong, needed away from loopback;
  the config keeps no secret
* serve/async-reads: new, reads never block, a replacing place's included; over 1 MB not read; over 2 s left out and
  named, not started again while it runs; one tool call at a time while /health answers; 503 past 64 waiting
* serve/health: new, GET /health answers {"status":"ok"} with no token
* serve/image: new, the Dockerfile (node:22-alpine, nothing installed or run, user node, writes only /data), the
  compose file (loopback port, repos read-only, secrets, read-only root, meaning profile), the GHCR image job after a
  release
* serve/ac-compose: new, the compose smoke test
* cli/no-packages: text changed, `serve` among the commands; its `--host` and `--port` refused by the others
* contract/two-tools: text changed, names the forms (genter mcp, genter serve, Genter Cloud)
* contract/search-shape: text changed, the files not read in time are named after what changed
* contract/conformance: text changed, Genter's own tests also run it against genter serve over HTTP
* security/public-only: text changed, a site whose address is not public is refused saying so before any fetch, and
  genter serve given one does not start
