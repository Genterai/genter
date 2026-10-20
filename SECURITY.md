# Security policy

## Reporting a vulnerability

Please do not open a public issue for a vulnerability. Report it privately:

- on GitHub: this repository's **Security** tab → **Report a vulnerability**;
- or by email to **support@genter.ai**, with "Security" in the subject.

Say what is affected (`genter --version`, the command or the MCP tool), how to reproduce it, and what an attacker
gains. We confirm that we received it and keep you posted until it is fixed. This covers the `genter` command, its MCP
server and its library; a vulnerability in Genter Cloud (genter.ai) is reported the same way.

## Supported versions

The latest release on npm. A fix comes out as a new version: run `npx genter-cli@latest` or update the package.

## What Genter promises

What a report can be held against:

- **What it reads.** Text and code files of the folders you add (the current folder on the first `ask`), public
  websites you add, and its notes file. Never hidden files, files the folder's `.gitignore` ignores, lockfiles, keys
  and credentials (`id_rsa`, `*.pem`, `*.key`, `credentials.json`, …), or any file holding a private key.
- **Websites.** Public addresses only: an address that resolves to a private or local network is refused.
- **MCP servers you add** ([docs/remote.md](docs/remote.md)). The same public-address check at every address on the
  way (the server, its sign-in metadata, its authorization server), https only. Genter signs in with OAuth as a public
  client (PKCE with S256, a loopback redirect, no scope that writes) and opens no browser. It calls only tools that
  read: never one the server marks as not read-only or destructive, never one whose name says it changes something.
  Their tokens are sealed in `~/.genter/remote.json` (AES-256-GCM, readable by you only), never in a config, never
  printed or returned, and dropped by `genter forget <address>`. `genter serve` never serves one.
- **What it stores.** In `~/.genter` (or `GENTER_HOME`): which places there are, their digests, headings and dates, a
  page's or an MCP document's most frequent words (and the document's title and link), the vectors of `--semantic`,
  and the tokens of the MCP servers you signed in to, sealed with AES-256-GCM and a secret made on the first
  run (for `genter serve`, the key in `GENTER_SECRET_FILE`, kept outside that folder). Never the text of a file, a
  page or a document. Its files there (the config with that secret and your keys, and the sealed
  stores) are readable by their owner only.
- **What it sends.** With no key, nothing. With `--semantic`, the passages to rank go to the embeddings provider you
  chose. To an MCP server you added: your question, to its own search tool, and the reads of its documents. It never
  calls Genter Cloud: the cloud is its own MCP server in your AI tool.
- **What it runs.** Nothing it reads.
- **`genter serve`** ([docs/team.md](docs/team.md)). It listens on 127.0.0.1 unless told otherwise, and away from
  loopback only with one token per person (`GENTER_TOKENS_FILE`, compared in constant time, revoked by removing its
  line) and the seal key outside its data, saying that TLS must sit in front. It serves `search` and `read` alone: no
  client can add a source, keep a note, write, or make it fetch an address; a request from a web page is refused.
  Every token holder reads everything it serves: exactly the folders and websites its command names, from a store of
  its own (`GENTER_HOME`, never your `~/.genter`).
