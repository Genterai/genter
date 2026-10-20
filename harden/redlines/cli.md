# The genter command

Intent: a person runs Genter on their own machine with nothing to set up, and adds Genter Cloud to their AI tool as
its own MCP server — success: `npx genter-cli ask "how do we deploy?"` answers from the folder it runs in.
Sources: the cli spec on the legacy branch of Genterai/specs (archive); `bin/`, `src/demo.js`, `src/mcp-server.js`.

Most weight: [no-packages] (the first run must work), [config-private] (the config holds the store's secret and
keys), [cloud-own-server] (no token on the person's disk), and the local MCP contract ([local-mcp-tools],
[local-mcp-stdout]), which clients rely on.

## Red lines

### Commands

* **[no-packages]** The commands (`ask`, `add`, `remember`, `forget`, `sources`, `mcp`, `demo`, `install`) run with no
  key and no package beside genter-cli.
* **[help]** No command prints the help, its last line Genter Cloud's MCP address `https://genter.ai/api/mcp`; an
  unknown command, or `ask` with no question, exits 1.
* **[output-local]** `ask` prints each passage under `[n] place:lines · headings`, what Genter did on stderr;
  `--json` prints the same as JSON.
* **[config-private]** The config and the store are readable by their owner only (0600).
* **[demo]** `genter demo` runs on a temp folder with no key: an answer, an edit nobody tells Genter about, the new
  answer beside the stale one a memory would give, and a replaced doc.

### Genter Cloud

* **[cloud-own-server]** Genter Cloud is its own MCP server in the person's AI tool (`https://genter.ai/api/mcp`, the
  tool signs in with OAuth): genter-cli never calls it, reads no token for it and keeps nothing for it, and the first
  command removes the token 0.3's `genter login` kept in the config, saying so on stderr; `ask` and `mcp` answer from
  this computer only (0.3's `--local` changes nothing), and `genter login`, `genter logout` and `--cloud` exit 1
  naming that address, except `genter install --cloud`, which adds that address to the person's AI tools
  (install/cloud-asked).

### The local MCP server

* **[local-mcp]** `genter mcp` is an MCP server over stdio; errors are JSON-RPC errors (unknown tool -32602, unknown
  method -32601, bad request -32600), a tool's failure `isError`.
* **[local-mcp-tools]** Exactly four tools: `genter_find` (read-only), `genter_remember`, `genter_add`,
  `genter_sources`; the client's protocol version when supported, else the latest.
* **[local-mcp-stdout]** One JSON message per line on stdout, in order, nothing else; a line that is not JSON gets
  -32700.

## Proof

* **[ac-mcp-tools]** Given `genter mcp`, when a client initializes and lists tools, then it gets the four tools and
  instructions that say "Genter finds; you think and write".
