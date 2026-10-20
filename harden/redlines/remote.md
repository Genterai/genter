# Your apps' own MCP servers

Intent: a person adds a vendor's MCP server (Notion, Linear, Atlassian…) by its address as a source of their project,
with nothing but their own account at the vendor, and Genter reads it the way it reads their files: read-only, again at
every question, nothing copied — success: `genter add https://mcp.linear.app/mcp` prints where to sign in; once the
person has signed in in their browser, `genter ask` answers from Linear's documents with the server's name as the place,
an edit made in Linear answers at the next question, and no tool that writes is ever called.
Sources: `src/remote.js`; in `src/local.js`, the MCP sources (`add`, `find`, `read`, `forget`, `sources`, `noteDoc`,
`settleDoc`, `readServer`, `searchServer`, `scope`'s addresses, `dropOff`); in `src/mcp-server.js`, the failed line and
an MCP document's link; in `bin/local.js`, the sign-in address printed; `docs/remote.md`.

Most weight: [read-only-tools] (nothing changes in a person's apps), [tokens-sealed] and [public-only] (their account
and their network stay theirs), [one-person] (what one person signed in to is read for them alone), and
[says-when-failing] (an answer never hides a server it could not ask).

## Red lines

### Adding a server

* **[mcp-address]** `genter add <address>` takes an address as an MCP server when it is https, its path ends in `/mcp`
  or its host starts with `mcp.`, and it answers MCP's `initialize` as a server does (a 401 that asks for a Bearer
  token, or an `initialize` result); any other address is a website, as before. One added before stays a server while
  it does not answer (never crawled as a website). It is a source of the project it is added in
  (local-search/project-scope), named by what the server calls itself and its host.
* **[sign-in]** Genter signs in as MCP's authorization spec says, as a public client: the protected resource metadata
  the 401 names (else the well-known address), which must be for this server's address; its authorization server's
  metadata (RFC 8414, else OpenID's), whose issuer must be the one named, every endpoint https, PKCE with S256 offered;
  then dynamic client registration with `token_endpoint_auth_method: none` and a redirect to
  `http://127.0.0.1:<a free port>/callback`, the address of the vendor's sign-in with a PKCE challenge (S256), a state
  and the server as the resource, and the code traded with its verifier. The command prints that address on stderr
  and opens no browser; a callback with another state changes nothing; it waits 5 minutes. It never asks for a scope
  that writes (`write`, `*:write`, `manage`, `admin`, `delete`, `edit`, `create`, `update`). A server that takes no
  new clients, or no PKCE with S256, is refused saying so, and nothing is added; a client metadata document is not
  used (Genter has no address of its own for one yet).
* **[public-only]** Every address on the way (the server, its resource metadata, its authorization server's metadata,
  registration and token endpoints) is fetched as security/public-only and security/checked-address say: public
  addresses only, at every hop, connecting to the address checked; one that is not public is refused before anything
  is sent to it, saying "… is not a public address: Genter reaches MCP servers at public addresses only".

### What Genter calls and keeps

* **[read-only-tools]** Genter calls a server's tool only when, in the tools it lists in that session, the server does
  not mark it `readOnlyHint: false` or `destructiveHint: true`, its name does not say it changes something (it starts
  with a verb that writes, holds a word that always does, or joins one with and, or, then), and the server marks it
  `readOnlyHint: true` or its name starts with a verb that reads. Of those it calls a list that needs no input, a
  search that takes the question, and a read that takes one thing's id, a list or a search only with a read of the
  same thing; resources are read with `resources/read`. No other tool is ever called.
* **[anchors-not-copies]** Each document a server lists or finds is an Anchor: one read with fixed arguments
  (`MCP_READ {server, tool, arguments}`, or `{server, resource}`), read again at every question where it may answer:
  the server's own search with the question, then the documents whose kept words fit (8 at most). The store keeps its
  title, headings, most frequent words, date and link as the server gives them, and its digest, sealed; never a line
  of its text. A document that changed answers as it is now, said as changed since the last look; one the server says
  is not found is gone.
* **[tokens-sealed]** A server's tokens (access and refresh) are kept in `remote.json` in Genter's home, sealed with
  the store's secret (a key of their own), readable by their owner only, read again at every use; never in a config,
  never printed, logged or in an answer. They are refreshed before they expire (and once more on a 401), one refresh at
  a time; tokens another process refreshed are taken from the file. `genter forget <address>` drops them once no
  project searches the server.

### What the person sees

* **[says-when-failing]** A server that could not be searched (down, slower than 45 seconds, its sign-in expired and
  not refreshed, every search of it failing, or none of the documents it gave read) is named in the answer, before the
  places, with its address and why ("Not searched: <name> (<address>): …"), in `genter ask` and in the `search` tool;
  what it did give still answers; an expired sign-in says the command that signs in again. `genter add` says what it
  could not list or read. A document `read` cannot read now says why. Never an answer as if the server had nothing.
* **[switch-off]** An address in the person's `off` list (local-search/person-off-wins) switches off the MCP servers
  at it or under it, in every project: they are not asked, what Genter kept of them leaves the store, their ids are
  refused by `read`, and `genter add` refuses them before anything is sent.
* **[one-person]** A server is signed in as one person and read for them alone: `genter serve` refuses to serve one,
  and an MCP client cannot start a sign-in (`genter_add`, `genter mcp <address>` say to run `genter add` in a
  terminal); another project does not search it and refuses its ids.

## Proof

* **[ac-add-and-ask]** Given a vendor's MCP server that asks to sign in, when the person runs `genter add <its
  address>`, opens the address it prints and signs in, then `genter add` says which tools it calls and how many it never
  calls, `genter ask` answers from its documents with the server's name and the document's link, and no token is
  printed; `genter forget <address>` drops its sign-in.
