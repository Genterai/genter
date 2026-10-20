# The old-answer test

Intent: anyone can see, on public decision archives and with losses included, whether an agent's own ranking puts a
replaced document first or leaves it unmarked, and whether Genter does — success: `node bench/old-answer/run.mjs`
rebuilds the published tables from public sources at pinned commits, and `node bench/repos/run.mjs` the 50-repository
gate that picks those archives.
Sources: steps 1.7 and 1.10 of Genter's open-source plan; `bench/old-answer/`, `bench/repos/`,
`.github/workflows/bench.yml`.

Most weight: [same-sections] and [losses-published]: a comparison whose arms see different text, or whose losses are
left out, proves nothing.

## Red lines

* **[same-sections]** Two arms read the same files and rank the same sections: the engine's own listing
  (`listFolder`), its own cut (`pieces`, `src/anchor.js`) and its own BM25 with two sections per file, the first five.
  Plain ranking marks nothing and moves nothing; Genter is the local engine as shipped (`createLocal`, `add`, `find`,
  no key). They differ only in Genter's marks and in the current answer coming first.
* **[counts]** Each arm is counted per question by the place a result comes from: "old answer first" (the first result
  is the replaced document) and "old answer unmarked in the first five" (a result among the first five comes from it
  and carries no replaced mark), with "current answer first" and "in the first five" beside them, in all and per source.
* **[losses-published]** RESULTS.md lists every question where Genter puts the old answer first, leaves it unmarked in
  its first five, or does worse than plain ranking on any count, each with its two documents, Genter's first five and
  why.
* **[decision-rule]** RESULTS.md states the plan's decision rule: when plain ranking already puts the current answer
  first on 90% or more of the questions, the local picture is not the lead.
* **[questions-reviewed]** Each archive question names its public archive at a pinned commit (the commit the readers
  read it at), its replaced and its replacing document, the mark that pairs them, what the replacing document says, and
  who reviewed it ("pending owner" until a person does); DriftBench's deprecated kind is taken as DriftBench has it.
  Memory layers and a real agent are not arms here (step 3.5 of the plan), and RESULTS.md says so.
* **[one-command]** `node bench/old-answer/run.mjs` writes RESULTS.md and results/<date>.json from the sources alone; the
  same commits give the same numbers (no model, no key, no clock in the ranking). Only public repositories are fetched,
  from github.com with git, nothing fetched is run, and the bench uses Node's built-ins only.
* **[never-worse]** Genter never leaves the old answer unmarked in its first five and is worse than plain ranking on no
  question; with `--guard`, the weekly run (`bench.yml`) fails otherwise.
* **[repos-gate]** The 50-repository gate runs the readers over 50 public repositories picked by the rule in
  `bench/repos/candidates.json`, written before any count and checked only for whether the records named are in the
  tree, each pinned at a commit (`repos.json`); its RESULTS.md gives, per repository, the decision records read, the
  records in the tree, the replaced, named and linked marks and the dated documents, the gate's verdict (the median
  repository has 5 or more decision records, and 15 of the 50 an explicit replaced mark), what the readers miss, and
  the three archives picked by the stated rule.
