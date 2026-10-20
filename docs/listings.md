# Listings: where Genter is published, and the steps for the owner

Every listing here is an outward action: it is done by the owner (`@dangenter`, an Owner of the Genterai organization)
or by a CI job added later, never by an agent and never as a side effect of a merge. What was read, and when, is said
at each step: read on 2026-10-20 unless it says "not read". Sites change, so each section names where the truth is.

Two things to settle first. The trademark search (decision D6 of Genter's open-source plan) should be clear before
anything is listed: a name in a public directory is hard to take back, and the registry name below cannot be renamed
(a new name is a new entry). And nothing below is submitted before launch week unless the owner says so; the plan puts
the submissions at T-14 to T-1.

## What there is to list

| | |
| -- | -- |
| Name | Genter |
| One line | Decision memory for your AI: the current answer first, and what was replaced marked. No key. |
| Repository | <https://github.com/Genterai/genter>, Apache-2.0 |
| Local server | npm `genter-cli`; the command is `genter`; clients run `npx -y genter-cli mcp` |
| Hosted | Genter Cloud, `https://genter.ai/api/mcp`, streamable HTTP, signs in with OAuth |
| Claude Desktop | `genter.mcpb`, attached to each GitHub release by `.github/workflows/release.yml` |
| Registry name | `io.github.Genterai/genter` (`server.json`; `mcpName` in `package.json`) |

Config to paste where a site asks for one:

```json
{ "mcpServers": { "genter": { "command": "npx", "args": ["-y", "genter-cli", "mcp"] } } }
```

```json
{ "mcpServers": { "genter-cloud": { "url": "https://genter.ai/api/mcp" } } }
```

## Before the first listing

1. **A release that carries them.** After the version is raised in `package.json`, `node .github/scripts/versions.mjs`
   writes it into `server.json` (twice) and `manifest.json`, and a test fails when they differ. The release workflow
   then publishes `genter-cli@<version>` to npm and attaches `genter.mcpb`. Check both:

   ```bash
   npm view genter-cli@<version> mcpName      # io.github.Genterai/genter
   gh release view v<version> --json assets --jq '.assets[].name'      # includes genter.mcpb
   ```

   The registry reads `mcpName` from the package it names, so `0.3.1` (published before this field) cannot be listed;
   the first listable version is the first one released after `mcpName` was added.
2. **Genter Cloud answers a client with no token the way listings expect:** `401` with OAuth discovery, not `403`.
   Smithery says a scan that gets `403` fails.
3. **`genter.mcpb` installs on a Mac and on a Windows PC** (the plan's proof for step 1.8, recorded): open the file in
   Claude Desktop, choose a folder, ask a question the folder answers, and check that a replaced document is marked.
   Not done yet; it needs those two computers.

## 1. The official MCP Registry (first: others copy from it)

Source: <https://modelcontextprotocol.io/registry/quickstart>, `/authentication`, `/package-types`, `/remote-servers`,
`/github-actions`, and the registry's source (`internal/api/handlers/v0/auth`). The registry is in preview.

**The name.** GitHub sign-in grants `io.github.<owner>/*`, and the match is a case-sensitive prefix on the owner as
GitHub writes it. The organization is `Genterai`, so the name is `io.github.Genterai/genter`, with that capital G: all
90 entries of a sample of the live registry have a namespace spelled exactly like their repository's owner. If the
publish answers "You do not have permission to publish this server", the spelling of the owner is the first thing to
check, and a change of it means a new npm release (`mcpName` must equal the name).

**What `server.json` says.** One entry with two ways in, as the registry allows: the npm package (`genter-cli`, stdio,
`npx genter-cli mcp`) and the hosted URL (`https://genter.ai/api/mcp`, streamable HTTP). It holds no token and no
private URL: a client signs in to the hosted URL with OAuth. The schema is
<https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json>; the description is at most 100
characters and the version is a specific one, never a range.

**By hand, once per release:**

```bash
brew install mcp-publisher        # or the curl line on the quickstart page
git switch --detach v<version>    # server.json as released
mcp-publisher login github        # open https://github.com/login/device, enter the code, sign in as @dangenter
mcp-publisher publish
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.Genterai/genter"
```

Signing in as a user gives the organization's namespace only to an Owner of the organization with an active
membership (a plain member is refused).

**In CI, later** (not enabled: it would be a job in `release.yml`, because a tag made with the run's own token starts
no other workflow, so the registry's own `on: push: tags` example would never fire). GitHub OIDC needs no secret; the
run is granted `io.github.Genterai/*`:

```yaml
  registry:
    needs: release
    runs-on: ubuntu-latest
    permissions: { id-token: write, contents: read }
    steps:
      - uses: actions/checkout@v7
      - name: mcp-publisher
        # Pin the release you have read: replace latest/download with download/<tag>, and check its checksum.
        run: curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_linux_amd64.tar.gz" | tar xz mcp-publisher
      - name: npm has this version (the registry reads mcpName from it)
        run: |
          v="$(node -p 'require("./package.json").version')"
          for i in 1 2 3 4 5 6; do npm view "genter-cli@$v" mcpName | grep -qx 'io.github.Genterai/genter' && exit 0; sleep 20; done; exit 1
      - run: ./mcp-publisher login github-oidc
      - run: ./mcp-publisher publish
```

## 2. Glama

Source: <https://glama.ai/blog/2025-07-08-what-is-glamajson>; a newer claim flow exists (sign in to Glama, then verify by
GitHub, an HTTP file or DNS), so follow the Claim ownership page of the listing if it differs.

Glama indexes public GitHub repositories on its own. An organization's repository cannot be claimed by GitHub sign-in
alone; it needs `glama.json` at the root, which is in this repository (`maintainers`: `dangenter`). Steps: find the
listing for `Genterai/genter` on <https://glama.ai/mcp/servers> (use Add Server if it is not there), choose Claim
ownership, sign in with GitHub as `dangenter`. Run the claim again after any change to `glama.json`.

## 3. Smithery

Source: <https://smithery.ai/docs/build/publish>.

- **Hosted (Genter Cloud):** open <https://smithery.ai/new>, enter `https://genter.ai/api/mcp`, follow the flow. It
  needs streamable HTTP and OAuth, and registers its own client. Smithery scans the server: allow the user agent
  `SmitheryBot/1.0` through any bot protection, answer an unsigned request with `401`, or serve a static
  `/.well-known/mcp/server-card.json`. Smithery's gateway proxies the requests to the URL, so a person who connects
  through Smithery goes through Smithery; say so in the description if it matters.
- **Local (the extension):** `smithery mcp publish ./genter.mcpb -n genterai/genter` with the file from the GitHub
  release. The command's flags were read in the docs, not run.

After publishing, the Settings → Verification checklist on Smithery is the owner's.

## 4. PulseMCP

Source: <https://www.pulsemcp.com/submit>, read: submissions are paused ("not accepting new server or client
listings"), and it says it will pick up entries of the official registry automatically once it is back. Nothing to do
except list on the official registry, and look at the page again at launch.

## 5. mcp.so

Not read: <https://mcp.so> and <https://mcp.so/submit> answered `403` to an automated request. The site has a Submit
page for a server; sign in with GitHub and paste what it asks for: the type (MCP server), the name `Genter`, the
repository <https://github.com/Genterai/genter>, the one line above and the local config above. Check the form's
fields as they are on the day, and do not use an undocumented endpoint.

## 6. cursor.directory

Not read: <https://cursor.directory> answered `429` to an automated request. Cursor's docs point to it for community
MCP servers and plugins. Sign in, use its add or submit control for an MCP server, and paste the same things as above.
The README's "Add to Cursor" button is a separate thing: a Cursor install link, made in the README step.

## Claude Desktop and Claude's directory

Read <https://claude.com/docs/connectors/building/submission> and `/mcpb`: desktop extension listings in Claude's
directory are deprecated, and it no longer accepts MCPB submissions. People install `genter.mcpb` themselves: double-click
the file, drag it into Claude Desktop, or Settings → Extensions → Advanced settings → Install Extension. The directory
takes a remote server through <https://claude.ai/directory/manage> (choose MCP connector: the hosted URL, which needs
OAuth, a privacy policy, a documentation URL and a test account; plan step 2.2, in Genter Cloud's repository), or a
plugin that includes the local server (plan step 1.4, `plugins/genter`; see Submit a plugin in the same docs).

An icon makes the extension easier to find in Claude Desktop (`icon.png`, 512×512 with transparency recommended, in the
manifest's `icon`); it waits for the Genter mark that TRADEMARKS.md covers.
