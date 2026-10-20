# Community

Intent: people who use and extend Genter can see how the project is run and what it promises, and what a machine can hold
is held — success: a pull request with a commit that is not signed off fails the `dco` check and says how to fix it, a
change to the code Genter Cloud imports needs the owner's review, and a promise cannot leave STEWARDSHIP.md without a
test failing.
Sources: `STEWARDSHIP.md`, `TRADEMARKS.md`, `GOVERNANCE.md`, `ip-boundary.md`, `.github/scripts/dco.mjs`; steps 1.9 of
Genter's open-source plan and its decision D1.

Most weight: [stewardship] (what people build on the open code rely on), [dco] (the terms every contribution comes in
under), and [owner-review] (the code that decides what is read, marked and sent is imported by Genter Cloud at an exact
version, so a person reads each change to it).

`.github/CODEOWNERS` is outside Sources on purpose, like `readers/` and `rules/` (readers/declarative): a person who adds
a reader may add its line there, and a reader needs no brief. The file's own line makes the owner review every change to
it, and a test reads it.

## Red lines

### What the project promises

* **[stewardship]** STEWARDSHIP.md holds seven promises, in this order: no feature moves from open to paid; no
  artificial limits in the open code; installing needs no account; nothing you run sends data; access rules, shares and
  source switches are never paid; README numbers reproduce with the open code; the server's license is announced before
  it opens. What they rest on is true: the package is Apache-2.0 and has no `dependencies`, `peerDependencies` or
  `optionalDependencies`, and contributions come in with a sign-off and no CLA. A change to the file is a brief and the
  owner's review.
* **[no-phone-home]** Only the fetch of a website the person added (`src/net.js`), the embeddings call `--semantic` makes
  (`src/local.js`) and the listening server of `genter serve` (`src/http.js`, which imports `createServer` and nothing that
  makes a request) name a network primitive (`fetch`, `http`, `https`, `net`, `tls`, `dns`, `dgram`, `http2`, `WebSocket`,
  `sendBeacon`): no other file of `bin/` or `src/` can send anything, so nothing the command or the servers run sends a
  count, a ping or a report. SECURITY.md says what `--semantic` sends.
* **[community-files]** STEWARDSHIP.md, TRADEMARKS.md, GOVERNANCE.md, ip-boundary.md, CONTRIBUTING.md, SECURITY.md,
  docs/first-issues.md and docs/listings.md link only to files that are there. CONTRIBUTING.md has the two kinds of
  contribution (core: a brief and red lines; manifests: CI is the brief) and the sign-off; GOVERNANCE.md says the owner
  decides and that there is no foundation; ip-boundary.md names, in general words, what Genter Cloud keeps private: the
  SQL store, connectors and their orchestration, the access engine, the agent, notifiers and the queue, billing and plans.

### Contributions

* **[dco]** Every commit a pull request adds, a merge commit apart, carries `Signed-off-by: Name <email>` (the
  Developer Certificate of Origin, no CLA) with the author's or the committer's own address, in any case; a commit
  without one, or signed for someone else, fails the `dco` check, which names it and says to run `git rebase --signoff`.
  A pull request opened by Dependabot is not checked, and it is the pull request's opener that decides that, never a
  commit's author line. The check is one script, `.github/scripts/dco.mjs`, run by `.github/workflows/dco.yml` on
  `pull_request` with read-only rights and no action but GitHub's own; it reads each commit from its raw object, so
  nothing a message says moves a field.
* **[owner-review]** `.github/CODEOWNERS` asks the owner (a user GitHub can ask, never the organization alone) to review
  every change to `src/memory.js` (it may not be in the tree yet, and is owned from the pull request that adds it),
  `src/readers.js`, `src/net.js`, `src/lexical.js`, `src/local.js`, `src/http.js`, `readers/reader.schema.json`, the
  `Dockerfile` and `docker-compose.yml`, `server.json`, `manifest.json`, the files that state the promises, `.github/`
  (a pull request can change its own checks) and the file itself. The first-party readers and the two first-party
  language files have a line for the owner of the repository. A reader a person adds may bring a line of its own, and
  that line names the owner its `reader.json` names; a reader or a language file with no line is reviewed by the
  maintainers. A `reader.json` that names the organization as its owner is a first-party reader, so it has the
  owner's line.
* **[manifests-no-brief]** A pull request that adds or changes only a reader (`readers/<name>/`), a language file
  (`rules/<lang>.json`) and, if it wants one, its line in `.github/CODEOWNERS`, changes no code an area names under
  `Sources:`, so `harden check` asks it for no `Brief:` line: CI (`readers`) is its brief.
* **[works-with-genter]** TRADEMARKS.md asks "works with Genter" to be claimed only by a server or client that passes
  `genter-cli/conformance`, shows the call (`conformance(send, { query, mark: true })`), and says forks rename;
  `genter-cli/conformance` is an export of the package, and a server that answers every request with an error does not
  pass it.

## Proof

* **[ac-dco]** Given a branch with one commit signed off and one that is not, when `.github/scripts/dco.mjs` runs on its
  range, then it exits 1 naming only the unsigned commit (a subject with control characters included) and the commands
  that fix it; given the same range in a pull request Dependabot opened it exits 0; and once the commit is amended with
  `-s`, and main merged into the branch, it exits 0.
