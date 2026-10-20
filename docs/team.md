# Genter for a small team: `genter serve`

`genter serve` runs Genter's search on a server the team owns, over the repositories it has cloned there, and gives
everyone one URL for their CLI and IDE clients. It speaks MCP over Streamable HTTP and serves the same two tools as
`genter mcp` on a laptop, `search` and `read`, with the same answers: where each answer is written, its date, and a
mark (⚠) when a document says it was replaced.

## Who reads what

**Every token holder reads every folder it serves.** A token opens all of it: `genter serve` has no per-person rules,
shares or switched-off sources (those come with Genter's full server, not open yet, and with Genter Cloud). So serve
only what the whole team may read. One token per person, so one person can be cut off without the others.

What else holds:

- **Read-only.** It serves `search` and `read` and nothing else: no client can add a folder, keep a note or make the
  server fetch an address. The repositories are mounted read-only, and it writes only to its data folder.
- **No notes.** Notes (`genter remember`) are one person's; a team's server keeps none and searches none.
- **Nothing is sent.** No telemetry. Unless you turn on ranking by meaning with an outside provider, nothing leaves the
  server but the answers your team's clients ask for.
- **Text stays in the repositories.** Genter's store keeps which files there are, their headings, dates and digests,
  sealed with a key you keep outside it; never a line of their text.

## Run it with Docker Compose

You need Docker with Compose, and a folder for Genter on the server:

```bash
mkdir genter && cd genter
curl -fsSLO https://raw.githubusercontent.com/Genterai/genter/main/docker-compose.yml

# The repositories to serve: only what the whole team may read.
mkdir repos && git clone https://github.com/your-org/handbook repos/handbook

# One token per person, "name token" a line.
for name in ana bo; do echo "$name $(openssl rand -hex 32)"; done > genter_tokens
# The key that seals Genter's store; it never goes on the data volume.
openssl rand -base64 32 > genter_seal
chmod 600 genter_tokens genter_seal
# The container runs as uid 1000 (the user node): on Linux, if `id -u` is not 1000, let it read them.
[ "$(id -u)" = 1000 ] || sudo chown 1000 genter_tokens genter_seal

echo "GENTER_VERSION=X.Y.Z" > .env    # a release of genter-cli that carries genter serve (see the releases page)
docker compose up -d
curl -s http://127.0.0.1:8787/health  # {"status":"ok"}
```

The image, `ghcr.io/genterai/genter:<version>`, is published to GitHub's container registry by the release workflow,
from the first release that carries `genter serve`. Until that release is out, build it from a clone of this
repository: `docker build -t ghcr.io/genterai/genter:dev .` and `GENTER_VERSION=dev` in `.env`.

What the compose file sets up:

| | |
| -- | -- |
| `ports: 127.0.0.1:8787:8787` | reachable on the server itself only, until you put TLS in front of it |
| `./repos:/repos:ro` | the repositories, read-only |
| `genter-data:/data` | Genter's sealed store (`GENTER_HOME`) |
| secrets `genter_tokens`, `genter_seal` | the tokens and the seal key, never in the image or on the volume |
| `read_only: true`, `cap_drop: [ALL]`, no new privileges | the container can write nowhere but `/data` |

Keep the repositories current with `git pull` in each, by hand or from cron. Genter reads the files again at every
search, so there is nothing to re-index:

```bash
*/10 * * * * cd /srv/genter/repos/handbook && git pull -q
```

## Tokens

`genter_tokens` holds one line per person, `name token`; lines starting with `#` are comments. A token is 32
characters or more (`openssl rand -hex 32` makes one); a shorter or repeated one is not used, and Genter names its line
and name in its log, never the token. Every request to `/mcp` carries `Authorization: Bearer <token>`; Genter compares
it in constant time, and answers 401 without a token it knows.

**To revoke a token, remove its line.** Genter reads the file again when it changes, at the next request. Docker mounts
the file itself: a change written into the file is seen at once, but an editor that saves a new file in its place is
seen only after `docker compose restart genter`. When in doubt, restart.

## Share it with the team: TLS in front

`genter serve` speaks plain HTTP. Before anyone reaches it over a network, put TLS in front of it, for example
[Caddy](https://caddyserver.com), which gets its certificate on its own:

```
genter.example.com {
	reverse_proxy 127.0.0.1:8787
}
```

Keep it on the team's private network (a VPN) when you can; the tokens guard it either way. Browsers are refused: a
request that comes from a web page (an `Origin` header from elsewhere) gets 403.

## Connect your tools

Clients that send a Bearer header over Streamable HTTP connect to `https://genter.example.com/mcp`. Each person uses
their own token.

**Claude Code**

```bash
claude mcp add --transport http genter https://genter.example.com/mcp --header "Authorization: Bearer $GENTER_TOKEN"
```

**Cursor** (`~/.cursor/mcp.json`)

```json
{ "mcpServers": { "genter": { "url": "https://genter.example.com/mcp", "headers": { "Authorization": "Bearer <your token>" } } } }
```

**VS Code** (MCP: Open User Configuration), asking for the token once:

```json
{
  "inputs": [{ "type": "promptString", "id": "genter-token", "description": "Genter token", "password": true }],
  "servers": { "genter": { "type": "http", "url": "https://genter.example.com/mcp", "headers": { "Authorization": "Bearer ${input:genter-token}" } } }
}
```

**Codex** (`~/.codex/config.toml`), with the token in `GENTER_TOKEN`:

```toml
[mcp_servers.genter]
url = "https://genter.example.com/mcp"
bearer_token_env_var = "GENTER_TOKEN"
```

**Gemini CLI** (`~/.gemini/settings.json`)

```json
{ "mcpServers": { "genter": { "httpUrl": "https://genter.example.com/mcp", "headers": { "Authorization": "Bearer <your token>" } } } }
```

**claude.ai, the Claude apps' connectors and ChatGPT cannot connect yet.** They reach a server from their own cloud and
sign in with OAuth, which `genter serve` does not offer. For them there is Genter Cloud (`https://genter.ai/api/mcp`);
on one person's computer, Claude Desktop runs `genter mcp`.

## Without Docker

The same server from the command, with Node 20 or later:

```bash
GENTER_TOKENS_FILE=~/genter/genter_tokens GENTER_SECRET_FILE=~/genter/genter_seal \
  npx -y genter-cli serve ~/genter/repos --host 0.0.0.0 --port 8787
```

- It listens on `127.0.0.1:8787` unless `--host` says otherwise.
- With `--host` away from loopback, it does not start without `GENTER_TOKENS_FILE` and `GENTER_SECRET_FILE`, and it
  says that TLS must sit in front.
- The seal key file must be outside Genter's home (`GENTER_HOME`, `~/.genter` by default), and 32 characters or more.
- On loopback with no tokens it answers anyone on that computer, and only requests sent to a loopback name.
- A website given to it is read at a public address only; a private or local one is refused, and it does not start.

## Ranking by meaning

Words rank the answers by default. To rank by meaning too, with Ollama beside Genter so nothing leaves the server, add to
`.env`:

```bash
GENTER_SEMANTIC=1
GENTER_EMBED_URL=http://ollama:11434/v1
```

then:

```bash
docker compose --profile meaning up -d
docker compose exec ollama ollama pull nomic-embed-text
```

Any OpenAI-compatible endpoint works in `GENTER_EMBED_URL` (with `GENTER_EMBED_MODEL`); the passages a search ranks then
go to it.

## Limits

- One search at a time: a few people's searches wait their turn, and at most 64 wait; past that a client is asked to
  come back (503). `/health` answers at once meanwhile.
- A file over 1 MB is not read. A file that takes longer than 2 seconds to read (a stuck disk or mount) is left out of
  that search, which names it, and read again at the next.
- No OAuth yet, so no claude.ai; no per-person rules.

## Check a server

From a clone of this repository, against a running server: `/health`, 401 without a token, Genter's conformance test
over HTTP, search and read, and `/health` while 20 searches run.

```bash
node test/serve-smoke.mjs check http://127.0.0.1:8787 genter_tokens
```
