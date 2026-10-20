# Local engine only

Status: shipped
Request: the product owner, 2026-10-20, accepting Genter's open-source plan as proposed: "по всему что предлагаешь"
(on everything you propose), and asking to carry it through to `main` and production. This is steps 0.1 (remove the
dead Cloud bridge) and 0.2 (the legacy apps engine moves to an unsupported `legacy` branch) of Phase 0 of that plan.

Intent: genter-cli on `main` is the local engine everyone runs, with no dead Cloud bridge and no apps engine beside it
— success: the packed package installs in a clean folder with nothing else, and `genter-cli`, `genter-cli/local` and
`genter-cli/lexical` import (on 0.3.0 `genter-cli` fails with ERR_MODULE_NOT_FOUND for `@composio/core`); no command,
help line or doc asks for `genter login`, a token or a page that is gone; Genter Cloud is added to the AI tool as its
own MCP server at `https://genter.ai/api/mcp`.
Searched: `npx -y genter-cli@0.3 ask "which helpers from recipe.js and skills.js does the local engine import?"` (the
imports at `src/local.js:7-9` came third, under two skills tests; `grep` then gave the exact names) and
`npx -y genter-cli@0.3 ask "what does genter login do with a Genter Cloud token, and where is it kept?"` (`src/cloud.js`,
the help in `bin/local.js`, the README's Genter Cloud section). Both ran from a scratch install of 0.3: inside this
repository `npx genter-cli` resolves to the repository itself and answers "genter: not found".
Sources: `src/local.js`, `src/web.js`, `src/mcp-server.js`, `src/demo.js`, `bin/genter.js`, `bin/local.js`,
`package.json`, `bench/drift/run.mjs`, `test/drift.test.js`, `test/web.test.js`, `test/local.test.js`, `README.md`,
`SECURITY.md`, `CONTRIBUTING.md`, `examples/project/`, `.claude/AGENTS.md`, `.github/workflows/test.yml`,
`.github/workflows/release.yml` (its install check); the app commands, `src/cloud.js` and the five legacy areas as
they were at 9aa0384, now the `legacy` branch; on 2026-10-20 genter.ai answers 404 at the tokens page
(`/dashboard/settings`), `/api/v1/me` and `/api/v1/cli/find`, the three addresses the Cloud bridge used, and answers at
`https://genter.ai/api/mcp`; harden's `skills/hardening-changes/references/finding-truth.md` (Genterai/harden) still
names `genter-cli@0.3 login`.
Red lines: cli/no-packages, cli/help, cli/output-local, cli/config-private, cli/demo, cli/local-mcp,
cli/local-mcp-tools, cli/local-mcp-stdout, cli/ac-mcp-tools, local-search/file-is-anchor, local-search/no-text-stored,
local-search/reads-again, security/public-only, security/never-run, driftbench/offline; new: cli/cloud-own-server,
local-search/ids-stable
Decided:
* The Cloud bridge is removed, not repointed: `genter login`, `genter logout`, `GENTER_TOKEN`, `GENTER_URL`,
  `--cloud`, `--local` and the cloud part of `ask` and of the local MCP server go; the cli lines [cloud-login],
  [cloud-env], [cloud-ask], [cloud-fail-local] and [local-mcp-cloud] are retired; people add Genter Cloud to their AI
  tool as its own MCP server, which signs them in with OAuth (the owner, 2026-10-20, plan step 0.1 and its decision D3)
* The legacy apps engine leaves `main` for the `legacy` branch, unsupported, with its red lines kept there: the 15
  modules, their tests, the app commands, `docs/apps.md` and the optional peers `@composio/core` and `zod`; the `"."`
  export becomes the local engine, and exactly `"."`, `"./local"` and `"./lexical"` stay (Genter Cloud imports the
  last two); the areas mcp, retrieval, search-agent, areas and area-listing and the cli lines [app-packages] and
  [ac-app-no-packages] are retired (the owner, 2026-10-20, plan step 0.2)
* No version bump here: 0.4.0 is raised once Phase 0 is done, so this merge publishes nothing (plan, Phase 0)
Open:
* A Genter Cloud token that 0.3's `genter login` kept in `~/.genter/config.json` stays there untouched: nothing reads
  or sends it any more, and the token API it was for answers 404. Proposal: leave the person's file as it is in this
  step, and decide with the 0.4.0 release whether genter drops the old `cloud` entry on its first run, with a one-line
  notice [non-blocking: nothing new is kept and nothing is sent]
* `src/drift.js` keeps four exports only the apps engine used (`signalsOf`, `areaStats`, `sourceCount`,
  `sourcesLine`). Proposal: steps 0.4 and 0.5, which change `src/drift.js`, drop them, so two open pull requests do
  not edit the same lines [non-blocking]
* harden's finding-truth.md names `genter-cli@0.3 login` and `GENTER_TOKEN`. Proposal: rewritten when harden's pin
  moves to 0.4, in the release that moves it (plan step 0.2) [non-blocking]
Proof: `test/local.test.js` "[rl:cli/cloud-own-server]": a token in the env and in config.json, and a stand-in for the
old token API, then `ask` and `genter mcp` answer from the folder and the stand-in sees no request; `login` and
`logout` exit 1 naming the MCP address (it fails on 9aa0384) / "[rl:cli/help]": the help ends with the MCP address
and names no login, token or dashboard; app commands are unknown / `test/anchor.test.js` "[rl:local-search/ids-stable]"
pins ids and digests made by 0.3.0, and a one-off script found `src/anchor.js` equal to 0.3.0's helpers on every file
of this repository and of Genterai/harden (779 checks) / `test.yml` packs the package, installs the tarball in a clean
folder and imports the three exports (on 0.3.0 `genter-cli` fails with ERR_MODULE_NOT_FOUND) / `npm test`,
`npm run lint`, `harden check`

## Red lines after

* cli/cloud-own-server: new, Genter Cloud is its own MCP server; genter-cli never calls it and keeps no token
* cli/no-packages: text changed, the commands no longer include `login` and `logout`
* cli/help: text changed, the help's last line is Genter Cloud's MCP address, not genter.ai
* local-search/ids-stable: new, an upgrade keeps a place's id and digest
* security/never-run: text changed, nothing Genter reads is run (skills left with the apps engine); the test scans all
  of `src/`
