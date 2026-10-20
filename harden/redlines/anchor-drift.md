# Anchor drift

Intent: next to a result, Genter states facts about how fresh its source is (a mark of being replaced that the source
carries itself, quoted as the source says it, and its age when the answer around it is fresher) and never says whether
a source is right — success: a doc whose top says "Deprecated: replaced by [Deploy v2](deploy-v2.md)" is shown as
`deploy.md says at its top: "Deprecated: replaced by Deploy v2"`, the word "deprecated" in a long doc's tenth paragraph
marks nothing, and a fresh clone's files say no age.
Sources: the anchor-drift spec on the legacy branch of Genterai/specs (archive); `src/drift.js`

Most weight: [top-marks]: a mark that fires on a word in passing would tell an agent that a current doc is old.

## Red lines

* **[top-marks]** A document marks itself as replaced by its own text only in its title or its first four non-empty
  lines, each of at most 200 characters, in a notice form a phrase of the language rules names (`rules/<lang>.json`,
  readers/language-rules): a word inside a sentence about something else ("deprecated API handling",
  `deprecated(x)`) is no mark, a list of documents is never marked by one of them, and a flag `archived`, `deprecated`
  or `obsolete` set to true is a mark.
* **[mark-link]** An address after the mark on its line, or on the next line, is what replaces the document.
* **[facts-on-deviation]** Next to a result Genter says what a replaced place says ([quote-not-verdict]), "address now
  redirects to <address>" for a page that moved, and a source's last change only when it is over a year old and another
  source in the same answer changed lately, both by dates the sources give ([fresh-clone]); when nothing deviates it
  says nothing, and no fact is a verdict.
* **[quote-not-verdict]** A replaced mark is worded as what the place says, quoted from its text read now:
  `<place> says at its top: "<notice>"`, or `at line <n>` for a notice a reader found past its top, the notice in its
  own words without Markdown's signs (a quote's `>`, emphasis, a link's target); Genter never says in its own words
  that a place is old, wrong, replaced or current.
* **[fresh-clone]** The files of a folder written here at one moment (at least five, at least half of the folder, each
  within two seconds of the one before: a fresh clone, a copy, an unpacked archive) have no file date: their times say
  when they arrived, not when anyone changed them. Genter says "file dates unknown (fresh clone)" instead of a date,
  says no age of them and counts none of them as a fresher source beside another; a file changed after the clone keeps
  its own time.
