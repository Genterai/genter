# Retrieval

Intent: a question finds the anchors that answer it, by meaning and by words, and the strongest fit answers at once
— success: a question asked again in other words reaches the anchor that answered it, on the fast path.
Sources: the retrieval spec on the legacy branch of Genterai/specs (archive); `src/genter.js`, `src/recipe.js`,
`src/lexical.js`.

## Red lines

* **[asked-discount]** A request kept on an anchor counts 0.1 less than its closeness to a new question, so another
  question on the same topic is offered the anchor but stays under the fast path (0.75).

## Open

* The rest of retrieval (thresholds 0.25 / 0.45 / 0.75, translation, candidates) is in the archive's
  `how/retrieval.md`; its lines come in with the next change here.
