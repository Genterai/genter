# genter serve: a small team's server

Intent: a small team runs Genter on a server it owns, over the repositories it cloned there, and every member's CLI or
IDE client reaches it at one URL with their own token — success: `docker compose up` with `docker-compose.yml`, then a
client with a token searches "can we deploy on Friday?" and reads the places it got, exactly as `genter mcp` answers
them; a client with no token, or one whose line was removed, gets 401 and nothing.
Sources: `src/http.js`, `Dockerfile`, `docker-compose.yml`; in `bin/local.js`, the `serve` command; in `src/local.js`,
`notes: false`, `only: true` and the reads off the main thread (`look`, `textAsync`, `within`, `reading`, `readMs`,
`documentAt`, `lookReplacers`); `docs/team.md`.

Most weight: [tokens] and [loopback-default] (who can reach it), [team-reads-all] (what a token opens: what the command
names, said plainly), [read-only] and [notes-off] (nothing written, no one's notes), [own-home] and [seal-outside] (a
person's own store is never touched, a copy of the data opens nothing), and [same-contract] (what clients are written
against).

## Red lines

### Who reaches it

* **[tokens]** One token per person, in the file `GENTER_TOKENS_FILE` names, `name token` a line (`#` lines are
  comments): every request to `/mcp` carries `Authorization: Bearer <token>`, compared in constant time
  (`timingSafeEqual` over digests, every token compared); without a token the file lists, the answer is 401 with
  `WWW-Authenticate: Bearer realm="genter"` and nothing is read. The file is read again whenever it changes, so a line
  removed revokes that token at the next request and a line added works at once; a file that cannot be read holds no
  token (every request refused until it can). A line that is not two words, a token under 32 characters or of fewer
  than 10 kinds of character, or one already on an earlier line is not used, and what Genter says of it names the line
  and the name, never a token. With a tokens file that holds no token, or cannot be read, it does not start.
* **[loopback-default]** It listens on `127.0.0.1:8787` unless `--host` and `--port` say otherwise. Away from loopback
  (any host but `localhost`, `127.0.0.0/8` and `::1`) it does not start without tokens, and it says that it speaks
  plain HTTP and that TLS must sit in front of it. On loopback with no tokens it says that anyone on the computer can
  read what it serves, and answers only requests whose `Host` is a loopback name (no DNS rebinding). A request with an
  `Origin` that is not loopback is refused with 403, with tokens or without: web pages have no business here.
* **[team-reads-all]** There are no per-person rules: every token holder reads every place it serves. It serves exactly
  the folders, files and websites its command names (`createLocal({ only: true })`): no other source of that project
  (one dropped from the command, one added there with `genter add`) and no website kept from 0.3 is searched or read.
  When it starts it names each place it serves and says what a token opens ("every token holder reads everything
  served here, so serve only what the whole team may read"), and `docs/team.md` says it first, names the clients that
  can connect (CLI and IDE clients that send a Bearer header: Claude Code, Cursor, VS Code, Codex, Gemini CLI) and that
  claude.ai, the Claude apps' connectors and ChatGPT cannot yet (no OAuth); the README points to it.

### What it does

* **[same-contract]** It serves the contract's two tools alone, `search` and `read`, as `genter mcp` lists them, and
  answers with the same `handle()`: the same text for the same question from the same store, and
  `genter-cli/conformance` passes over HTTP. MCP over Streamable HTTP at `/mcp`: a POST answers in JSON (a batch as a
  batch); a notification (a method with no id, a `tools/call` too) and a client's answer run nothing and get no reply,
  so alone they get 202 with no body; GET and DELETE get 405 (no stream, no session); a body that is not JSON gets 400
  and -32700, and one that is no JSON-RPC object (`null`, a number, an empty batch, `[null]`) 400 and -32600; an
  `MCP-Protocol-Version` it does not speak 400; a content type other than JSON 415; a body over 1 MB 413; any other
  path 404. Its instructions say it reads the team's folders and that
  nothing is added or kept through it.
* **[read-only]** No tool adds a source, keeps a note, writes or reaches an address a client names: any name but
  `search` and `read` is -32602, the 0.3 names included. The folders it serves are only read: the compose file mounts
  them read-only, and a server answering searches and reads leaves every file of them as it was.
* **[notes-off]** No one's notes: the notes file in Genter's home is neither searched nor read (its id is refused like
  any place outside the project) and `remember` throws; `createLocal({ notes: false })` is how.
* **[own-home]** It keeps a store of its own: with Genter's home at the person's own `~/.genter` (`GENTER_HOME` unset,
  naming it, or linking to it) it does not start, before it reads or writes anything, and says to set `GENTER_HOME`
  to a folder for it. So a team's server never opens, seals again with its key, or shares the person's own store.
* **[seal-outside]** The store is sealed with the key in `GENTER_SECRET_FILE`, and the config keeps no secret. The key
  file must lie outside Genter's home (`GENTER_HOME`, the data volume), as written and where its links lead, and hold
  32 characters or more of 10 kinds or more; a key file inside the home, weak, missing or unreadable stops it from
  starting. Away from loopback the key file is needed; on loopback without one, the config's secret seals the store as
  for `genter mcp`.
* **[async-reads]** In every form of Genter, a file's text is read off the main thread, `LIMITS.readers` at a time
  (its stat and the folder's listing stay synchronous metadata calls, quick on a disk that answers): one over 1 MB is
  not read, and one whose read takes longer than 2 s (`readMs`) is left out of that search, named first in its answer
  ("Not read in time, so not in this answer: …"); its read is not started again while it runs (no second of node's
  threads held by the same file), and what it read once it ends is what the next search takes; places are still
  numbered in the order they are listed. Nothing reads a file's text on the main thread: a replaced place's mark
  dates what replaces it from what was read in time (looked at within `readMs` by read too), else from its file's
  time. Tool calls run one at a time, in order (the store is one file); meanwhile `/health`, listing and every refusal
  answer at once, also while 20 searches run. More than 64 waiting calls: 503 with `Retry-After`.
* **[health]** `GET /health` answers `{"status":"ok"}` with no token, and says nothing else.

### The image

* **[image]** The `Dockerfile` builds on `node:22-alpine` with nothing installed (genter-cli has no dependency) and runs
  nothing in the image while it builds (its two folders come from a stage on the building machine, so arm64 needs no
  emulation), copies only what the package ships (`.dockerignore` names it; never tokens, the seal key, `.env` or
  repositories), runs as the user `node`, writes only to `/data` (`GENTER_HOME`, the user's), and serves `/repos` on
  `0.0.0.0:8787` inside the container.
  `docker-compose.yml` publishes `127.0.0.1:8787` only, mounts `./repos` read-only and the `genter-data` volume at
  `/data`, passes the tokens and the seal key as secrets (`GENTER_TOKENS_FILE`, `GENTER_SECRET_FILE` under
  `/run/secrets`), keeps the root filesystem read-only with every capability dropped, and has an optional `meaning`
  profile (Ollama, with `GENTER_SEMANTIC` and `GENTER_EMBED_URL` from `.env`). The release workflow publishes the
  image to `ghcr.io/genterai/genter:<version>` (and `latest`) with the run's own token, only after the release job
  released that version.

## Proof

* **[ac-compose]** Given `docker-compose.yml`, the image built from the `Dockerfile`, a `repos/` whose runbook says it
  was replaced by v2, and a tokens file, when CI runs `docker compose up` and `test/serve-smoke.mjs check`, then
  `/health` answers, a request without a token or with an unknown one gets 401, conformance passes over HTTP, search
  gives v2 first and the runbook marked superseded by v2's id, read reads v2, `genter_add` and `genter_remember` are
  -32602, `/health` answers while 20 searches run and all 20 answer, the served folder is unchanged, and
  `genter serve http://169.254.169.254/` in the same image exits 1 saying the address is not public.
