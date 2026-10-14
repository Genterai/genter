# MCP tools

Intent: the tools and instructions of Genter's hosted MCP server, defined here and served by the backend that imports
this package — success: a client that lists the tools gets the same names and descriptions as every client on its
plan, finds with GENTER_FIND and connects an app with GENTER_CONNECT's link.
Sources: the mcp spec on the legacy branch of Genterai/specs (archive); `src/tools.js`.

Most weight: [same-descriptions] (clients and catalogs keep the tool list once) and [ac-pro-tools-connect] (below
Enterprise nothing a client calls can change data).

## Red lines

### The tools

* **[same-descriptions]** The tools' names, descriptions and inputs are the same for everyone on a plan: nothing of
  the person's (their apps, their name) goes in them.
* **[find-takes]** GENTER_FIND takes a question, and `fresh` only as an optional boolean.
* **[fresh]** GENTER_FIND's description and the instructions say when to pass `fresh: true`: an earlier answer in
  the chat missed what the person meant.
* **[saved-marker]** A result line says " · saved now" for an anchor saved by this call, " · saved path" for one
  saved before, and nothing when there is no anchor; the instructions say to tell the person a path saved now is
  remembered.
* **[connected-in-instructions]** The connected apps go in the server's instructions, once each, never in a tool.

### Connecting

* **[connect-tool]** GENTER_CONNECT is the same on every plan, names no person, and takes apps, a website, an MCP
  server and an account, all optional; nothing given lists the connections.
* **[connect-lists]** Its answer lists the connections first, then one line per app asked, then a JSON line.
* **[connect-link]** An app to connect is a Markdown link `[Connect <App>](<url>)`; one already connected says so and
  how to add one more account.
* **[connect-refused]** Someone who may not connect gets "Ask a workspace owner or admin to connect it", with no link.
* **[connect-free]** Connecting costs 0 credits.

### Getting started

* **[start-connect]** With nothing connected, the instructions say to ask which apps the person uses and connect
  them with GENTER_CONNECT, or, when the person may not connect, to ask an owner or admin.
* **[start-first-question]** With an app connected and nothing asked yet, they suggest a first question with
  GENTER_FIND.
* **[start-done]** With an app connected and a question asked, there is no getting-started line.

## Proof

* **[ac-pro-tools-connect]** Given a plan without actions, when the tools are listed, then they are GENTER_FIND,
  GENTER_CONTINUE_TASK and GENTER_CONNECT, all reading only; with actions GENTER_RUN_TASK and GENTER_WRITE come too.
* **[ac-saved-now]** Given a call that saved a new anchor, when its result is shown, then its line ends " · saved
  now".
