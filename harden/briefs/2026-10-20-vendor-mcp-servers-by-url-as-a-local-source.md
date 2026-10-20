# Vendor MCP servers by URL as a local source

Status: shipped
Request: the product owner (dan), 2026-10-20, accepting Genter's open-source plan: "по всему что предлагаешь" (on
everything you propose). This is step 3.4 of that plan: `genter add <https MCP server address>` adds a vendor's own MCP
server (Notion, Linear and Atlassian advertise OAuth with dynamic client registration or a client metadata document) as
a source of the current project, the open path to a team's apps with nothing but the person's own account at the
vendor: discovery as MCP's authorization spec says, the public-address check at every hop; OAuth 2.1 with PKCE as a
public client, a loopback redirect, the address printed and no browser opened; tokens sealed, refreshed, dropped with
`genter forget`; only read-only tools, whose lists and reads become Anchors read again at every question; a failing
server said in the answer; the person's `off` list switches a server off. No version bump.

Intent: a person adds a vendor's MCP server by its address and Genter reads it the way it reads their files: read-only,
again at every question, nothing copied, their tokens sealed — success: `genter add https://mcp.linear.app/mcp` prints
where to sign in; once the person has signed in in their browser it says which tools it calls and how many it never
calls; `genter ask` answers from the server's documents with the server's name as the place and the document's own link;
an edit made at the vendor answers at the next question, marked changed; a server that is down or whose sign-in expired
is named in the answer; no write tool is ever called and no token is on disk in clear.
Searched: `npx -y genter-cli@0.3 ask "…"` from the worktree answers `sh: 1: genter: not found` (inside its own
repository npx resolves to this package), so the questions were asked with genter-cli 0.3.0's `bin/genter.js ask`
installed in a scratch folder, run from the worktree with its own `GENTER_HOME`: "where are a website's pages fetched,
which addresses are refused, and what does the store keep of a page?" (`SECURITY.md` "What Genter promises": public
addresses only, a page's most frequent words kept, never its text; `harden/redlines/security.md` [public-only],
[checked-address], [keys-stay]; the address-check brief: `publicFetch` connects to the address it checked); "what seals
the store, where is its secret kept, and which files are readable by their owner only?" (`src/local.js` `localSecret`
and the 0600 config, `src/seal.js`); "which tools of a remote MCP server count as read-only, and how is a server switched
off?" (this step's own red lines and `README.md` "Each project searches its own": the `off` list). Then the MCP
specification 2025-06-18 (Streamable HTTP; authorization: RFC 9728 protected resource metadata, RFC 8414 and OpenID
discovery, RFC 7591 dynamic registration, RFC 7636 PKCE with S256, RFC 8707 resource indicators, the client ID metadata
document draft), and the live metadata of Notion, Linear, Atlassian, Sentry, Asana and Slack on 2026-10-20 (each
`initialize` without a token answered 401 with `WWW-Authenticate: Bearer`; `discover()` run against them found
registration at Notion, Linear, Atlassian, Sentry and Asana, none at Slack).
Sources: `src/remote.js` (new); `src/local.js` (`createLocal`, `add`, `find`, `read`/`readWhole`, `forget`, `sources`,
`scope`, `dropOff`, `noteDoc`, `settleDoc`, `readServer`, `searchServer`, `findText`, `failedText`); `src/mcp-server.js`
(`instructions`, the `search` description, `searchText`, `metaLine`); `bin/local.js` (`signIn`, the `add` and `forget`
lines, the help); `src/net.js` (`publicFetch`, `textOf`); `src/seal.js` (`cipher`); `src/anchor.js`
(`classifyFailure`); `README.md`, `SECURITY.md`, `docs/remote.md`; `harden/redlines/{local-search,contract,cli,
security,serve}.md`; Genter's open-source plan, step 3.4, and decision D5 (nothing sends data but what the person
asked for).
Red lines: a new area, remote: mcp-address, sign-in, public-only, read-only-tools, anchors-not-copies, tokens-sealed,
says-when-failing, switch-off, one-person, ac-add-and-ask. Changed: contract/place-ids (an MCP server's document is a
place), contract/search-shape (the server's name and the document's link as where it is, `mcp` as what it is, the
servers not searched named after the files not read in time), cli/output-local (the `ask` line of an MCP document; where
to sign in on stderr). Stay true: local-search/project-scope, person-off-wins, reads-again, gone-not-answer,
no-text-stored (an MCP document is kept as a page is: title, headings, most frequent words, date, link, digest, sealed);
contract/two-tools, read-whole, read-scope, marks, conformance; cli/local-mcp-tools, config-private, cloud-own-server;
security/public-only, checked-address, keys-stay, never-run (node's `http` and `crypto` run nothing); serve/read-only,
team-reads-all; zero runtime dependencies.
Decided:
* Which addresses are servers: https, a path ending in `/mcp` or a host starting with `mcp.`, and an `initialize`
  without credentials answered as a server answers (a 401 asking for a Bearer token, or an `initialize` result). Any
  other address stays a website, as before; one added as a server stays one while it is down, so a server is never
  crawled as a website.
* Sign-in (`discover`, `authorize`): the protected resource metadata the 401 names, else the well-known address under
  the server's path, then the origin's; it must be for this server's address. Its first authorization server's
  metadata (RFC 8414, else OpenID), whose issuer must be the one named, every endpoint https, PKCE with S256 listed; with
  no resource metadata, the server's origin is the authorization server. Genter registers itself (dynamic client
  registration, `token_endpoint_auth_method: none`, `client_name: Genter`) with the redirect
  `http://127.0.0.1:<a free port>/callback` (a loopback server that answers only `/callback` with this sign-in's state,
  for 5 minutes), prints the sign-in address with a PKCE challenge, a state and the server as the resource, opens no
  browser, checks `iss` when the server says it sends one, and trades the code with its verifier. Scopes the server
  asks for are taken but for those that write (`write`, `*:write`, `manage`, `admin`, `delete`, `edit`, `create`,
  `update`): Linear asks `read write`, Genter asks `read`; Sentry's `org:read project:write …` becomes `org:read`.
* No client metadata document yet: it needs a document at a stable https address that Genter owns. A server whose
  authorization server offers no dynamic registration is refused saying so (and that it takes a client metadata
  document, when it says it does); nothing is added. Every server checked that Genter can use offers registration.
* Every request (the server, its metadata, the authorization server's, registration, token) goes through
  `publicFetch`, so security/public-only and checked-address hold at every hop and every redirect; an address that is
  not public is refused before anything is sent ("… is not a public address: Genter reaches MCP servers at public
  addresses only"); a non-https endpoint is refused.
* Tokens: `remote.json` in Genter's home, `{ v, blob }` sealed with the store's secret under a key of their own
  (`<secret>:<user>:remote`), written whole through a temp file at 0600, read again at every use. Refreshed a minute
  before they expire (half their life when shorter) and once more on a 401, one refresh at a time; tokens another
  process refreshed meanwhile are taken from the file. A refresh the server refuses means signing in again: `genter add
  <address>` does, and the answer says so. `genter forget <address>` drops them once no project searches the server;
  the file goes when it holds none.
* What is called (`readOnly`, `planOf`): from the tools the server lists in that session, never one it marks
  `readOnlyHint: false` or `destructiveHint: true`, never one whose name writes (it starts with a write verb, holds a
  word that always writes such as `create`, `delete`, `replace`, or joins one with and, or, then), then one it marks
  `readOnlyHint: true` or whose name starts with a read verb. `open` is a write verb (an issue, a pull request, a ticket
  or a conversation is opened by creating it) and `load` is no read verb; a name that is not plain (letters, digits,
  `_ . - / :`, 128 at most) is never called. Of those: a list needing no input (not of people, labels, settings), a
  search taking one text input (never a bare `query`, whose input may be SQL), a read taking one id; a list or a search
  only with a read of the same thing, or a read of anything (`fetch`). Resources are read with `resources/read`. A read
  whose tool is not in the session's plan is not called.
* What is kept (`noteDoc`): each document is an Anchor `MCP_READ {server, tool, arguments}` or `{server, resource}`, with
  its number; the sealed store keeps its title, headings, most frequent words, date, link and digest, as for a page,
  never its text. Its title, date and link come from the read, else from the listing, else from what the Anchor kept
  (the date only while the text is the same); the digest is of its text only, so a document read again without its
  listing is not changed. At `genter add`: the server's resources and lists (100 documents at most), and the documents
  it gave before that the listing no longer has, read again. Gone only when the server says so of the read (the tool's
  own error, or a JSON-RPC error answering `resources/read`, -32002); a status with no answer to the read (a 404 for a
  session the server lost, a proxy's) is an error: a session the server ended is started again once, as Streamable
  HTTP says. At every question, each server in a session of its own, all at once, 45 seconds at most: its own search
  with the question (5 hits per search), then the kept documents whose words fit (8 at most), each read now; what
  changed is said.
* What a person sees: the place is the server's name and host (`Acme Docs (93.184.215.14)`), with the document's own
  link when it gives one; `kind: "mcp"`. A server that could not be searched (down, slow, its sign-in expired, every
  search failing, no document read) is named before the places ("Not searched: …") in `genter ask` and the `search`
  tool, and what it did give still answers; `read` says why it could not read a document; `genter add` says what it could
  not list or read. Text from a server that lands on one line of an answer (its name, a title, a heading, a tool's name,
  a link, an error) holds no control, bidi or line-break character; a document's text holds no control character but
  tab and line break, and no bidi control.
* Switch-off: an address in the person's `off` list (`https://mcp.linear.app`) switches off the servers at it or under
  it in every project: not asked, their documents dropped from the store, their ids refused, `genter add` refused before
  anything is sent. Paths in the list work as before.
* One person: a server is signed in as the person who added it, so `genter serve` refuses one (every token holder would
  read it), and an MCP client cannot start a sign-in (`genter_add`, `genter mcp <address>` say to run `genter add` in a
  terminal). Another project does not search it and refuses its ids (local-search/project-scope).
* No dependency: node's `http`, `crypto` and `fetch`; nothing run. Vendors' tools are found by their names and inputs;
  no vendor has a reader of its own (the per-app helpers question stays open).
Open:
* Where would Genter's client metadata document live? → `https://genter.ai/oauth/genter-cli.json`, served by Genter
  Cloud as a static file (`client_id` that address, `client_name: Genter`, `client_uri` this repository,
  `redirect_uris: ["http://127.0.0.1/callback"]` with any port on loopback as RFC 8252 allows,
  `grant_types: ["authorization_code", "refresh_token"]`, `token_endpoint_auth_method: none`); Genter would then use it
  where `client_id_metadata_document_supported` is true and keep registration as the fallback. Every server checked
  offers registration today, so nothing waits on it. [non-blocking]
* The plan's proof names a Notion test workspace: signing in to a real vendor needs a person at a browser and an
  account. → The live part checked here is discovery against six vendors; a maintainer signs in once to Notion and
  Linear with `genter add` and notes the tool lists in docs/remote.md. [non-blocking]
* `.claude/AGENTS.md`'s map does not list `src/remote.js` and the remote area yet; agents do not edit `.claude/`. → For
  the maintainers; harden finds the area by its Sources. [non-blocking]
* Slack's MCP takes no new clients (no dynamic registration): it needs an app the workspace approves. → Out of this step;
  a client ID the person brings could be a later option. [non-blocking]
* Older servers on HTTP+SSE only (an address ending in `/sse`) are not read. → Streamable HTTP only, said in
  docs/remote.md. [non-blocking]
Proof: `test/remote.test.js`, against a fake vendor (an MCP server and its authorization server at two public addresses,
the engine's `fetch` routed to them, so every request passes the public-address check): "[rl:remote/read-only-tools] a
tool is called only when …" (9 tools taken, 21 refused, `delete_document` marked read-only among them); "… the plan …"
(Notion's, Linear's and Atlassian's tool names: what is listed, searched and read); "[rl:remote/anchors-not-copies] what
a server answers …" (JSON as text, titles without bidi or line breaks, dates, links, GraphQL nodes); "[rl:remote/sign-in]
[rl:remote/public-only] signs in as MCP says …" (metadata found, Genter registered with no secret, PKCE verified by the
fake server, the browser back at `http://127.0.0.1:<port>/callback`, `scope=read` of `read write`, only the two public
addresses asked); "… its documents answer in search, read again at every question …" (the server's name and the
document's link as the place, the runbook marked superseded, a document only search finds read by its id, no line of a
document in the store, an edit said as changed, a deleted document gone, only `list_documents`, `search_documents` and
`get_document` ever called: none of the six write tools); "an answer as an event stream that stays open …";
"[rl:remote/tokens-sealed] …" (0600, sealed, a one-second token refreshed once before the next session, refreshed again
on a 401, no token in any file under the home nor in an answer, `forget` removes the file); "[rl:remote/says-when-failing]
…" (a 503, a failing search, an expired sign-in with its command, `read` saying why, nothing found still naming the
server); "[rl:remote/public-only] …" (10.0.0.5, 127.0.0.1, a 169.254.169.254 authorization server, a 192.168.1.10
resource metadata: refused, none fetched; http refused; metadata for another address refused);
"[rl:remote/mcp-address] …" (an `/mcp` page that is a website is crawled as one; a server down stays a server, never
crawled); "[rl:remote/sign-in] … no new clients or no PKCE …"; "[rl:remote/switch-off] …" (no request to the server,
documents dropped, ids refused, `add` refused); "[rl:remote/one-person] …"; "[rl:remote/ac-add-and-ask]
[rl:cli/output-local] …" (the `genter` command in a process of its own: the address on stderr, the browser following it,
`ask`, `sources`, `forget` dropping the sign-in, no token printed). After the review: the read-only test also refuses
`open_pull_request`, `openIssue`, `open_ticket`, `conversations_open`, `load_document` and names with a line break or a
bidi control, and the plan never pairs an `open_*` reader or gives a bare `query` the question; "… read again without
its listing keeps the title, date and link …" (an unchanged resource re-read by a search after `genter add` is not
changed and keeps its date, `genter add` again says 0 changed, `read` keeps the link); "… a server's text writes no line
of an answer …" (a heading with U+202E and ESC, a resource with no name whose heading holds U+2067 and BEL);
"[rl:remote/says-when-failing] … a 404 from the server is no document gone …" (a session the server ends between its
search and the reads is started again, two `initialize`; every read answered 404 "Session not found" leaves every Anchor
fresh and names the server; `read` says the 404; a resource the server answers -32002 for is gone). `discover()` run
against the six vendors' live metadata. `npm test`, `npm run lint` (no new finding), `harden check` 0 errors.

## Red lines after

* remote/mcp-address: new, an https address with `/mcp` or `mcp.` that answers `initialize` as a server is one; any
  other stays a website; one added stays a server while down
* remote/sign-in: new, MCP's authorization as a public client: resource metadata for this address, the issuer named,
  https endpoints, PKCE S256, dynamic registration, a loopback redirect, the address printed and no browser opened, no
  write scope; no registration or no S256 refused saying so
* remote/public-only: new, every address on the way through the public-address check, refused before anything is sent
* remote/read-only-tools: new, only tools the server does not mark writing and whose plain names do not write (`open`
  writes), marked read-only or named with a read verb; lists, searches and reads paired, never a bare `query` given
  the question; nothing else called
* remote/anchors-not-copies: new, each document an Anchor `MCP_READ`, read again at every question (the server's search,
  then the kept documents that fit); title, headings, words, date, link and digest of its text kept sealed, never its
  text; gone only when the server says so of the read, a lost session started again once; a server's text writes no
  line of an answer
* remote/tokens-sealed: new, `remote.json` sealed under a key of its own, 0600, never in a config, printed or answered;
  refreshed before expiry and on a 401, one at a time; dropped by `genter forget`
* remote/says-when-failing: new, a server not searched (down, slow, sign-in expired, search failing, nothing read) named
  in the answer with why; `read` and `add` say what failed
* remote/switch-off: new, an address in the person's `off` list switches its servers off everywhere: not asked, dropped,
  ids refused, not added
* remote/one-person: new, `genter serve` refuses a server; an MCP client cannot start a sign-in; another project does
  not search it
* remote/ac-add-and-ask: new, the command's add, ask, forget path
* local-search/person-off-wins: text changed, the `off` list also takes addresses of MCP servers (remote/switch-off)
* contract/place-ids: text changed, an MCP server's document is a place with a number
* contract/search-shape: text changed, the server's name and the document's link, `mcp`, and "Not searched: …" after
  the files not read in time
* cli/output-local: text changed, the `ask` line of an MCP document, and where to sign in on stderr
