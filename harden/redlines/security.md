# Security

Intent: Genter reads what a person points it at and nothing else: no private network, no code run — success: a
skill's script is handed over as code and never run.
Sources: the security spec on the legacy branch of Genterai/specs (archive); `src/net.js`, `src/web.js`,
`src/skills.js`, `src/genter.js`.

## Red lines

* **[public-only]** A website is fetched only at a public address; private, loopback, link-local and mapped private
  addresses (IPv4 and IPv6) are refused.
* **[never-run]** A skill's files are never run: no `child_process`, `vm`, `eval`, `new Function` or `worker_threads`
  in the engine.
