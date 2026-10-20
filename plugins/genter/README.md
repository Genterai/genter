# Genter for Claude Code

```
/plugin marketplace add Genterai/genter
/plugin install genter@genter
```

| File | What it does |
| -- | -- |
| [`.mcp.json`](.mcp.json) | starts the local server, `npx -y genter-cli@0.4 mcp`, for the project Claude Code runs in: `search` and `read` over its files and your notes, no key |
| [`skills/genter/SKILL.md`](skills/genter/SKILL.md) | tells the agent to search Genter first, cite the `[id]` and place it returns, repeat a mark as the quote Genter shows, and read a place whole with `read` (the same file as [`skills/genter/`](../../skills/genter/SKILL.md), which `npx skills add Genterai/genter` installs) |
| [`search-first.json`](search-first.json) | an optional hook, not on unless you add it: at each prompt it prints one line reminding the agent to search first |

The server needs genter-cli 0.4, which is not on npm yet; until then the 0.3 on npm is the old engine, without
`search` and `read`. More, and how to add the hook: [Add it to Claude Code](../../README.md#add-it-to-claude-code).
