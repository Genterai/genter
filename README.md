<p align="center">
  <img src="https://raw.githubusercontent.com/Genterai/genter/main/docs/banner.png" alt="Genter: resolver for AI agents">
</p>

<p align="center">
  An agent works something out once. Genter remembers where the answer is written,<br>
  and next time the agent reads it right there, as it is now.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/genter-cli"><img src="https://img.shields.io/npm/v/genter-cli" alt="npm"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="License: Apache-2.0"></a>
  <img src="https://img.shields.io/badge/dependencies-0-brightgreen" alt="dependencies: 0">
</p>

<p align="center">
  <a href="#quickstart">Quickstart</a> ·
  <a href="#add-it-to-your-project">Add it to your project</a> ·
  <a href="#in-code">In code</a> ·
  <a href="#genter-cloud-your-teams-apps">Genter Cloud</a> ·
  <a href="#benchmarks">Benchmarks</a>
</p>

**An MCP server and a library that give your coding agent the place an answer is written.** Ask in your own words, in
any language. Genter returns the passages that answer, read just now, with the file and lines (`path:lines`) where
each one is written. There is no index to build and nothing to keep in sync, so there is no copy to go stale.

```
$ genter ask "is a test that was skipped counted as proof?" --semantic
  [1] skills/hardening-changes/references/red-line-tests.md:54-77 · Red line tests › Layer 3: the last run proved it
  ## Layer 3: the last run proved it

  A tag that exists does not mean the test ran. Database and browser tests are often skipped without their secrets,
  and then a line covered only by them is not proved at all. `harden proof` reads the junit report of a real run:
  …
  | skipped | every test tagged with it was skipped |
  …
  `harden proof` exits 1 when a line failed; with `--strict`, also when one was only skipped or not run.
```

That is [Genterai/harden](https://github.com/Genterai/harden), a small repository of docs and code. `grep -rn skipped`
returns 13 lines in the docs alone, and the agent has to read them all to work out which one answers. Ranked by words,
Genter returns the code that prints the proof report. Ranked by meaning, it returns the section that answers, with the
place to cite.

## Why Genter

**Your agent stops guessing.** Without a resolver an agent greps for names it guesses and reads whole files, or it
asks you something your docs already answer. With Genter it asks once and gets the 5 passages that answer, each with
the place it is written, ready to cite.

**It never answers from a stale copy.** A RAG index or a memory layer keeps a copy of your docs and answers from it
until someone rebuilds it. Genter keeps where each answer is written and reads that place again at every question.
After 61 edits to a company's docs, an index built once gives the old answer 42% of the time. Genter gives it 0% of the
time ([DriftBench](#benchmarks)).

**It is small.** No dependencies, and no server to run. 200 files are taken in within 0.2 s without calling a model,
and a search takes 3 ms. Without an embeddings key, nothing leaves your computer.

## Quickstart

```bash
npx genter-cli demo                                    # 1. see it work on a temp folder: no key, no install
export OPENAI_API_KEY=sk-...                           # 2. a key for ranking by meaning (or Ollama, below)
npx genter-cli ask "how do we deploy?" --semantic      # 3. ask your folder
claude mcp add genter -e GENTER_SEMANTIC=1 -- npx -y genter-cli mcp   # 4. give it to your agent
```

Your agent now has four tools:

| Tool | What it does |
| -- | -- |
| `genter_find` | finds the passages that answer, reads them now, and returns each with its `path:lines` and what changed since the last look |
| `genter_add` | adds a folder, a file or a website (a sibling repository, a vendor's API docs) |
| `genter_remember` | keeps a note (a decision, a convention) that it finds later, with the note's date |
| `genter_sources` | lists what is searched |

## Choose how you run it

| | Words | **Meaning** (recommended) | Genter Cloud |
| -- | -- | -- | -- |
| **Best for** | a quick look, an offline machine | an agent working in a repository every day | a team whose answers also live in tickets, chats and mail |
| **Setup** | `npx genter-cli mcp` | `--semantic` (or `GENTER_SEMANTIC=1`) and an embeddings key, or Ollama | `genter login <token>` on top of either |
| **Finds** | questions asked in the docs' own words | other words, other languages | + GitHub, Linear, Slack, Gmail, Notion and 500 more apps |
| **DriftBench, current answers** | 77% | **88%** | |
| **Leaves your computer** | nothing | the ranked passages go to the embeddings provider (with Ollama, nothing) | your question goes to your workspace |
| **Price** | free | free + your provider's embeddings | [plans](https://genter.ai) |

If you are just looking, the demo and words are enough. If an agent works in your repository every day, use meaning.
If you are a team, add Genter Cloud.

## Add it to your project

### An existing repository

Commit two files, and every agent on the team asks Genter before it guesses:
[`examples/project/`](examples/project).

```bash
cd your-repo
curl -fsSLO https://raw.githubusercontent.com/Genterai/genter/main/examples/project/.mcp.json
curl -fsSL https://raw.githubusercontent.com/Genterai/genter/main/examples/project/AGENTS.md >> AGENTS.md
```

`.mcp.json` starts `genter-cli mcp .` for Claude Code with ranking by meaning on. It uses the first embeddings key the
person has set, and without one it ranks by words. `AGENTS.md` tells the agent to call `genter_find` first and to cite
`path:lines`.

What changes:

| | Without Genter | With Genter |
| -- | -- | -- |
| "where do we check who may see an invoice?" | the agent greps `invoice`, `permission`, `canView`… and reads ten files | one `genter_find`, which returns 5 passages with `path:lines` |
| a question your docs answer | it reaches you | the agent answers it, citing the doc |
| a doc edited an hour ago | an index answers with the old text | the new text, marked *changed since the last look* |
| a page replaced by a newer one | both look equally true | the old page says *marked as replaced*, and the new one comes right after it |
| a decision made in chat | lost after the session | `genter_remember`, found later with its date |

### A new project

Start with the same two files and a `docs/` folder. Write each decision where it is made (`docs/decisions.md`, one
heading per decision, with a date). When a page is replaced, mark the old one
`> Deprecated: replaced by [v2](v2.md)`. From the first day the agent finds all of it by meaning, and nothing needs to
be re-indexed as the project grows.

### Other MCP clients

Cursor, Windsurf, Codex, VS Code or any MCP client:

```json
{ "mcpServers": { "genter": { "command": "npx", "args": ["-y", "genter-cli", "mcp", "."], "env": { "GENTER_SEMANTIC": "1" } } } }
```

## In code

No dependencies. A docs assistant that answers from your folder and cites the file and lines of each fact, in full in
[`examples/answer-with-sources.mjs`](examples/answer-with-sources.mjs):

```js
import { createLocal, embedderFor, embeddingProvider } from "genter-cli/local";

const genter = createLocal({ embed: embedderFor(embeddingProvider()) }); // meaning: the first key set, else Ollama
await genter.add("./docs");

const { results, changes } = await genter.find("how do we deploy to staging?", { limit: 5 });
// results: [{ ref: 1, place: "docs/deploy.md:3-5", headings: ["Deploy", "Staging"], text, facts: ["changed since the last look"] }]

const context = results.map((r) => `[${r.ref}] ${r.place}\n${r.text}`).join("\n\n");
// → your model: "Answer only from the passages. Cite each fact as [n]."
```

```bash
npm i genter-cli
OPENAI_API_KEY=sk-... node examples/answer-with-sources.mjs ./docs "how do we deploy to staging?"
```

Each call reads the files again, so the assistant answers from what the docs say now, even if they were edited a
minute ago.

## Ranking by meaning

Ranking by words finds a question asked in the docs' own words. `--semantic` also ranks by meaning and fuses the two
rankings. On DriftBench, current answers go from 77% to 88%. Russian questions about English docs go from 1 of 6 to 5
of 6. A passage is embedded once and its vector kept in the sealed store; later questions embed only the question and what changed.

The passages go to the provider you pick:

| Provider | Set |
| -- | -- |
| OpenAI | `OPENAI_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |
| Vercel AI Gateway | `AI_GATEWAY_API_KEY` or `AI_GATEWAY_TOKEN` (free tier: `GENTER_EMBED_MODEL=google/gemini-embedding-001`) |
| Ollama, on your computer (nothing leaves it) | nothing: `ollama pull nomic-embed-text` |
| Any OpenAI-compatible endpoint | `GENTER_EMBED_URL`, `GENTER_EMBED_KEY`, `GENTER_EMBED_MODEL` |

Genter uses the first key it finds; `--provider openai|openrouter|vercel|ollama` picks one. If the provider fails, Genter
ranks by words (`genter ask` says why).

## Genter Cloud: your team's apps

Why something works the way it does is rarely written in code. It is in a ticket, a Slack thread or an email.
[Genter Cloud](https://genter.ai) connects your apps and keeps their Anchors current as their own events come in. The
same `genter ask` and `genter_find` then search your folders first, then your apps.

1. Sign up at [genter.ai](https://genter.ai) and connect your apps: GitHub, Linear, Slack, Gmail, Notion, Google Drive
   and 500 more.
2. Make a token in Settings → API tokens.
3. Sign in once:

   ```bash
   npx genter-cli login gnt_...
   ```

4. Ask as before:

   ```bash
   genter ask "why do invites never reach shared apps?"     # your repository first, then the ticket and the thread
   genter ask "what did Anna say about the contract?" --cloud   # only your apps
   ```

`genter mcp` finds in both too, and `--local` skips the cloud. In a team's `.mcp.json`, the `GENTER_TOKEN` line passes
each person's own token, so everyone searches only what their own Genter Cloud account can see. Cloud also gives each
agent its own MCP URL with `search` and `read` that any MCP client can use without genter-cli.

| | `genter-cli` | + Genter Cloud |
| -- | -- | -- |
| Sources | folders, files, websites, notes | + 500 apps |
| Kept current | read again at every question | + every event in an app rechecks the Anchors it touches |
| Ranking | words; meaning with your key | meaning, plus summaries and keywords written by a model, in any language |
| People | you | a team: roles, an MCP address per agent, a call log |
| Price | free, Apache-2.0 | [plans](https://genter.ai) |

## With harden

[harden](https://github.com/Genterai/harden) has the agent write a brief before code: what the change is for, where
the truth lives and what must not break. Its Claude Code plugin brings Genter with it. Before the agent asks the owner
a question, it searches with `genter_find`, and a question the code or the docs already answer becomes a Source in the
brief instead of reaching the owner. With Genter Cloud connected, the decision behind the code (a ticket, a thread)
becomes a Source too.

## How it resolves, and why it stays current

- Each file or page is an **Anchor**: one read with a fixed argument (`FILE_READ docs/deploy.md`). Genter keeps where
  it is, its headings, its dates and a digest of it, never a copy of its text.
- Every question reads the sources again. A changed file is answered from its new text, marked *changed since the last
  look*. A deleted file is *gone* and answers nothing. A file marked `Deprecated: replaced by [v2](v2.md)` brings v2
  right after it.
- Taking a folder in calls no model: 200 files in 0.2 s. Without an embeddings key, nothing leaves your computer.

```bash
npx genter-cli demo     # a doc is edited and nobody tells Genter: the next answer is the new one
```

## Benchmarks

**[DriftBench](bench/drift)** uses the docs of a 40-person company, 61 edits over two months, and the same 65 questions
asked before and after the edits, taking the top 5 passages. The run itself writes the tables below; they are not
written by hand.

<!-- driftbench:start -->
| | needs | before the edits | after the edits: current answer | after the edits: stale answer |
| -- | -- | -- | -- | -- |
| **genter** | nothing | 80% | **77%** (89% of the changed facts) | **0%** |
| an index built once, same ranking | nothing | 80% | 34% (11% of the changed facts) | 42% |
| **genter --semantic** | an embeddings key | 92% | **88%** (92% of the changed facts) | **0%** |
| an index built once + vectors | an embeddings key | 92% | 42% (8% of the changed facts) | 43% |
| a memory that extracts facts with a model, docs not added again | an LLM key, 34 packages, 277 LLM calls to take the docs in | 75% | 40% (11% of the changed facts) | 32% |
| the same memory, every edited file deleted from it and added again | an LLM key, 34 packages, 277 LLM calls to take the docs in, 320 more to add the edited files again | 75% | 75% (75% of the changed facts) | 3% |

**Over time.** The same 61 edits land one by one, 2 to 30 minutes apart; each of the 36 changed facts is asked again some time after its edit. An index re-synced every N minutes is genter's own search over a copy of the docs taken every N minutes. Current answer · stale answer (5 seeded timelines):

| time since the edit | 1 min | 5 min | 15 min | 30 min | 1 h | 2 h |
| -- | -- | -- | -- | -- | -- | -- |
| **genter**, reading the docs at each question | **89% · 0%** | **89% · 0%** | **89% · 0%** | **89% · 0%** | **89% · 0%** | **89% · 0%** |
| an index re-synced every 15 minutes, same ranking | 20% · 55% | 41% · 37% | 89% · 0% | 89% · 0% | 89% · 0% | 89% · 0% |
| an index re-synced every 60 minutes, same ranking | 13% · 69% | 18% · 64% | 29% · 52% | 54% · 30% | 89% · 0% | 89% · 0% |

**What it takes**, measured by `bench/drift/takes.mjs` (Node v22.22.0, linux x64). The store keeps each file's place, title, headings, dates, size and a digest of its text, sealed: 38155 bytes for 96396 bytes of docs.

| | **genter** | a memory that extracts facts with a model |
| -- | -- | -- |
| packages installed with it | **0** | 34 |
| model calls to take the docs in | **0** | 277 |
| network connections · servers started | **0 · 0** | a model provider's API on every add and search |
| from a cold start to the first answer (34 docs) | **184 ms** | 14 min to take the docs in |
| median search | **3 ms** | 288 ms |
| of the docs' text, it keeps | **0 of 1065 lines of body text (0 bytes); its headings** | 569 facts written by its model |

[Results, 2026-10-10](bench/drift/results/2026-10-10.md).
<!-- driftbench:end -->

**Reproduce it.** You need no key, no account and nothing to install. A fresh run on a GitHub runner every week
([bench.yml](.github/workflows/bench.yml)) fails if genter answers anything stale:

```bash
npx genter-cli demo                                   # see it on a temp folder
git clone https://github.com/Genterai/genter && cd genter
npm run bench                                         # the tables above, except the rows that need a key: ~30 s
node bench/drift/takes.mjs                            # what it takes, alone
```

**[LoCoMo and LongMemEval](bench/convo)** are the conversational-memory benchmarks. They measure whether the evidence
is among the passages Genter finds. Words only, no key, no model.

| | questions | evidence in the top 5 | all of it in the top 5 | a search |
| -- | -- | -- | -- | -- |
| LoCoMo | 1,536 | 84.5% | 72.0% | 3 ms |
| LongMemEval-S | 470 | 96.6% | 82.3% (knowledge updates: 98.6%) | 110 ms |

This measures retrieval, which is Genter's own job. To judge answers with each benchmark's own prompt (the numbers
memory layers publish), run `node bench/convo/run.mjs --answer` with a key. [Results](bench/convo/results/2026-10-09.md).

## Commands

| | |
| -- | -- |
| `genter demo` | see it work on a temp folder |
| `genter ask <question>` | the passages that answer, read now (the first time, the current folder) |
| `genter add <folder\|file\|url> ...` | search these from now on |
| `genter remember <text>` | keep a note in `~/.genter/notes.md`; edit it as you like |
| `genter sources` · `genter forget <...>` | list what is searched; stop searching one |
| `genter mcp [folder\|url ...]` | all of it for your agent, over stdio |
| `genter login <token>` · `genter logout` | also find in your apps (Genter Cloud) |

`--semantic` ranks by meaning too (or set `GENTER_SEMANTIC=1`); `--json` prints JSON; `--limit N` sets the number of
passages; `--local` and `--cloud` search only this computer or only your apps. Genter never reads hidden files,
`.gitignore`d files, lockfiles, keys, or anything that holds a private key. The store (`~/.genter`, or `GENTER_HOME`) is
sealed with a secret made on the first run.

## More

- [`examples/`](examples): the files that add Genter to a project, and the docs assistant.
- [Your apps on your own Composio keys](docs/apps.md): the agent (`run`, `find`, `write`), the library, the models.
- [The red lines](harden/redlines) genter-cli keeps, and how a change gets in ([harden](harden/README.md)).
- Releases: raise `version` in `package.json` in a pull request. Merging it into `main` publishes it to npm and creates
  the GitHub release.

## License

[Apache-2.0](LICENSE).
