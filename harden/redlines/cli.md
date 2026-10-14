# The genter command

Intent: a person runs Genter on their own machine: the local commands with nothing to set up, the app commands on
their own Composio and OpenRouter keys, and their Genter Cloud workspace with a token — success: `npx genter-cli ask
"how do we deploy?"` answers from the folder it runs in.
Sources: the cli spec on the legacy branch of Genterai/specs (archive); `bin/`, `src/cloud.js`, `src/demo.js`,
`src/mcp-server.js`.

Most weight: [no-packages] (the first run must work), [config-private] (the config holds tokens), and the local MCP
contract ([local-mcp-tools], [local-mcp-stdout]), which clients rely on.

## Red lines

### Commands

* **[no-packages]** The local commands (`ask`, `add`, `remember`, `forget`, `sources`, `mcp`, `demo`, `login <token>`,
  `logout`) run with no key and no package beside genter-cli.
* **[app-packages]** An app command without `@composio/core` and `zod` exits 1 and names `npm i -g @composio/core
  zod`.
* **[help]** No command prints the help, the local commands first, its last line `https://genter.ai`; an unknown
  command, or `ask` with no question, exits 1.
* **[output-local]** `ask` prints each passage under `[n] place:lines · headings`, what Genter did on stderr;
  `--json` prints the same as JSON.
* **[config-private]** The config and the store are readable by their owner only (0600).
* **[demo]** `genter demo` runs on a temp folder with no key: an answer, an edit nobody tells Genter about, the new
  answer beside the stale one a memory would give, and a replaced doc.

### Genter Cloud

* **[cloud-login]** `genter login <token>` keeps a token only once the cloud accepted it (with its workspace and
  user); a refused token exits 1; `login` alone says who is signed in, `logout` signs out.
* **[cloud-env]** `GENTER_TOKEN` and `GENTER_URL` sign in without the config; a token that does not start with `gnt_`
  is refused before any call.
* **[cloud-ask]** Signed in, `ask` adds the cloud's answer, "From your apps · Genter Cloud (<workspace>)", after the
  local passages; `--local` skips it, `--cloud` asks only the cloud.
* **[cloud-fail-local]** When the cloud refuses or fails, the local passages are still printed, the cloud's error goes
  to stderr, and `ask` exits 0.

### The local MCP server

* **[local-mcp]** `genter mcp` is an MCP server over stdio; errors are JSON-RPC errors (unknown tool -32602, unknown
  method -32601, bad request -32600), a tool's failure `isError`.
* **[local-mcp-tools]** Exactly four tools: `genter_find` (read-only), `genter_remember`, `genter_add`,
  `genter_sources`; the client's protocol version when supported, else the latest.
* **[local-mcp-stdout]** One JSON message per line on stdout, in order, nothing else; a line that is not JSON gets
  -32700.
* **[local-mcp-cloud]** Signed in, `genter_find` adds the cloud's answer, and its description says so.

## Proof

* **[ac-mcp-tools]** Given `genter mcp`, when a client initializes and lists tools, then it gets the four tools and
  instructions that say "Genter finds; you think and write".
* **[ac-app-no-packages]** Given the package alone, when `genter search` runs, then it exits 1 naming the two
  packages.
