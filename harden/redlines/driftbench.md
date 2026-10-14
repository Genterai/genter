# DriftBench

Intent: a public benchmark shows whether a memory or retrieval system answers current facts after its documents
change, with nobody telling it — success: the weekly run reproduces the README's numbers, and genter answers no
stale fact.
Sources: quality/driftbench.md on the legacy branch of Genterai/specs (archive); `bench/drift/`,
`.github/workflows/bench.yml`.

Most weight: [readme-generated] and [scheduled-run]: a published number nobody can reproduce is worse than none.

## Red lines

### The dataset and the arms

* **[checked]** The dataset is consistent (`bench/drift/check.mjs`).
* **[offline]** With no key, genter answers no stale fact after the edits and beats an index built once.
* **[arm-index-resynced]** An index re-synced every 15 and every 60 minutes is an arm: stale until it re-syncs, then
  ranked as genter.
* **[over-time]** Over time (1 to 120 minutes after an edit) genter is current at every time, its numbers the same at
  each.
* **[takes]** What genter takes is measured: packages, network, model calls, time to the first answer, search time.
* **[takes-store-checked]** The store is checked: no line of the docs' text is kept, the headings are.

### What is published

* **[approach-labels]** Public tables name a baseline by its approach; only the full report names its package, as
  methodology.
* **[readme-generated]** The README's tables come from a run.
* **[scheduled-run]** A run every week and on demand; a run worse than the README fails the guard.
