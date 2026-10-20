# Governance

## Who decides

**The owner decides.** Genter has one owner, Dan Genter ([@dangenter](https://github.com/dangenter)), who decides what
the project does, what its core keeps, and what is released. The project is a benevolent-dictator project: he listens,
decides, and says why in the issue or pull request. He also runs Genter Cloud, the hosted service built on this code
([ip-boundary.md](ip-boundary.md)).

**Maintainers keep a surface.** A maintainer reviews and merges changes to one part of the project, and is named in
[`.github/CODEOWNERS`](.github/CODEOWNERS), the file GitHub uses to ask for their review. Today the owner keeps every
surface; this table is where that changes:

| Surface | What it is | Kept by |
| -- | -- | -- |
| Core | the engine, its marks and ranking, the MCP contract, security, the reader schema, releases | the owner |
| Installers and plugin | `src/install/`, `plugins/`, `skills/`, the registry entry and the extension | the owner |
| Readers | `readers/<name>/`: one reader, its fixtures and what they give | the reader's `owner` in its `reader.json`; the owner for the first-party ones |
| Language rules | `rules/<lang>.json` | the owner; a native reviewer per language when one volunteers |
| Benchmarks | `bench/`: DriftBench, the old-answer test, their arms | the owner |
| Docs and translations | the README and `docs/`, in each language | a native reviewer per language |

**Becoming a maintainer.** After a few merged changes to a surface, the owner may ask you to keep it, or you may ask in
an issue. It is a pull request that adds you to CODEOWNERS for that surface, and the owner approves it. You can step down
the same way. Someone who is gone for a long time is thanked and removed.

## How a change is decided

- **Core changes** go through a brief and the red lines in [`harden/`](harden): what must stay true is written first, a
  change that someone can observe says so in its brief, and a question that only the owner can answer waits for him.
  A core pull request links an accepted issue or a brief, whoever or whatever wrote it.
- **Readers and language rules** are data, and CI is their brief: a pull request that passes `genter reader check` and the
  `readers` workflow is reviewed for its fixtures and merged without one.
- **Disagreement.** Argue in the issue. If it does not settle, the owner decides, in writing.

[STEWARDSHIP.md](STEWARDSHIP.md) holds what the project promises about its open code; a change to it, to this file, to
[TRADEMARKS.md](TRADEMARKS.md) or to CODEOWNERS is the owner's alone.

## What keeps the rules

By machine: the `test`, `harden`, `readers`, `secrets` and `dco` checks. By a person: CODEOWNERS, for the files it lists.
Making those checks required on `main`, and turning on "Require review from Code Owners" for it, are settings of the
repository that the owner switches on; the files here cannot show them. While the owner is the only code owner, GitHub
does not count a pull request author's own approval, so a pull request opened from the owner's account (by the owner, or
by an agent working for them) cannot satisfy that rule: it needs "Allow specified actors to bypass" for the owner, or
such pull requests are opened from another account. The owner decides which.

## No foundation, for now

The project has no foundation and no board. A foundation is a thing to decide when the project is big enough to need one,
not before. When Genter Cloud has revenue, this file will say where it goes.
