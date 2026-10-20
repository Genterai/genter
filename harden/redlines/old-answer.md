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
  no key). They differ only in Genter's marks and in the current answer coming first. A run stops when the engine
  ranked another number of sections than the plain arm; RESULTS.md gives the number per source.
* **[counts]** Each arm is counted per question by the place a result comes from: "old answer first" (the first result
  is the replaced document) and "old answer unmarked in the first five" (a result among the first five comes from it
  and carries no replaced mark), with "current answer first" and "in the first five" beside them, in all and per source.
  A question's current answer is its written current document or any later document reached from it by the archive's
  own explicit replacement marks, the same kind of mark its pair quotes, for every question alike; the old answer is
  the replaced document alone, never current. The later documents are written by hand from the archive (questions.json
  `later`, each with the line of its mark quoted), never computed with Genter's readers; at the pinned commit the run
  checks as plain text that each mark's line is in its document, that it names the later document (its path, its file
  name or the last number its path carries) and that the later document is a file there, and stops when one is not. RESULTS.md gives the current answer's counts
  both ways, as written (the written current document alone) and with the chain, says the rule was set after a run
  showed one question affected, and names every question the chain takes out of the losses; the losses, the decision
  rule and `--guard` use the chain.
* **[losses-published]** RESULTS.md lists every question where Genter puts the old answer first, leaves it unmarked in
  its first five, or does worse than plain ranking on any count, each with its two documents, Genter's first five and
  why.
* **[decision-rule]** RESULTS.md states the plan's decision rule: when plain ranking already puts the current answer
  first on 90% or more of the questions, the local picture is not the lead. Beside it, what the rule rests on: what each
  arm puts first (the old answer, the current one, another document), on how many questions Genter's first result
  differs from plain ranking's, in all and on the public archives, and whether Genter's gain there is the order or the
  marks.
* **[questions-reviewed]** Each archive question names its public archive at a pinned commit (the commit the readers
  read it at), its replaced and its replacing document, the mark that pairs them, what the replacing document says,
  where the replacing document is itself replaced the later documents of that chain in order (`later`, [counts]), and
  who reviewed it ("pending owner" until a person does); DriftBench's deprecated kind is taken as DriftBench has it.
  Memory layers and a real agent are not arms here (step 3.5 of the plan), and RESULTS.md says so.
* **[one-command]** `node bench/old-answer/run.mjs` writes RESULTS.md and results/<date>.json from the sources alone; the
  same commits give the same numbers (no model, no key, no clock in the ranking); `--offline` writes only the files it
  is given (`--out`, `--md`), never the published ones; `--before <an earlier run>` puts that run's totals and what each
  arm put first on each question beside this run's, a question whose current answer was corrected since said so;
  `--from <results>` writes RESULTS.md again from a results file without a run, and refuses one written before the
  chain rule ([counts]), writing nothing. Only
  public repositories are fetched, from github.com with git, nothing fetched is run, and the bench uses Node's built-ins
  only.
* **[never-worse]** Genter never leaves the old answer unmarked in its first five and is worse than plain ranking on no
  question, the current answer counted with its chain ([counts]); with `--guard`, the weekly run (`bench.yml`) fails on
  any loss RESULTS.md lists (these, or the old answer first), and passes when it lists none.
* **[repos-gate]** The 50-repository gate runs the readers over public repositories picked by the rule in
  `bench/repos/candidates.json`, written before any count and checked only for whether the records named are in the
  tree, each pinned at a commit, in two samples: the first 50 (`repos.json`), which the readers were widened looking
  at, and a held-out sample (`heldout.json`) picked by the same rule (the same groups, kinds, minimum stars, takes and
  checks) from repositories none of the first 50, committed with its commits before any reader ran on it; a group whose
  candidates pass fewer times than its take takes fewer, and RESULTS.md says how many. The gate's verdict (the median
  repository has 5 or more decision records, and 15 repositories an explicit replaced mark) is judged on the held-out
  sample alone; the first 50 are shown beside it, said to be biased. RESULTS.md gives, for each sample and per
  repository, the decision records read, the records in the tree, the replaced, named and linked marks and the dated
  documents, the repositories with a mark of each kind (the gate counts every kind, from every reader, as the readers
  read it), what the readers miss, and the three archives the stated rule picks, with each picked archive's documents
  that a fallback reader alone marked, quoted.
