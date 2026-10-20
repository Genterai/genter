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
- **What it stores.** In `~/.genter` (or `GENTER_HOME`): which places there are, their digests, headings and dates, a
  page's most frequent words and the vectors of `--semantic`, sealed with AES-256-GCM and a secret made on the first
  run (for `genter serve`, the key in `GENTER_SECRET_FILE`, kept outside that folder). Never the text of a file or a
  page. Its files there (the config with that secret and your keys, and the sealed
  stores) are readable by their owner only.
- **What it sends.** With no key, nothing. With `--semantic`, the passages to rank go to the embeddings provider you
  chose. It never calls Genter Cloud: the cloud is its own MCP server in your AI tool.
- **What it runs.** Nothing it reads.
- **`genter serve`** ([docs/team.md](docs/team.md)). It listens on 127.0.0.1 unless told otherwise, and away from
  loopback only with one token per person (`GENTER_TOKENS_FILE`, compared in constant time, revoked by removing its
  line) and the seal key outside its data, saying that TLS must sit in front. It serves `search` and `read` alone: no
  client can add a source, keep a note, write, or make it fetch an address; a request from a web page is refused.
  Every token holder reads everything it serves.
