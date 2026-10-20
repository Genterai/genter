# Stewardship

What we promise about the open code in this repository, written down so you can hold us to it.

Genter's engine is Apache-2.0 ([LICENSE](LICENSE)). It has been since 2026-10-09 (commit `b91be02`); the commits before
that were published under the PolyForm Noncommercial License. Genter Cloud is a hosted service that runs on top of this
code, and is where anything paid will live; [ip-boundary.md](ip-boundary.md) says what is open and what is not.

## The promises

1. **No feature moves from open to paid.** What the code here does in the open stays in the open, under the license it
   was published under. Something paid may be built around it; nothing is taken out of it to be sold back.
2. **No artificial limits in the open code.** No counter, cap, delay or reminder exists here to sell something. A limit
   that protects a person or their machine (how much of a file is read, how long a pattern may run) is engineering, not
   a limit to buy, and is written in [`harden/redlines/`](harden/redlines) where anyone can read it.
3. **Installing needs no account.** `npx genter-cli`, the Claude Code plugin and the Claude Desktop extension work with
   no sign-up, no key and no call to us.
4. **Nothing you run sends data.** The command, the local MCP server, the plugin, the extension and anything else
   published here send nothing to Genter or to anyone, not even a count or an opt-in ping. What leaves your computer is
   what you choose: a website you add is fetched, and with `--semantic` the passages to rank go to the embeddings
   provider you picked ([SECURITY.md](SECURITY.md) lists it all). Genter Cloud is a separate service you sign in to, with
   its own privacy policy; this promise is about what you run yourself.
5. **Access rules, shares and source switches are never paid.** Who may read what, sharing, and switching a source off
   stay free wherever they exist, here or in Genter Cloud. Paying, when there is something to pay for, is for not having
   to run it yourself.
6. **README numbers reproduce with the open code.** Every number the README gives for answers is made by code in this
   repository, and one command rebuilds its table, losses included. A number from Genter Cloud is labeled as the
   cloud's.
7. **The server's license is announced before it opens.** If a full server is ever published here, its license is
   announced before its first commit appears, the default being Apache-2.0. What is public today stays Apache-2.0
   whatever that license is: a grant already made is not taken back.

## Contributions

Contributions come in under Apache-2.0 with a sign-off ([DCO](https://developercertificate.org), `git commit -s`) and no
CLA, so there is no assignment of your copyright and no lever to relicense what you wrote. See
[CONTRIBUTING.md](CONTRIBUTING.md) and [GOVERNANCE.md](GOVERNANCE.md).

## What is not promised

Genter Cloud is a service. It may have plans, prices and published limits, and it can change. The name Genter is not
free to use for a fork or a hosted copy ([TRADEMARKS.md](TRADEMARKS.md)); the code is.

## How these are kept

This file is a red line of the repository (`harden/redlines/community.md`, `[stewardship]`): a test fails when a promise
leaves it, and a change to it is a brief and the owner's review ([CODEOWNERS](.github/CODEOWNERS)), not a quiet edit.
