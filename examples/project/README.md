# Genter in your project

Two files make every agent on the team find answers in this repository by meaning, read as they are now. Copy them to
the root of your repository and commit them.

| File | What it does |
| -- | -- |
| [`.mcp.json`](.mcp.json) | Claude Code starts `genter-cli mcp` for this repository, ranking by meaning with the first key a person has set |
| [`AGENTS.md`](AGENTS.md) | tells the agent to ask Genter before it guesses, and to cite `path:lines` |

## An existing project

```bash
cd your-repo
curl -fsSLO https://raw.githubusercontent.com/Genterai/genter/main/examples/project/.mcp.json
curl -fsSL https://raw.githubusercontent.com/Genterai/genter/main/examples/project/AGENTS.md >> AGENTS.md
export OPENAI_API_KEY=sk-...      # or OPENROUTER_API_KEY, AI_GATEWAY_API_KEY; or Ollama, and nothing leaves the computer
claude                            # approve the "genter" server once
```

Then ask the agent what you would ask a colleague who has been here a year: "where do we check who may see an
invoice?", "why does the import skip archived rows?". It calls `genter_find`, reads the places that answer, and cites
them. Nothing is indexed ahead: Genter maps the folder in well under a second and reads it again at every question,
so a file edited a minute ago answers in its new form.

**What leaves the computer.** With a key set, the passages Genter ranks go to that provider for embeddings. A person
with no key, or `GENTER_SEMANTIC` removed from `.mcp.json`, ranks by words and sends nothing. Ollama
(`ollama pull nomic-embed-text`) gives meaning with nothing leaving the computer.

**Cursor, Windsurf, Codex, VS Code.** The same server in their MCP settings:
`{ "command": "npx", "args": ["-y", "genter-cli@0.3", "mcp", "."], "env": { "GENTER_SEMANTIC": "1" } }`.

## A new project

Start with the same two files and a `docs/` folder. Write a decision down where it is made (`docs/decisions.md`, a
heading per decision, a date), and mark a page that a newer one replaces with
`> Deprecated: replaced by [v2](v2.md)`: Genter then answers with the new page right after the old one. The agent
finds both by meaning from the first day, and nothing has to be kept in sync: there is no index to rebuild.

## The team's apps

Genter Cloud is its own MCP server, not a line in this file: a person who uses it adds `https://genter.ai/api/mcp` to
their own AI tool once, and the tool signs them in with OAuth. Their agent then asks this repository with
`genter_find` and the team's tickets, chats, mail and docs with Genter Cloud's `search` and `read`. Nothing about it
is committed here or kept on anyone's disk ([Genter Cloud](../../README.md#genter-cloud-your-teams-apps)).
