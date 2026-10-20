# What is open here, and what Genter Cloud keeps

Genter has two parts. This repository is the open one, under Apache-2.0. Genter Cloud is the hosted service built on
it, run by the owner, and its own code is private. This page draws the line in general words, so that a contributor knows
where their work goes and a user knows what they are running. The promises that go with it are in
[STEWARDSHIP.md](STEWARDSHIP.md).

## Open, here

- **The engine:** reading folders, files, websites and notes; ranking; what a document says about itself (replaced,
  deprecated, archived) and the marks made from it; the freshness facts.
- **The ways to run it for yourself:** the `genter` command, the local MCP server, and, as it ships, a server for a small
  team that mounts repositories.
- **What makes it yours to extend:** readers for text formats, language rules and the schema they follow; the installers
  that add Genter to AI tools; the Claude Code plugin and skill; the registry entry and the Claude Desktop extension.
- **The contract:** the two tools every form of Genter speaks (`search` and `read`), the marks' format, and the
  conformance test that "works with Genter" refers to ([TRADEMARKS.md](TRADEMARKS.md)).
- **The proof:** the benchmarks (DriftBench, the old-answer test), their corpora and their arms, so that a number in the
  README can be reproduced.
- **The rules of the project:** the red lines and briefs in [`harden/`](harden), the tests, the CI.

## Private, in Genter Cloud

- **The SQL store:** how a team's places, statements and marks are kept and queried at scale.
- **Connectors and their orchestration:** the connections to other people's apps, the credentials held for people, and
  the scheduling and paging of reads.
- **The access engine:** who may read what, as it runs in the hosted service: accounts, shares, groups and the switches
  that turn a source off.
- **The agent:** Genter's own agent, which works in people's apps for them.
- **Notifiers and the queue:** how people are told, and the background work behind it.
- **Billing and plans,** when there are any, and **operations:** deployment, monitoring, keys and abuse handling.

The access engine's code is private; the promise about it is public: who may read what, shares and source switches are
never paid for, wherever they exist (promise 5 of [STEWARDSHIP.md](STEWARDSHIP.md)).

## How they meet

- **Genter Cloud imports the open code** from npm, at an exact version that a person has reviewed: the ranking, the rules
  that decide what is marked, readers that have been verified and pinned, and the conformance test. It does not import
  the MCP handler, anything that uses the network, or an unreviewed manifest.
- **Fixes land here first.** A shared rule is fixed in this repository and reaches the cloud with its next reviewed
  version bump.
- **Nothing private comes back.** The cloud's code, data, traces and fixtures are not copied into this repository, and
  briefs, pull requests and commit messages here do not quote them.
- **Nothing that is open moves into the cloud's private code** (promise 1 of STEWARDSHIP.md). If part of the cloud is
  ever opened, it is opened as a new tree with its license announced first (promise 7), and its history stays private.

CODEOWNERS asks the owner to review any change to the files the cloud imports.
