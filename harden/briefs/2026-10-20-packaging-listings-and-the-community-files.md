# Packaging, listings and the community files

Status: shipped
Request: the product owner (dan), 2026-10-20, accepting Genter's open-source plan as proposed: "по всему что
предлагаешь" (on everything you propose), and asking to carry it through to `main`. This is step 1.8 of that plan,
packaging and listings (`server.json` for the official MCP Registry, a Claude Desktop extension and its release step,
a checklist for the listings), and the community part of step 1.9: STEWARDSHIP.md, TRADEMARKS.md, GOVERNANCE.md,
CODEOWNERS, ip-boundary.md, CONTRIBUTING split into core and manifests, a DCO check, SECURITY.md saying that source
text is data, and 20 "good first reader" issues written down. Not here, on purpose: the README's first screen and the
version bump, which another step takes after the readers gate.

Intent: Genter can be listed and installed where people look, and the project says what it promises and who decides —
success: `server.json` and `manifest.json` validate against their official schemas and name the version of `package.json`;
the extension's own command, started from a staged bundle in another folder, searches the folder the person chose and
passes `genter-cli/conformance`; the release workflow attaches `genter.mcpb` to a release without touching the npm job;
a pull request with an unsigned commit fails the `dco` check; `docs/listings.md` gives the owner every step for the
registry, Glama, Smithery, PulseMCP, mcp.so and cursor.directory, saying what was read and what was not.
Searched: `npx -y genter-cli@0.3 ask "how does a client start genter mcp, which folder does it search, and what must an
install never write (secrets, project files)?"` (`harden/briefs/2026-10-20-genter-install.md` "Decided", `src/install/`:
Claude Desktop opens no project, `genter mcp <folder>` works on that folder's project, nothing written holds a token or a
private address) and `npx -y genter-cli@0.3 ask "who must review a change, what does CONTRIBUTING require for a pull
request, and what is source text treated as?"` (a DriftBench corpus page on code review ranked first, as a fixture does;
`CONTRIBUTING.md` "Tests" second: a first-run finding of its own). Both ran from a scratch install of 0.3 against this
worktree: inside the repository `npx genter-cli` resolves to the repository itself. Then a read of the registry's,
MCPB's, Claude's and the directories' own pages and sources, on 2026-10-20, listed under Sources.
Sources: `bin/local.js` (`mcp [folder|url ...]`, `projectFolder`), `src/mcp-server.js` (`mcpTools`, `instructions`),
`src/conformance.js`, `src/local.js` (a project is never the home folder or the root unless added by name),
`src/readers.js`, `readers/reader.schema.json`, `readers/*/reader.json`, `rules/`, `package.json` (`bin`, `exports`,
`files`, `engines`), `.github/workflows/{release,test,readers,harden}.yml`, `CONTRIBUTING.md`, `SECURITY.md`,
`harden/redlines/{cli,contract,install,plugin,readers,security}.md`; Genter's open-source plan, steps 1.8 and 1.9 and
decisions D1 (promises, license, DCO, who reviews), D5 (nothing sends data), D6 (the name) and D7 (CODEOWNERS on what the
cloud imports); and, read on 2026-10-20:
* https://modelcontextprotocol.io/registry/quickstart, `/authentication`, `/package-types`, `/remote-servers`,
  `/github-actions` (the server name must equal `mcpName` in the npm package; a GitHub sign-in grants `io.github.<owner>/*`
  and an organization's namespace; `packages` and `remotes` may coexist; `mcp-publisher login github-oidc` needs no
  secret) and the schema https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json (required `name`,
  `description`, `version`; the name pattern; a description of 1 to 100 characters; a package's `registryType`,
  `identifier`, `transport`; a streamable-HTTP remote's `url` pattern)
* the registry's source, `internal/api/handlers/v0/auth/{github_oidc,github_at}.go` and `internal/auth/jwt.go` on
  github.com/modelcontextprotocol/registry (a GitHub OIDC run is granted `io.github.<repository_owner>/*` and a user's
  token the namespaces of the organizations they own, `isResourceMatch` being a case-sensitive prefix; only an active
  Owner of an organization carries its namespace), and `GET https://registry.modelcontextprotocol.io/v0.1/servers`: of 90
  entries sampled, all 90 spell the namespace as their repository's owner does
* https://github.com/modelcontextprotocol/mcpb: `MANIFEST.md` (manifest_version 0.3; required `name`, `version`,
  `description`, `author`, `server`; `user_config` types and `directory`; `${__dirname}` and `${user_config.KEY}`;
  `compatibility.platforms` and `runtimes`), `CLI.md`, and `schemas/mcpb-manifest-v0.3.schema.json`; `@anthropic-ai/mcpb`
  2.1.2 on npm
* https://claude.com/docs/connectors/building/mcpb and `/submission` (Claude Desktop runs on macOS and Windows and ships
  Node; people install a `.mcpb` by double-click, drag or Settings › Extensions; the directory no longer takes MCPB
  submissions and wants a remote server or a plugin)
* https://glama.ai/blog/2025-07-08-what-is-glamajson (`glama.json` with `maintainers`; an organization's server needs it),
  https://smithery.ai/docs/build/publish (`smithery.ai/new` for a URL; `smithery mcp publish ./x.mcpb`),
  https://www.pulsemcp.com/submit (submissions paused; it takes the official registry once back); not read:
  https://mcp.so and https://cursor.directory (both refused an automated request, 403 and 429)
Red lines: `cli`: new [registry-entry], [versions-agree], [listings], [mcpb-manifest], [mcpb-starts], [mcpb-release], and
`cli/no-packages`, `cli/local-mcp-tools`, `cli/help` stay true; `contract/conformance` and `contract/two-tools` stay true
(the extension's tools are the contract's two, and its server passes the conformance function); `install/desktop-folder`
and `install/no-secrets` stay true (the extension asks for a folder and writes no secret); `security`: new
[text-is-data]; a new area `community` (this brief writes it): [stewardship], [no-phone-home], [community-files], [dco],
[owner-review], [manifests-no-brief], [works-with-genter], [ac-dco]; `readers` and `plugin` are not touched.
Decided:
* The registry name is `io.github.Genterai/genter`, with the capital: the plan's suggestion of `io.github.genterai/...`
  would be refused. The organization's login is `Genterai` (the GitHub API says so), a GitHub sign-in or an OIDC run is
  granted `io.github.Genterai/*`, and the match is a case-sensitive prefix; every entry of a sample of the live registry
  spells its namespace like its repository's owner. `mcpName` in `package.json` is that name. If the registry
  disagrees at the first publish, the fix is a new npm release, which `docs/listings.md` says (this brief)
* One `server.json` with both ways in, as the registry allows: the npm package `genter-cli` (stdio, `npx genter-cli mcp`,
  no environment) and the hosted address as a streamable-HTTP remote; no header, because a client signs in with OAuth
  and the private `/api/mcp/<key>` form is a secret (plan step 1.8, decision D3). It has no `mcpb` package entry: that
  needs the file's SHA-256 of each release, and the registry does not check it (a later step, with a CI stamp)
* The first listable version is the first one published after `mcpName` was added: the registry reads it from the
  published package. `server.json` and `manifest.json` name `package.json`'s version (0.3.1 now), a test keeps them equal,
  and `.github/scripts/versions.mjs` writes it into them, so the step that raises the version has one command to run
* The extension runs the package's own command, `node bin/genter.js mcp <folder>`, with a `directory` setting the person
  picks: required, one folder, no default (nothing is searched until they choose one; Claude Desktop starts the server
  in no project, so without it the server would search its notes only). The manifest asks for no key and no environment.
  Whether a manifest can ask for a folder and use it: yes (`user_config` of type `directory`, substituted into `args` as
  `${user_config.folder}`), and the test starts the manifest's command in that way, from another folder, with a space in
  the folder's name, and passes it through `genter-cli/conformance` (plan step 1.8)
* The bundle is what `npm pack` ships plus `manifest.json`, taken from npm's own file list (`npm pack --dry-run --json`),
  so it cannot drift from the package and needs no `node_modules` (Genter has no dependencies): 41 files, 356 kB
  unpacked, 134.1 kB packed by `@anthropic-ai/mcpb` 2.1.2. It names macOS and Windows (Claude Desktop's platforms, the
  two the plan records an install on) and Node 20 (`engines`). No icon (the Genter mark waits for TRADEMARKS.md's owner),
  no `privacy_policies` (it contacts nothing; the directory no longer takes MCPB)
* The release job is a job of its own, after `release`, so that packing cannot fail the npm publish and "Re-run failed
  jobs" tries it again. It uses nothing from the release job's `outputs` (another step edits them), runs only when the
  version's tag is at this commit and the release has no `genter.mcpb` yet (simulated for the five cases: attach,
  already attached, no release, a commit past the tag, no tag), checks out without persisting credentials, runs the
  pinned `@anthropic-ai/mcpb` with `--ignore-scripts` in a step that names no token, compares the unpacked bundle with the
  staged folder byte for byte (`diff -r`: the packer's own nine dependencies are pulled by range, with no lockfile, so
  the pin does not fix what it ran; the comparison does) and checks that it starts and is this version, and only the
  last step has the token (plan step 1.8)
* CODEOWNERS is `.github/CODEOWNERS` and names `@dangenter`, the repository's only collaborator, who has the admin role:
  an organization (`@Genterai`, which the first-party readers name as their owner) cannot be asked for a review, and a
  line with an owner GitHub does not know is silently ignored. It lists the files the plan's D7 names
  (`src/memory.js`, `src/readers.js`, `src/net.js`, `src/lexical.js`), `src/local.js` and `src/http.js`, the reader schema,
  the first-party readers and rules, what clients run (`server.json`, `manifest.json`, `glama.json`, the plugin and the
  skill, and the `Dockerfile` and compose file that the release job's image is built from), the files that state the
  promises, and `.github/`, because a pull request can change its own checks. `src/memory.js` is not in the tree yet; its
  line holds from the pull request that adds it. The six first-party readers and `rules/en.json` and `rules/ru.json` have the
  owner's line. A reader a person adds may bring a line of its own, naming the owner its `reader.json` names (a test
  checks that, and that a reader naming the organization has the owner's line); with none, the maintainers review it.
  `.github/CODEOWNERS` is not a Source of `community`, like `readers/` and `rules/`: a pull request that adds a reader and
  its line must need no `Brief:` line, as CONTRIBUTING says (found in review: with the file a Source, `harden check`
  asked for one, and the test asked every reader and language file for a line, which none of the first issues mention)
* The DCO check is one script and plain git, on `pull_request`, with read-only rights and no third-party action or app.
  A sign-off must be the commit author's or committer's own address; a merge commit (the "update branch" button) is not
  checked; Dependabot is exempt by who opened the pull request, never by a commit's author line, which anyone can write.
  It reads each commit from its raw object, because the first version parsed `git log` with separator bytes and a
  subject holding one made a commit look like a merge (found while writing the test; the test now has such a subject)
* SECURITY.md's section "Source text is data, never instructions" says what holds. In `search` a passage is four spaces
  in, so a file that prints `[1] Deploy · read now` and a `  ⚠` line shows neither as a place or a mark (a test builds
  such a file and parses the answer with the conformance `places()`). `read` gives the text as it is, after an empty line,
  as the contract's `read` says, so there a file can print a block that reads as another place with a mark (found in
  review, reproduced: it ends `read`'s answer as a third place); SECURITY.md and `security/text-is-data` say that as a
  known limit, not as a promise, and the test pins the limit, so whoever changes `read` changes the page with it
* STEWARDSHIP.md has D1's six promises and its seventh, the server's license, in the words of the plan; it says the
  default for a server is Apache-2.0 and does not name the fallback. It states the license history (Apache-2.0 since
  b91be02, PolyForm before). A test pins each promise's title, so a promise leaves the
  file only with a failing test and the owner's review. [no-phone-home] is a tripwire for the fourth promise: only
  `src/net.js`, the embeddings call in `src/local.js` and the listening server of `genter serve` (`src/http.js`, which
  imports `createServer` and nothing that makes a request) name a network primitive
* TRADEMARKS.md: forks rename, an unchanged copy may keep the name, "works with Genter" needs `genter-cli/conformance`,
  and it makes no claim about registration (the search is the owner's, D6). GOVERNANCE.md: the owner decides, maintainers
  keep a surface through CODEOWNERS, no foundation; it names the owner as his GitHub profile does
* CONTRIBUTING is split into core (an accepted issue or a brief, red lines, tests) and manifests (CI is the brief), with
  the sign-off, the owner of a reader, and the rule that nothing from Genter Cloud's private work is quoted here
* `docs/first-issues.md` has the 20 issues (12 readers, 8 languages); each was checked against the real interpreter
  (`readDocument` returns nothing for the formats of issues 1 to 9 and 12, drops the date of a `[YANKED]` release and gives a
  Russian ADR its mark but no date or status), and two were corrected by that check. No GitHub issue is created
* `.claude/AGENTS.md` is not edited (agent sessions do not edit it): its map lacks `community`, `server.json`,
  `manifest.json` and the scripts
Open:
* The owner's GitHub settings, which no file can show: the checks `test`, `harden`, `readers`, `secrets` and `dco` required
  on `main`; "Require review from Code Owners"; sign-off required for web-based commits; secret scanning with push
  protection (plan step 0.8) → the owner switches them on when this merges. With the owner as the only code owner,
  GitHub does not count the author's own approval, so a pull request opened from the owner's account cannot satisfy
  "Require review from Code Owners": the owner chooses between "Allow specified actors to bypass" for themself and
  another account for such pull requests (GOVERNANCE.md says so) [non-blocking]
* Who certifies the DCO for a commit an agent wrote: every commit of this branch is signed off by the identity that wrote
  it, which `dco.mjs` accepts because the address matches the commit's own. The check proves a sign-off exists, not that
  a person certified it. Proposal: CONTRIBUTING says the human who submits an agent's commit adds their own
  `Signed-off-by`, and the check refuses a sign-off whose only address is a `noreply` or known agent one → part of the
  contribution terms the owner decides; nothing is built for it here [non-blocking for this change]
* `read` does not set a file's text apart as `search` does (see Decided). Proposal: indent it four spaces like `search`
  (or give each text a fenced mark the conformance function can parse), which changes the contract's `read` output and
  its fixture, so it is a brief of its own and the owner's decision → this change only states the limit
  [non-blocking for this change; blocking for the one that changes `read`]
* `genter mcp` still serves 0.3's deprecated `genter_add` and `genter_remember` for one more minor release (contract
  decision D3; `cli/local-mcp-tools`), so an AI connected through the extension can ask to add another source or keep a
  note, which the person approves in Claude Desktop call by call; the manifest lists only `search` and `read`. They leave
  in 0.5 → nothing to build now; the long description and the setting say what the folder is for and not that nothing
  else can be added [non-blocking]
* The trademark search (D6) before anything is listed: a registry name is not renamed → `docs/listings.md` says so
  [non-blocking, the plan already makes it a launch blocker]
* The recorded install of `genter.mcpb` on a Mac and a Windows PC, the plan's proof for 1.8, was not done: it needs those
  computers → the owner or a later step records it; `docs/listings.md` lists it first [non-blocking]
* mcp.so and cursor.directory could not be read from here, PulseMCP is paused, Smithery's CLI flags were read and not run,
  and whether `https://genter.ai/api/mcp` answers an unsigned request with 401 was not checked → each is said in
  `docs/listings.md` as a step for the owner [non-blocking]
* `pull_request_target` would make the DCO check impossible for a pull request to edit; left as `pull_request` so that it
  runs on its own pull request and a person sees the result, with `.github/` owned by the owner in CODEOWNERS
  [non-blocking]
* The step that raises the version runs `node .github/scripts/versions.mjs` and carries a `Brief:` line, because
  `server.json` and `manifest.json` are Sources of `cli` now [non-blocking]
* The registry publish as a CI job and the `mcpb` package entry in `server.json` → later, with the release that has
  `mcpName` [non-blocking]
Proof: `test/packaging.test.js` "[rl:cli/registry-entry]": `server.json` is `io.github.<owner of the repository>/genter`
equal to `mcpName`, has exactly one npm package (`genter-cli`, this version, stdio, `npx`, the positional `mcp`) and the
one hosted remote (the address the command prints), a description of at most 100 characters, a specific version, and no
header, variable, key or private address / "[rl:cli/versions-agree]": the three files name one version, and `sync` on a
copy with another version puts it back changing only the version lines / "[rl:cli/listings]": the listings page gives the
entry's name, one line and address as `server.json` does, and `glama.json` names an owner CODEOWNERS names /
"[rl:cli/mcpb-manifest]": only keys the spec allows; the required ones; the command, its single directory setting
(required, no default), its two tools equal to the contract's, macOS and Windows, Node as `engines`, no env or secret /
"[rl:cli/mcpb-starts]": the staged bundle is npm's list plus the manifest; started as a host would (substituted
`${__dirname}` and the chosen folder, cwd elsewhere, a space in the name), the command passes `conformance`, finds
`docs/release-process-v2.md` marked superseded, and never the decoy in its working directory; staging refuses a folder
that is not empty, another version, and a missing entry file / "[rl:cli/mcpb-release]": the `mcpb` job `needs: release`,
`contents: write`, gates on the tag at this commit and no asset, stages, packs with an exact `@anthropic-ai/mcpb`
version in a step without a token, checks the bundle, uploads with the token; the `release` job has no `mcpb` in it and
still publishes and tags. `test/community.test.js` "[rl:community/dco]" (a table of commits; merge commits and
Dependabot; a real git repository with a hostile subject, `-s`, a merge of main; the workflow) and
"[rl:community/ac-dco]", "[rl:community/owner-review]" (the first-party readers and languages have the owner's line; a line names the reader's owner; a reader with no line passes; an organization-owned reader without one fails), "[rl:community/manifests-no-brief]" (no area's Sources covers a new reader, a language file or `.github/CODEOWNERS`; checked in a scratch clone with `harden check --base`: a reader, a language and their lines, 0 errors with no `Brief:` line), "[rl:community/works-with-genter]" (a server that answers every
request with an error does not pass), "[rl:community/stewardship]", "[rl:community/no-phone-home]",
"[rl:community/community-files]"; `test/security.test.js` "[rl:security/text-is-data]" (the wording, and a file that forges a place and a mark: none in `search`, a third place in `read`, the limit SECURITY.md states). Each test fails when its part is
undone (checked by hand, 35 mutations: server name lowercased, a header added, versions drifted, the folder argument
dropped, a default folder, an env key, a missing entry file, `needs` dropped, a token in the pack step, an unpinned
`mcpb`, `mcpb` in the npm job, a sign-off of anyone's address, the exemption by commit author, every commit skipped, the
parent count read from the text, `pull_request_target`, a third-party action, a skip by actor, `src/net.js` and
`.github/` unowned, an organization as owner, a promise removed, no conformance in TRADEMARKS.md, a `fetch(` in
`bin/`, a `fetch(` and a `node:https` in `src/http.js`, the `Dockerfile` unowned, a dependency, SECURITY.md's section, ip-boundary's store, a broken link). By hand: `server.json` validates
against the registry's JSON schema and `manifest.json` against MCPB's (ajv 8.17.1 in a scratch folder);
`mcpb validate` and `mcpb pack` 2.1.2 pass on the staged folder (41 files, 134.1 kB); the gate's five cases run against a
stub `gh`; `release.yml` parses with the new job after `release` and the old job's 11 steps unchanged / `npm test`,
`npm run lint` (no new finding: the one warning and one info are in files this change does not touch), `harden check`
0 errors.

## Red lines after

* cli/registry-entry: new, `server.json` is the MCP Registry entry `io.github.Genterai/genter` (the owner spelled as
  GitHub spells it): the npm package run as `genter mcp` and the hosted address, no secret
* cli/versions-agree: new, `package.json`, `server.json` and `manifest.json` name one version, written by `versions.mjs`
* cli/listings: new, `docs/listings.md` and `glama.json` agree with the entry and with CODEOWNERS
* cli/mcpb-manifest: new, the Claude Desktop extension asks for one folder and starts `genter mcp` on it, with no key
* cli/mcpb-starts: new, the bundle is npm's files plus the manifest, and its command passes conformance on the chosen folder
* cli/mcpb-release: new, a job of its own attaches `genter.mcpb` to a release without touching the npm job, after
  comparing what the packer wrote with what was staged, byte for byte
* security/text-is-data: new, source text is data, never instructions: SECURITY.md, the server's instructions and the
  skill; in `search` a file's lines cannot read as a place or a mark, and `read` giving the text as it is is a stated limit
* community/stewardship: new, STEWARDSHIP.md's seven promises, and the Apache-2.0, dependency-free package they rest on
* community/no-phone-home: new, only the website fetch, the embeddings call and `genter serve`'s listening server
  (`src/http.js`) name a network primitive
* community/community-files: new, the project's own files link only to files that are there and say the two kinds of
  contribution, the owner as the one who decides, and what Genter Cloud keeps private
* community/dco: new, every commit of a pull request is signed off with its own address; Dependabot's pull requests and
  merge commits are not checked
* community/owner-review: new, the owner reviews the code Genter Cloud imports, the reader schema, what clients run, the
  promises and the CI itself; the first-party readers and languages have the owner's line, and a reader a person adds
  may bring its own
* community/manifests-no-brief: new, a pull request that adds a reader or a language file, and its CODEOWNERS line,
  changes no area's Sources and needs no `Brief:` line
* community/works-with-genter: new, "works with Genter" requires passing `genter-cli/conformance`; forks rename
* community/ac-dco: new, the check names only the unsigned commit and how to fix it, and passes once signed off
