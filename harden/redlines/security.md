# Security

Intent: Genter reads what a person points it at and nothing else: no private network, no code run — success: a
website at a private address is refused, and a script in a folder Genter reads is only ever read.
Sources: the security spec on the legacy branch of Genterai/specs (archive); `src/net.js`, `src/web.js`.

## Red lines

* **[public-only]** A website is fetched only at a public address; private, loopback, link-local and mapped private
  addresses (IPv4 and IPv6) are refused.
* **[never-run]** Nothing Genter reads is ever run: no `child_process`, `vm`, `eval`, `new Function` or
  `worker_threads` in the engine (`src/`).
