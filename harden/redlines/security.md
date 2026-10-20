# Security

Intent: Genter reads what a person points it at and nothing else: no private network, no code run — success: a
website at a private address is refused, and a script in a folder Genter reads is only ever read.
Sources: the security spec on the legacy branch of Genterai/specs (archive); `src/net.js`, `src/web.js`.

## Red lines

* **[public-only]** A website a person adds is fetched only at a public address, at every
  hop of a redirect too: private, loopback, link-local, unique local, multicast and reserved addresses (IPv4 and IPv6,
  documentation, benchmarking and discard-only ranges included) are refused, an IPv4 address carried in IPv6 (mapped,
  compatible, translated, NAT64, 6to4) is judged as that IPv4 address, and an address that cannot be read is refused.
* **[checked-address]** A name is looked up once per request: every answer must be public, and the request connects
  only to the addresses that were checked (TLS still checks the name), so a second DNS answer cannot swap in a private
  address.
* **[keys-stay]** A redirect to another origin (another scheme, host or port) goes on without the headers that carry
  keys: Authorization, Cookie, API keys, tokens and MCP sessions.
* **[never-run]** Nothing Genter reads is ever run: no `child_process`, `vm`, `eval`, `new Function` or
  `worker_threads` in the engine (`src/`).
