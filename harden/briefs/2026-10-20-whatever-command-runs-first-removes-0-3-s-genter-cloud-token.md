# Whatever command runs first removes 0.3's Genter Cloud token

Status: shipped
Request: the product owner (dan), 2026-10-20, accepting Genter's open-source plan as proposed: "по всему что
предлагаешь" (on everything you propose), and asking to carry it through to `main`. Step 0.1 of that plan removed the
dead Cloud bridge so that no token sits on the person's disk, and cli/cloud-own-server says the first command removes
the token 0.3's `genter login` kept. The 0.4.0 release brief left an Open line: on `main` only the commands that open
the store remove it (`add`, `ask`, `remember`, `forget`, `sources`, `mcp`, `serve`, `decisions`, `login`, `logout`),
and `install`, `demo`, `reader`, `help` and `--version` leave it and say nothing. Decided by the lead of the plan's
build, 2026-10-20: make the red line true as written, not narrow it; that token may still be accepted by Genter Cloud,
so it leaves the disk at the first command, whatever it is.

Intent: no Genter Cloud token from 0.3 stays on the person's disk after the first command of 0.4, whichever it is —
success: with 0.3's `config.json` (its `cloud` key beside the rest) in a scratch `GENTER_HOME`, each of `genter install
--dry-run`, `genter demo`, `genter reader check`, `genter help`, `genter --version`, `genter ask` and `genter mcp`
leaves the file without `cloud`, every other key as it was and 0600, says so once on stderr, naming the file and never
the token, and prints the same stdout, byte for byte, as a run without the token (`--version`'s line, `mcp`'s
initialize answer); with no token nothing is said; a `config.json` that is not JSON stays byte for byte and is named.
Searched: `npx -y genter-cli@0.3 ask "which commands remove the Genter Cloud token 0.3's genter login kept in
config.json, and which leave it?"`, from a scratch folder with this worktree added as a source (inside the package, npx
resolves `genter-cli` to the worktree, which has no `genter` bin there). Asked after the first edit, so [1] was this
change's own `dropCloudToken` in `bin/local.js` (main's is the same function, called only on the store's path, after
`serveSetup`: `git show origin/main:bin/local.js`), then the local-engine-only brief (step 0.1: "the first command after
the upgrade" removes it), `harden/redlines/cli.md` [cloud-own-server] and `CHANGELOG.md`'s 0.4.0 breaking changes,
which named the commands that leave it.
Sources: `bin/local.js` (`local`, `dropCloudToken`, `config`), `bin/genter.js` (it calls `local` and nothing else),
`bin/reader.js`, `src/local.js` (`genterHome`; `readConfig`: a `config.json` that is not a JSON object stops the
store's commands), `src/install/index.js` (`install` takes `genterHome`), `src/mcp-server.js` (stdout is the JSON-RPC
stream, cli/local-mcp-stdout), `test/local.test.js` (`installed`, the earlier [rl:cli/cloud-own-server] test); 0.3.0
at the tag `v0.3.0`: `bin/local.js` (`login` keeps `cloud: { token, url, workspace, user }` with `saveConfig`,
`logout` deletes `cloud`), `src/cloud.js` (`cloudOf` reads `config.cloud.token`), `bin/genter.js` (`genter login
'{…}'` keeps `composio_api_key`, `openrouter_api_key` and `user_id` for the apps engine: the person's own keys, not
Genter Cloud's); the 0.4.0 release brief's Open line on this; `npm view genter-cli versions` (0.0.0-stage, 0.3.0: 0.4.0
is not published, so its `CHANGELOG.md` section can still change); `README.md`'s Genter Cloud section ("the first
command removes the one 0.3's `genter login` kept"), true now as written.
Red lines: cli/cloud-own-server stays as written ("the first command removes the token 0.3's `genter login` kept in the
config, saying so on stderr"), now true for every command; cli/local-mcp and cli/local-mcp-stdout unchanged (the notice
is on stderr; `mcp`'s stdout carries the JSON-RPC answers alone, byte for byte as without a token); cli/help (its
stdout unchanged, its last line the address); cli/config-private (the file is rewritten 0600, through a temp file);
cli/demo and cli/demo-fast (the demo's stdout unchanged; one small file read before it); cli/no-packages;
cli/release-notes (the 0.4.0 section keeps its shape, breaking changes first).
Decided:
* The removal runs once, at the top of `local()` in `bin/local.js`, before the command is parsed: every command goes
  through it, so `install`, `demo`, `reader`, `help`, `--version`, an unknown command, and `serve` (whose setup ran
  before the removal and could stop it) remove the token too (the lead, 2026-10-20)
* Only `cloud` goes, the one key 0.3's `genter login <token>` wrote (the token, its address, workspace and user) and
  `genter logout` deleted. `secret`, `user_id`, `off`, `semantic` and the keys `genter login '{…}'` kept for the apps
  engine (`composio_api_key`, `openrouter_api_key`) are the person's own and stay as they are, in their order
* The notice is one line on stderr, before anything else the command prints, naming the file and saying why: nothing
  uses it now, and Genter Cloud may still accept it. Never the token, its workspace or its user. Once: the next command
  finds no token and says nothing
* A `config.json` that cannot be parsed is left byte for byte and named on stderr, at each command until it is fixed,
  since Genter cannot tell whether it holds the token; a missing one says nothing. The store's commands then stop as
  before (`readConfig`). A file that cannot be rewritten is named, with the key to delete by hand, as before
Open:
* Removing the token from the disk does not revoke it → whether Genter Cloud stops accepting 0.3's `gnt_` tokens is
  Genter Cloud's question, outside this repository [non-blocking]
* A `config.json` that is not JSON is named at every command, `--version` included, until it is fixed → keep it: the
  store's commands already refuse such a file, and the token may be in it [non-blocking]
Proof: `test/local.test.js` "[rl:cli/cloud-own-server] whatever command runs first removes the token 0.3's genter login
kept and says so once, on stderr, changing no byte of stdout …": for `install --dry-run`, `demo`, `reader check` (of the
repository's `adr` reader), `help`, `--version`, `ask production` and `mcp` (an initialize request on stdin), each
spawned as `bin/genter.js` from a copy of the package with a scratch `GENTER_HOME` holding 0.3's config (`cloud` beside
`secret`, `user_id`, `composio_api_key`, `openrouter_api_key` and `off`), beside the same config without `cloud` and no
config at all: the file keeps every other key and 0600; stderr starts with the notice naming the file and, past it, is
the run's without a token; stdout is both other runs' byte for byte; the token is in no output; the runs without a token
say nothing, nor does the next run once it is gone; `--version` prints the package's version alone; a config that is not
JSON is left byte for byte and named, `--version` still printing its line. With `main`'s `bin/local.js` it fails at the
first command, `install --dry-run` (the token stays). The earlier test (`ask` and `mcp` against a stand-in for the old
token API, `login`, `logout` and `--cloud`) passes with the notice's new words. / `npm test` 277 of 277, `npm run lint`
(no errors; its one warning and one info are main's, in `bench/drift/results/` and `biome.jsonc`), `node bin/genter.js
reader check` (every reader and the rules ok), `harden check`.

## Red lines after

- cli/cloud-own-server (kept as written; now true for every command, `install`, `demo`, `reader`, `help` and
  `--version` included)
