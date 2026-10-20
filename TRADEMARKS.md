# Trademarks

The code in this repository is Apache-2.0: copy it, change it, ship it. The name is a different matter, and the Apache
License says so itself (section 6: it grants no permission to use the licensor's names or marks except to describe where
the work comes from).

"Genter", the Genter logo, "Genter Cloud" and genter.ai name the project and the service it runs. This page says how
others may use them; it changes only through a pull request the owner approves.

## Forks rename

If you publish a changed version of Genter as a package, a command, an extension, a container image, a registry entry
or a hosted service, give it a name of its own, and keep "Genter" out of the name, the command and the logo. Say what
it is made from in plain words: "a fork of Genter", "based on Genter".

An unchanged copy may keep the name: a mirror, a distribution's package of a release as it was published, a build from
a tagged release.

## Saying that something works with Genter

You may describe what you built in plain words: "reads Genter's decisions page", "a reader for Genter". Do not make the
name look like yours or like ours.

**"Works with Genter"** (also "Genter compatible" and the like) is for an MCP server or client that passes
`genter-cli/conformance`, the test of the contract every form of Genter speaks (two tools, `search` and `read`, places
named by number, marks in one format). Run it against yours:

```js
import { conformance } from "genter-cli/conformance";

// send(request) sends one JSON-RPC request to your server and resolves to its response.
const report = await conformance(send, { query: "<a question your places answer>", mark: true });
console.log(report.ok, report.checks);
```

Say which version of Genter it was run against, and keep the claim only while it passes. Genter's own tests run it
against `genter mcp`.

## Hosted copies

"Genter Cloud" is the service the project runs. A service you run from this code is not Genter Cloud and must not be
called, or look like, Genter Cloud or genter.ai.

## Readers, rules and plugins

A reader, a language rule set or a plugin that works with Genter may be named for what it reads ("adr", "rules for
Spanish"). If you want it in `readers/` with an owner of record, see [CONTRIBUTING.md](CONTRIBUTING.md).

Unsure? Open an issue before you publish.
