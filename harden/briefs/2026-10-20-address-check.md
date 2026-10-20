# The address check connects where it checked; secrets checked in CI

Status: shipped
Request: the product owner (dan), 2026-10-20, accepting Genter's open-source plan: "по всему что предлагаешь" (on
everything you propose). This is step 0.6 of the plan (genter's side: the address check) and step 0.8 (secrets checked
now, not "before publishing"), released as genter-cli 0.3.1 so that people pinned to 0.3 get the address fix.

Intent: an address a person adds is fetched only where the check looked, keys stay with the origin they were given to,
and a key committed by mistake fails a check before it is merged — success: every IPv4-in-IPv6 form of a private
address (mapped, compatible `::a.b.c.d`, NAT64 `64:ff9b::/96`) is refused, and so are the reserved ranges
(documentation, benchmarking, discard-only); a name that answers public, then private,
never reaches the private address; a redirect to another origin carries no Authorization, Cookie, API key or MCP
session; gitleaks runs on every pull request and every push to main, and a full mirror of Genterai/genter (pull request
refs included) scans clean but for one fixture's page cursor, ignored by its fingerprint.
Searched: `npx -y genter-cli@0.3 ask "public address check redirect private network refused"` (run from the worktree
as genter-cli 0.3.0's `bin/genter.js ask`, because npx inside the genter-cli package resolves to the local copy):
`SECURITY.md` ("Websites. Public addresses only"), `src/net.js` (`assertPublic` looks the name up, then fetch looks it
up again; every hop re-sends the same headers), `test/web.test.js` W4 and `harden/redlines/security.md` [public-only].
Sources: `src/net.js` (`privateAddress`, `assertPublic`, `publicFetch`, new `fetchAt`); its callers `src/web.js`
(pages, robots.txt) and `src/mcp.js` (an MCP server's sign-in discovery); `test/web.test.js`; RFC 4291 §2.5.5 (mapped
and compatible addresses), RFC 6052 and RFC 8215 (the NAT64 prefixes), RFC 3056 (6to4), RFC 4380 (Teredo), the IANA
special-purpose address registries; gitleaks v8.30.1 (`github.com/zricethezav/gitleaks/v8`); `.github/workflows/release.yml`
(a new version in package.json publishes it).
Red lines: security/public-only (widened: the embedded IPv4 forms, every hop of a redirect, an address that cannot be
read); new security/checked-address and security/keys-stay; security/never-run stays true (node's `http`, `https`,
`stream` and `zlib` run nothing); zero runtime dependencies stays true.
Open:
* Fetch can not be told which address to connect to without undici's own Agent, a runtime dependency. → A name goes
  through node's http(s) client, whose connection asks a lookup that answers only the checked addresses (TLS still
  checks the name) and which sends what fetch sent by default (User-Agent `node`, Accept `*/*`, Accept-Language `*`),
  so a server sees the same request; an IP address goes to fetch as before, since nothing is looked up and nothing can
  be swapped. [non-blocking, decided here]
* The local-use NAT64 prefix `64:ff9b:1::/48` can carry its IPv4 address at other places than the last 32 bits. →
  Judged by its embedded IPv4 address in the /96 form, any other address of it refused; Teredo (`2001::/32`) hides its
  IPv4 address, so refused; 6to4 (`2002::/16`) judged by its IPv4 address. [non-blocking]
* A name's request no longer goes through fetch, so Node's `NODE_USE_ENV_PROXY` (off by default) no longer routes it
  through a proxy; behind a proxy the proxy would resolve the name itself, out of reach of the check anyway. → Noted
  here. [non-blocking]
* Secret scanning with push protection is a repository setting. → The owner turns it on in Settings → Code security
  (GitHub may already have it on for this public repository), and adds the `gitleaks` check to main's required checks.
  [non-blocking]
Proof: `test/web.test.js` W6 (private, reserved and IPv4-in-IPv6 cases), W7 (every answer of
a name and every hop judged), W8 (rebinding: one lookup, and with both the resolver's second answer and the system's
connect-time lookup pointing at this machine, the server waiting there is never reached), W9 (the request connects to
the addresses given, under its name, with no DNS, sending fetch's default headers), W10 (key headers dropped on a
redirect that changes only the host, only the scheme or only the port, and still dropped when the chain comes back;
kept on the same origin). Each fails when its part is undone: W8 when a name goes through fetch again or the
connection asks the system's DNS (W9 too), W10 when only the host is compared or keys are kept, W9 without fetch's
default headers, W6 without the reserved ranges. TLS still checks the name with a pinned address
(checked by hand against a local self-signed server: its name passes, another name fails). gitleaks v8.30.1 over a full
mirror (20 branches, 1 tag, 79 pull request refs; not shallow): 147 commits scanned, 1 finding (generic-api-key: a Jira
`nextPageToken` in the fictional fixture `test/fixtures/catalogues.json`), 0 with `.gitleaksignore`. / `npm test`,
`npm run lint`, `harden check`.

## Red lines after

- security/public-only (widened)
- security/checked-address (new)
- security/keys-stay (new)
