# genter-cli 0.4.0: the release that carries the open engine

Status: shipped
Request: the product owner (dan), 2026-10-20, accepting Genter's open-source plan as proposed: "по всему что
предлагаешь" (on everything you propose), and asking to carry it through to `main` and production. The plan's Phase 0 is
"genter-cli 0.4.0", and its step 0.2 had 0.3.1 ship the address fix first; the release run for 0.3.1 failed at npm
(trusted publishing is not configured for genter-cli on npmjs.com yet), so 0.3.1 was never published and 0.4.0 follows
0.3.0 on npm, carrying everything merged since: steps 0.1 to 0.6, 1.1 to 1.8, the community part of 1.9, 1.10, 3.3 and
3.4.

Intent: the next release of genter-cli is 0.4.0, the open engine, and says in plain words what it brings and what it
breaks — success: `package.json`, `package-lock.json`'s own two fields, `server.json` (twice) and `manifest.json` say
0.4.0 and nothing else moves; the packed tarball installs alone in a clean folder, every export imports and `npx
--no-install genter --version` prints 0.4.0; the release notes start with `CHANGELOG.md`'s 0.4.0 section, breaking
changes first (the apps engine, Composio and `genter login` on the `legacy` branch; the MCP tools are `search` and
`read`), and a version without a section fails the tests before anything is published; the brief and the pull request
say exactly what a merge does while trusted publishing is not configured, and the owner's steps to publish afterwards.
Searched: `npx -y genter-cli@0.3 ask "what happens on a merge to main when the version in package.json is new: npm
publish, tag, GitHub release, genter.mcpb and the image"` and `ask "what left main for the legacy branch and what an
upgrade from 0.3 changes: apps engine, Composio, genter login, the MCP tools"`, both run from a scratch folder with this
worktree added as a source (inside the package, npx resolves `genter-cli` to the worktree, which has no `genter` bin
there): the packaging brief ("the step that raises the version has one command to run", `versions.mjs`),
`CONTRIBUTING.md`'s Releases line, `harden/redlines/cli.md` [mcpb-release]; the local-engine-only brief (what left, "No
version bump here: 0.4.0 is raised once Phase 0 is done"), `harden/README.md`, `README.md`'s More section and
`harden/retired.txt`.
Sources: `.github/workflows/release.yml` (read in full), `.github/scripts/versions.mjs`, `.github/scripts/mcpb.mjs`,
`package.json`, `package-lock.json`, `server.json`, `manifest.json`, `test/packaging.test.js`, `test/serve.test.js` (the
image job), `test/plugin.test.js` (the plugin's pin beside the package's minor), `harden/redlines/cli.md`
[versions-agree] [registry-entry] [mcpb-starts] [mcpb-release], `harden/redlines/serve.md` [image],
`harden/redlines/plugin.md` [local-server], `CONTRIBUTING.md`, `docs/listings.md`, `docs/team.md`, `README.md` (lines
122–134 and 470–477); the briefs of the steps 0.4.0 carries (`harden/briefs/2026-10-20-*.md`), for the notes; main's
Release runs 14 to 30, every one since 0.3.1 was raised, all 17 failed at "Publish to npm" (the five that had the `mcpb`
or `image` job skipped it); run 29, https://github.com/Genterai/genter/actions/runs/39509985392 (job `release`
118928320780 on ebaa27a), read step by step: every step through "Installs with nothing else and answers with no key"
passed, "Publish to npm" signed a provenance statement and wrote it to Sigstore's public transparency log, then failed
with `npm error code E404` / `404 Not Found - PUT https://registry.npmjs.org/genter-cli`, "Tag and GitHub release" was
skipped, and the jobs `mcpb` and `image` were skipped; `npm view genter-cli versions` (0.0.0-stage, 0.3.0) and
`dist-tags` (latest 0.3.0); `git ls-remote --tags origin` (v0.3.0 only); the GitHub release v0.3.0 (notes made by
`--generate-notes`); `gh release create --help` ("Additional release notes can be prepended to automatically generated
notes"); GitHub's generate-notes API for v0.3.0…main (it creates nothing: the pull requests #67 to #96 by title, of
which #68 to #71 and #73 changed only the apps engine); GitHub Actions: a step's or job's `if:` with no status function
is `success() && …`, and "Re-run failed jobs" re-runs the failed jobs and the jobs that depend on them; npm trusted
publishing (npm 11.5.1 or later; the package's Settings on npmjs.com, Trusted Publisher, GitHub Actions: organization,
repository, workflow file name, optional environment).
Red lines: cli/versions-agree (all four say 0.4.0, written by the helper, no other byte moved); cli/registry-entry (a
specific version, the npm package at it); cli/mcpb-starts (staging refuses a manifest of another version; it stages
0.4.0); cli/mcpb-release and serve/image unchanged (their jobs are untouched; both run only after the release job
released the version); plugin/local-server (the plugin's `genter-cli@0.4` is now this package's own minor);
cli/no-packages (the tarball installs alone); new: cli/release-notes.
Decided:
* 0.4.0, not 0.3.1 or 0.3.2: 0.3.1 was never published, and what main holds since 0.3.0 breaks 0.3's commands, tools,
  exports and store layout, which semver's 0.x puts in a new minor. The address fix 0.3.1 was for ships in 0.4.0 (plan
  step 0.2's 0.3.1 did not happen)
* `npm version 0.4.0 --no-git-tag-version` raised `package.json` and the lockfile's own two `version` fields, with no
  dependency change and no tag; `node .github/scripts/versions.mjs` wrote 0.4.0 into `server.json` (twice) and
  `manifest.json`
* The notes come from a file, because GitHub's generated notes are pull request titles: since v0.3.0 they open with the
  apps engine's last changes (#68 "Plain reads: an area's items described…", #69 "Area recipes kept per app…") and #79
  says "0.3.1". `CHANGELOG.md` holds a section per version, newest first, in plain words with what can break first; the
  release job prints the version's section with `.github/scripts/notes.mjs` and gives it to `gh release create
  --notes-file … --generate-notes`, which puts it before GitHub's list. The test that asks for the section runs in the
  release job before `npm publish`, so a version with no notes stops before anything is published or tagged.
  `CHANGELOG.md` is not in the package (npm 10.9.4 and 11.6.2 do not pack it; the tarball keeps its 48 files), so the
  bundle and the image do not change
* `README.md` is left alone: its note "The server needs genter-cli 0.4, which is not on npm yet. 0.4 is published once
  npm trusted publishing is set up" stays true when this merges, because the merge publishes nothing until the owner
  sets that up; pull request #95 rewrites the README (it touches `package.json`'s description and keywords, lines 5 and
  9–11, not the version on line 3: a merge of both branches was checked clean). `docs/listings.md` said "`0.3.1`
  (published before this field) cannot be listed", false since 0.3.1 never came out and was raised with `mcpName`: it
  now says 0.3.0 cannot be listed and 0.4.0 is the first listable version
* `CONTRIBUTING.md`'s Releases line adds the `CHANGELOG.md` section to what a version's pull request does
Open:
* What the merge does while trusted publishing is not configured (read from `release.yml` and the 0.3.1 runs, which took
  this path 17 times): the workflow `Release` runs on the push to main. Job `release`: checkout, Node 22, npm 11.5.1+;
  "Is this version out yet?" finds no genter-cli@0.4.0 on npm and no tag v0.4.0, so `npm=true`, `tag=true`, and its
  outputs say `version=0.4.0`, `released=true` (set whatever the steps after do); `npm ci`, `npm run lint`, `npm test`,
  then the clean install that answers "when do we deploy" with no key, all pass; "Publish to npm" runs `npm publish
  --provenance --access public`: npm signs a provenance statement for genter-cli@0.4.0 and writes it to Sigstore's
  public transparency log (it stays there, naming a version npm does not have), then the registry refuses the upload
  (E404, no trusted publisher and no token), and the job fails. "Tag and GitHub release" is skipped: no tag v0.4.0, no
  GitHub release, no notes. Job `mcpb` (`needs: release`) is skipped: no `genter.mcpb`. Job `image` (`needs: release`,
  `if: needs.release.outputs.released == 'true'`, which GitHub reads as `success() && …`) is skipped: nothing is pushed
  to ghcr.io. Nothing is published and nothing needs undoing; every later merge to main repeats the same failed attempt
  for 0.4.0 until npm has it [non-blocking: the release is the owner's, after the merge]
* The owner's steps to publish 0.4.0 after the merge: (1) on npmjs.com, signed in as an owner of genter-cli: the package
  genter-cli → Settings → Trusted Publisher → GitHub Actions: organization or user `Genterai`, repository `genter`,
  workflow file name `release.yml`, environment empty (the job names none) → save; (2) on GitHub: Genterai/genter →
  Actions → Release → the run of this pull request's merge commit → Re-run jobs → Re-run failed jobs (within 30 days of
  the run): `release` runs again on the same commit, publishes 0.4.0 with provenance, then tags v0.4.0 and makes the
  GitHub release (notes: the 0.4.0 section, then the pull requests since v0.3.0); `mcpb` then attaches `genter.mcpb`,
  and `image` pushes `ghcr.io/genterai/genter:0.4.0` and `:latest`. If more pull requests were merged in between,
  re-running the latest failed Release run (or Actions → Release → Run workflow on main) publishes 0.4.0 from main's
  head instead, with them in it. Never re-run a Release run from before this merge: its `package.json` says 0.3.1, and
  it would publish 0.3.1. (3) GitHub → Genterai → Packages → `genter` → Package settings → Change visibility → Public (a
  new container package starts private; the organization's Packages settings must allow public packages); then `docker
  pull ghcr.io/genterai/genter:0.4.0` signed out. Check: `npm view genter-cli@0.4.0 mcpName`
  (`io.github.Genterai/genter`), `gh release view v0.4.0 --json assets --jq '.assets[].name'` (`genter.mcpb`)
  [non-blocking: the owner's]
* Once 0.4.0 is on npm, these become false or due → each in its own change: the README's "not on npm yet" note (lines
  129–134) and `plugins/genter/README.md`'s line 14 (pull request #95 or a follow-up); the MCP Registry entry, published
  by hand as `docs/listings.md` says; Genter Cloud's pin (`^0.3.0` never takes 0.4: a reviewed bump, plan D7; the
  exports it imports, `fuse` from `genter-cli/local` and `genter-cli/lexical`, import from the 0.4.0 tarball) and
  harden's pin and its `genter login` mention (local-engine-only brief); `npm deprecate genter-cli@0.3` and
  `genter-cli@0.0.0-stage` (plan steps 0.2 and 0.7), after the agents' instructions that run `npx -y genter-cli@0.3 ask`
  move to 0.4 [non-blocking]
* People on genter-cli 0.3 get the address fix only by moving to 0.4, which breaks 0.3's apps engine → no 0.3.x from the
  `legacy` branch (unsupported; genter-cli had 40 downloads from 2026-10-12 to 2026-10-18, api.npmjs.org); the
  deprecation message points to 0.4 [non-blocking]
Proof: `test/packaging.test.js` "[rl:cli/release-notes] CHANGELOG.md has this version's section…": `notesOf` finds `##
0.4.0`, a "Breaking changes" heading comes first, every link is a whole address, the newest section is `package.json`'s
version and the sections go newest first; the release job's tag step writes the section to a file and passes it with
`--notes-file … --generate-notes`, after `npm publish`, and `npm test` runs before `npm publish` /
"[rl:cli/release-notes] notes.mjs takes a version's section…": both heading forms, a release candidate apart, an empty
or missing section is none, the script prints the section and exits 1 naming a missing one. Each fails when its part is
undone (on a copy: no 0.4.0 section 2 fail, "New" before "Breaking changes" 1, a relative link 1, `--notes-file` dropped
1, `npm test` moved after the tag step 1, a 0.5.0 section after 0.4.0 1; the copy unchanged 0) /
"[rl:cli/versions-agree]" and "[rl:plugin/local-server]" pass at 0.4.0 / `node .github/scripts/versions.mjs --check`
exit 0 / `npm pack --dry-run`: genter-cli@0.4.0, 48 files (LICENSE, README.md, package.json, bin/ 3, readers/ 14, rules/
2, src/ 25), 142.7 kB / the tarball installed alone in a clean folder: `node_modules` holds genter-cli only, the five
exports import, `fuse`, `bm25`, `prepare` and `terms` are functions, `npx --no-install genter --version` prints 0.4.0
and `genter ask "when do we deploy"` answers "Thursday" with no key / `node .github/scripts/mcpb.mjs stage` (49 files),
`npx --yes --ignore-scripts @anthropic-ai/mcpb@2.1.2 pack`, unzip and `diff -r` identical, the unpacked `bin/genter.js
--version` 0.4.0 / `npm test` (276 pass, 0 fail), `npm run lint` (0 errors; main's warning and info), `harden check` (0
errors)

## Red lines after

* cli/release-notes: new, a release's notes start with its `CHANGELOG.md` section, plain words, what can break first,
  whole-address links, then GitHub's list; a version without a section fails the tests before npm publish
* cli/versions-agree: kept as written, now at 0.4.0
