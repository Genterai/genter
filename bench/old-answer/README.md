# The old-answer test

Genter's promise is "your AI stops quoting the old answer". This test measures it (step 1.7 of Genter's open-source
plan): when a document says of itself that it is replaced, does the first thing an agent finds still come from it, and
does it come unmarked? It asks the same questions of two arms over the same sections, and publishes every loss.

Results: [RESULTS.md](RESULTS.md), written by the run.

## Inputs

| source | questions | the pairs |
| -- | --: | -- |
| [DriftBench](../drift), deprecated kind | 5 | its docs after the edits: an old doc that says at its top "Deprecated: replaced by [new doc]" and keeps its old text, and the new doc; DriftBench's own questions |
| [python/peps](https://github.com/python/peps) at `1317769` | 31 | every PEP whose header says `Superseded-By: <n>`, and PEP n |
| [kubernetes/enhancements](https://github.com/kubernetes/enhancements) at `5b503a7` | 1 | the KEP whose title says "[Replaced by [Bound Service Account Tokens](…)]", and that KEP |
| [jaegertracing/jaeger](https://github.com/jaegertracing/jaeger) at `ca047c7` | 2 | the two RFCs whose status line says a part of them is "superseded by [RFC 0008](…)", and RFC 0008 |

The three archives are the ones the [50-repository gate](../repos) picked, at the commits it read them at, and the pairs
are every replaced document the readers mark there that names what replaces it. For each pair, one question was written
from both documents so that its current answer lives in the replacing document; each names the two documents, the mark
that pairs them and what the replacing document says ([questions.json](questions.json)). They were written by the agent
that built this test and are marked **`reviewed: pending owner`** until a person checks them.

## The two arms

Both arms read the same files (the engine's own listing, `listFolder`) and rank the same sections (the engine's own cut,
`pieces` in `src/anchor.js`) with the same ranking (BM25 from `src/lexical.js`, two sections per file at most), taking the
first five. They differ only in what Genter adds.

| arm | what it is |
| -- | -- |
| plain ranking | what an agent's own grep or ranking finds: the sections in their BM25 order, nothing marked, nothing moved |
| **Genter** | the local engine as shipped, no key: `createLocal().add(folder)`, then `find(question)` for each question. A place whose readers mark it as replaced carries the mark, quoted; and when the mark links a replacing file inside the folder, that file comes first (local-search/current-first) |

## What is counted

A question is scored by place, the document a result comes from: a decision archive's answer is a whole document's
decision, not a string (DriftBench's own report scores the same questions by their answer strings).

| count | a question counts when |
| -- | -- |
| **old answer first** | the first result comes from the replaced document |
| **old answer unmarked in the first five** | a result among the first five comes from the replaced document and carries no replaced mark |
| current answer first | the first result comes from the replacing document |
| current answer in the first five | a result among the first five comes from it |

**Losses** are published in RESULTS.md, one by one with their places and why: every question where Genter puts the old
answer first, leaves it unmarked in its first five, or does worse than plain ranking on any count.

**The plan's decision rule.** If plain ranking already puts the current answer first on 90% or more of the questions,
the local picture (the old answer and the new one, the new one first) is not the lead of the README; RESULTS.md says
which way it went, and beside it what the rule rests on: what each arm puts first (the old answer, the current one or
another document), on how many questions Genter's first result differs from plain ranking's, in all and on the public
archives, and whether Genter's gain there is the order or the marks.

## Running it

```bash
node bench/old-answer/run.mjs              # results/<date>.json and RESULTS.md (~15 s once the archives are fetched)
node bench/old-answer/run.mjs --offline    # DriftBench's deprecated kind only, no network; prints the counts, writes only --out / --md
node bench/old-answer/run.mjs --guard      # fails if Genter leaves the old answer unmarked or does worse than plain ranking
node bench/old-answer/run.mjs --from bench/old-answer/results/2026-10-20.json   # RESULTS.md again, no run
```

The archives are fetched once with `git` from github.com, at the commits in questions.json, into `--cache <dir>` (the
same shallow, sparse checkout as [bench/repos](../repos): the text documents, the same for both arms). There is no model,
no key and no clock in the ranking, so the same commits give the same numbers. The weekly run
([bench.yml](../../.github/workflows/bench.yml)) runs it with `--guard`.

## Limits

- **Marks are per document.** Jaeger's RFC 0002 says only its §5 is superseded; Genter's mark, quoted as written, is on
  the whole document, and RFC 0008 comes first for any question that finds RFC 0002. All three of Jaeger's marks, the
  ones it was picked on included, are such partial status lines (ADR-002 among them, the current home of its MCP
  decision); [the gate's RESULTS.md](../repos/RESULTS.md) quotes them, and a Jaeger launch page waits for the owner's
  review.
- **A mark that names a number.** A PEP's `Superseded-By: 470` names PEP 470, not its file. Genter shows the mark,
  quoted, but cannot bring PEP 470 first; those are its "old answer first" losses.
- **One agent wrote the questions.** Until they are reviewed, read the numbers with that in mind; the pairs come from the
  documents' own marks, not from a judgment.
- **Out of scope here:** memory layers (mem0 and the others) and a real agent with its own grep, with and without Genter.
  They are arms of step 3.5 of the plan, each run in its own recommended configuration.
