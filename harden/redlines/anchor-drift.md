# Anchor drift

Intent: next to a result, Genter states facts about how fresh its source is (a mark of being replaced that the source
carries itself, and its age when the answer around it is fresher) and never says whether a source is right — success: a
doc whose top says "Deprecated: replaced by [Deploy v2](deploy-v2.md)" is shown as "marked as replaced: <place>", and
the word "deprecated" in a long doc's tenth paragraph marks nothing.
Sources: the anchor-drift spec on the legacy branch of Genterai/specs (archive); `src/drift.js`

Most weight: [top-marks]: a mark that fires on a word in passing would tell an agent that a current doc is old.

## Red lines

* **[top-marks]** A document marks itself as replaced by its own text only in its title or its first four non-empty
  lines, each of at most 200 characters, in a notice form a phrase of the language rules names (`rules/<lang>.json`,
  readers/language-rules): a word inside a sentence about something else ("deprecated API handling",
  `deprecated(x)`) is no mark, a list of documents is never marked by one of them, and a flag `archived`, `deprecated`
  or `obsolete` set to true is a mark.
* **[mark-link]** An address after the mark on its line, or on the next line, is what replaces the document.
* **[facts-on-deviation]** Next to a result Genter says "marked as replaced: <place>" or "marked as <marker> in its
  own text", "address now redirects to <address>" for a page that moved, and a source's last change only when it is
  over a year old and another source in the same answer, or most of its area, changed lately; when nothing deviates
  it says nothing, and no fact is a verdict.
