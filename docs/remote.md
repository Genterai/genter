# Your apps' own MCP servers

Notion, Linear, Atlassian and others run MCP servers of their own. `genter add` takes one by its address as a source of
the project it runs in, next to its folders and websites:

```bash
genter add https://mcp.linear.app/mcp
```

```
genter: https://mcp.linear.app/mcp asks you to sign in. Open this address in your browser; Genter waits 5 minutes for it to come back:

  https://mcp.linear.app/authorize?response_type=code&client_id=…&redirect_uri=http%3A%2F%2F127.0.0.1%3A51234%2Fcallback&…

Added https://mcp.linear.app/mcp (Linear (mcp.linear.app)): 87 documents (87 new, 0 changed, 0 gone); it calls list_issues, list_documents, get_issue, get_document and never its 21 other tools
```

From then on `genter ask` and the `search` tool answer from it too, with the server's name as the place and the
document's own link:

```
[14] Release process v2 › Fridays
  Linear (mcp.linear.app) · https://linear.app/acme/document/release-process-v2-3f2 · mcp · updated 2026-10-03
    No deploys on Fridays: since Oct 3 releases go out Monday to Thursday.
```

This is the open path to your team's apps: no Genter Cloud, no Composio, nothing but your own account at the vendor.

## Signing in

Genter signs in the way MCP's [authorization spec](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
says, as a public client:

1. It asks the address MCP's `initialize`. A server answers 401 with a `WWW-Authenticate: Bearer` header that names its
   [protected resource metadata](https://datatracker.ietf.org/doc/html/rfc9728) (else Genter looks at the well-known
   address). An address whose path ends in `/mcp` or whose host starts with `mcp.` is asked; one that does not answer
   as an MCP server is read as a website, as before.
2. The metadata names the authorization server, whose own
   [metadata](https://datatracker.ietf.org/doc/html/rfc8414) says where to register, sign in and get tokens. Genter
   checks that the metadata is for this server's address, that the authorization server is the one named, that every
   endpoint is https, and that it takes [PKCE](https://datatracker.ietf.org/doc/html/rfc7636) with S256.
3. Genter registers itself there ([dynamic client registration](https://datatracker.ietf.org/doc/html/rfc7591)) with a
   redirect to `http://127.0.0.1:<a free port>/callback`, a loopback address on your computer.
4. It prints the address of the vendor's own sign-in page (with a PKCE challenge, a state, and the server as the
   [resource](https://datatracker.ietf.org/doc/html/rfc8707)). Genter opens no browser: you open it, sign in at the
   vendor, and your browser comes back to Genter, which trades the code for tokens.

Genter only reads, so it never asks for a scope that writes (`write`, `*:write`, `manage`, `admin`…): Linear asks for
`read write` and Genter asks for `read`.

Every address on the way (the server, its metadata, the authorization server, registration, tokens) is fetched only at a
public address, at every hop, connecting to the address checked, as websites are: an address that resolves to your own
network or computer is refused before anything is sent to it.

A server whose authorization server takes no new clients (no dynamic registration) is refused saying so. Some take a
[client ID metadata document](https://datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/) instead;
that needs a document of Genter's own at a stable https address, which it does not have yet.

## Which vendors were checked

Their metadata as it was on 2026-10-20 (each server's address answered MCP's `initialize` with a 401 asking for a
Bearer token; Atlassian's names no metadata in it, so Genter finds it at the well-known address):

| Vendor | Server | Dynamic registration | PKCE S256 | Client metadata document |
| -- | -- | -- | -- | -- |
| Notion | `https://mcp.notion.com/mcp` | yes ([metadata](https://mcp.notion.com/.well-known/oauth-authorization-server)) | yes | yes |
| Linear | `https://mcp.linear.app/mcp` | yes ([metadata](https://mcp.linear.app/.well-known/oauth-authorization-server)) | yes | yes |
| Atlassian (Jira, Confluence) | `https://mcp.atlassian.com/v1/mcp` | yes, at `auth.atlassian.com` ([resource](https://mcp.atlassian.com/.well-known/oauth-protected-resource/v1/mcp), [metadata](https://auth.atlassian.com/.well-known/oauth-authorization-server/VCeDsk8ZHncYF1g234fKtc4lNipbBhu3)); where its resource metadata does not answer, at `mcp.atlassian.com` ([metadata](https://mcp.atlassian.com/.well-known/oauth-authorization-server)) | yes | yes |
| Sentry | `https://mcp.sentry.dev/mcp` | yes ([metadata](https://mcp.sentry.dev/.well-known/oauth-authorization-server)) | yes | yes |
| Asana | `https://mcp.asana.com/mcp` | yes ([metadata](https://mcp.asana.com/.well-known/oauth-authorization-server)) | yes | — |
| Slack | `https://mcp.slack.com/mcp` | no ([metadata](https://mcp.slack.com/.well-known/oauth-authorization-server)): Slack's MCP needs an app your workspace approves | yes | — |

Genter speaks MCP's Streamable HTTP. A server that only offers the older HTTP+SSE transport (an address ending in
`/sse`) is not one Genter can read.

## What Genter calls

Only tools that read, decided from what the server lists in each session:

- never a tool the server marks `readOnlyHint: false` or `destructiveHint: true`;
- never a tool whose name says it changes something: it starts with a verb that writes (`create_issue`,
  `addCommentToJiraIssue`), holds a word that always does (`get_or_create_page`, `find_and_replace`), or joins one with
  and, or, then (`list_and_archive`);
- then a tool the server marks `readOnlyHint: true`, or whose name starts with a verb that reads (`get`, `list`,
  `search`, `fetch`, `read`, `find`, `query`…).

Of those, Genter uses three kinds: a list that needs no input (`list_documents`), a search that takes the question
(`notion-search`), and a read that takes one thing's id (`get_document`, `notion-fetch`). A list or a search is used
only with a read of the same thing (or a read of anything, such as `fetch`), and lists of people, labels or settings
are left out. Resources the server lists are read with `resources/read`.

## What is kept, and what is read again

Nothing the server answers is copied. Each document is an Anchor: one read call with fixed arguments (`get_document
{id: "…"}`, or a resource's address), called again whenever a question may need it. The sealed store keeps which
documents there are, their titles, headings, most frequent words, dates, links and digests; never a line of their text.

At every question Genter asks each server, in a session of its own: its own search with the question, then the
documents whose kept words fit (8 at most), each read now. A document that changed answers as it is now, marked
changed since the last look; one the server says is not found is gone.

## Your sign-in

The tokens are kept in `~/.genter/remote.json`, sealed with the store's secret (AES-256-GCM, a key of their own) and
readable by you only: never in a config file, never printed, never in an answer. Genter refreshes them before they
expire, and once more when the server says they no longer work. `genter forget <address>` drops them once no project
searches the server (revoke Genter's access at the vendor too, in its settings, if you want it gone there).

## When a server fails

A server that is down, slower than 45 seconds, whose sign-in expired, whose search failed, or none of whose documents
could be read is named in the answer, never left out quietly (what it did give still answers):

```
Not searched: Linear (mcp.linear.app) (https://mcp.linear.app/mcp): its sign-in expired or was revoked: run genter add https://mcp.linear.app/mcp in a terminal to sign in again.
```

## Switching one off

Your own `off` list in `~/.genter/config.json` takes addresses too: a server at that address or under it is not asked,
in any project, and what Genter kept of it is dropped.

```json
{ "off": ["https://mcp.linear.app"] }
```

## Limits

- One person: `genter serve` does not serve an MCP server (it is signed in as you, and every token holder of a team's
  server would read it), and an MCP client cannot start a sign-in (`genter_add`, `genter mcp <address>`): you sign in
  from a terminal with `genter add`.
- A listing reads 100 documents at most when the server is added; later ones come through the server's own search, or
  with `genter add <address>` again.
- No vendor has a reader of its own: tools are found by what they are called and what they take.
