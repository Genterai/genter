# 50 repositories, and a held-out sample: the readers on real archives

A gate before launch (step 1.10 of Genter's open-source plan): the readers (`src/readers.js` and those in
[`readers/`](../../readers)) run over public repositories that keep decision records or deprecation notices, and the
counts are published per repository, with the commit each was read at. **The gate passes when the median repository has
5 or more decision records and 15 repositories have an explicit replaced mark.** If it does not, the plan says the
README's hero leads with the hosted try page. The run also picks the three archives for the launch pages and for the
[old-answer test](../old-answer).

There are two samples. The first 50 ([repos.json](repos.json)) are the ones the gate first ran on, and the readers were
then widened looking at what they missed there, so they are no longer a fair test. The held-out sample
([heldout.json](heldout.json)) was picked by the same rule from repositories none of the first 50, and committed with
its commits before any reader ran on it: **the gate is judged on the held-out sample**, and the first 50 are shown beside
it, biased.

Results: [RESULTS.md](RESULTS.md), written by the run.

## Which 50

The rule, in [candidates.json](candidates.json), was written before any count was taken. Three groups, each a list of
every repository of its kind we could name with the group's minimum of stars (GitHub's count on 2026-10-20), most stars
first; the first `take` of each that pass the group's check are taken. The check looks only at whether the records named
are in the tree at the default branch's tip, never at what the readers find in them.

| group | take | what | check |
| -- | --: | -- | -- |
| Decision archives | 18 | a repository that holds the proposals of a language, framework or protocol (PEPs, RFCs, KEPs, EIPs, BIPs, NIPs, MSCs, design documents, or a tracking list of them), 1,000 stars or more | a file of the records named is in the tree |
| Decision records in a project's own tree | 16 | a well-known project, 1,000 stars or more, with its own ADRs, RFCs, RFDs, design proposals or specs in a folder of its main repository | a record in that folder is in the tree |
| Deprecation notices in a changelog | 16 | a well-known project, 10,000 stars or more, with a CHANGELOG, CHANGES, HISTORY or RELEASES file that says "deprecat" | such a file is in the tree |

`node bench/repos/run.mjs --pick` checks the candidates in order and writes [repos.json](repos.json): the 50, each
pinned at the commit it was checked at. Skipped, with the reason the run printed: deepset-ai/haystack (no
`proposals/text/` at its tip) and django/django (its release notes are `docs/releases/*.txt`, no changelog file). The
first pick had two bugs in the check itself, fixed before any count: Carbon's proposals are named `p000024-…` (the
pattern asked for four digits), and Traefik's changelog is over 1 MB (the check read it with the engine's size limit).

### The held-out sample

The same three groups, takes, kinds, minimum stars and checks (candidates.json, `heldout`), over repositories that are
not among the first 50, picked on 2026-10-20 after the readers had been widened and before any reader ran on them.

| group | take | the candidates |
| -- | --: | -- |
| Decision archives | 18 | every repository of the kind we could name with 1,000 stars or more, found with GitHub's repository search (the queries are in candidates.json) and by hand; the repositories considered and left out as not of the kind (the text of one specification, meeting notes, one proposal's own repository) are listed there with why |
| Decision records in a project's own tree | 16 | projects named by hand with their folder, and the first rule's candidates that were not taken |
| Deprecation notices in a changelog | 16 | GitHub's repositories by stars, most first (search `stars:>=115000`, then `stars:80000..114999`), every one it listed: a crawl, not a hand-picked list; a list, a book or a project with no changelog fails the check |

`node bench/repos/run.mjs --pick --heldout` checks them in order and writes [heldout.json](heldout.json): the repositories
taken, each pinned at the commit it was checked at, and every candidate checked and not taken with why. The check reads
only the tree's file names (and, for a changelog, whether such a file says "deprecat"), nothing is checked out for it,
and no repository is taken twice. Only 14 decision archives with 1,000 stars or more outside the first 50 passed the
check, so that group takes 14 of 18 and the held-out sample holds 46 repositories, not 50; the gate's thresholds are
applied as written (the median of the 46, and 15 repositories with a mark).

## What is counted

`node bench/repos/run.mjs` fetches each repository at its pinned commit (a shallow, sparse checkout from
`https://github.com/<owner>/<name>`: the text documents, `kep.yaml` and changelogs, the files a reader can take; git's
symlinks off), lists it as the engine does (`listFolder`: no hidden files, nothing the root `.gitignore` leaves out, at
most 5,000 files) and gives each file's text, with its path from the repository's root, to the readers
(`readDocument`).

| column | what it counts |
| -- | -- |
| decision records | documents a reader of decision records (its manifest says `records: true`: adr, rfc, pep, kep, eip, nep, rfd, pip, proposals) reads a date, a status or a mark in, plus each entry of a decision log (`decisions`) |
| in the tree | the files that match the group's own pattern for the repository's records (candidates.json), read or not: whether the records are there, whatever their format |
| replaced | documents that carry a mark the readers read (superseded, deprecated, obsolete, archived, moved, removed, unmaintained), from any reader, the fallback ones included: a heading or a sentence the banners reader takes for a document's own mark counts too |
| named | of those, the mark names what replaces it (a name or a link) |
| there | of those, the link, or the file the mark's id names (a PEP's `Superseded-By: 470` is `pep-0470.*` beside it), resolves to a file in the repository, as the engine resolves it: where Genter puts the current answer first |
| dated | documents a reader reads a date in (a changelog is dated by its latest entry) |
| changelog deprecations | deprecated and removed items in changelog entries: notices about an API, not marks of a document |

The gate uses "decision records" and "replaced", every kind of mark counted; RESULTS.md gives beside it how many
repositories have a mark of each kind, and how many a superseded or moved one (a mark that names a replacement or a new
place), so the verdict can be read under a stricter definition. The three archives: among the repositories with 5 or more decision
records, the most documents whose mark names a replacing document that is there, then the most that name what replaces
them, then the most marked, then the most stars.

## Running it

```bash
node bench/repos/run.mjs --pick      # the 50 again from candidates.json (re-pins their commits)
node bench/repos/run.mjs --pick --heldout   # the held-out sample again from candidates.json's heldout lists
node bench/repos/run.mjs             # the readers over both samples' commits: results/<date>.json and RESULTS.md (~5 min the first time)
node bench/repos/run.mjs --before bench/repos/results/2026-10-20.json   # the same, with step 1.10's counts of the first 50 beside
node bench/repos/run.mjs --from bench/repos/results/2026-10-20.json   # RESULTS.md from a run's numbers, no network
```

It needs `git` and access to github.com; checkouts are kept in `--cache <dir>` (default: the system's temp folder).
Only public repositories are read, nothing in them is run, and the bench uses Node's built-ins only.

## Limits

- **The readers as shipped.** A record in a folder or a form no reader takes, or one that carries no date, status or
  mark in its text (a C# proposal, a Matrix MSC, a Carbon proposal), counts in "in the tree", not in "decision records".
  RESULTS.md lists them under "What the readers miss", for each sample; a reader is data
  (`readers/<name>/reader.json`), so a pull request adds one without a brief, and this run measures it again. A reader
  widened after looking at the held-out sample makes it biased too: the next held-out sample is picked the same way.
- **The 5,000-file cap.** On a whole clone, code files count toward the engine's cap; the sparse checkout holds only
  documents. A repository whose tree holds more than 5,000 files the engine reads is marked ¹ in RESULTS.md.
- **Marks are per document.** Genter applies a mark to its whole document, so a status line that supersedes only a
  part of one marks all of it. RESULTS.md quotes each mark a picked archive ranks on that a fallback reader read; a
  launch page built on them waits for the owner's review.
- **Hand-named candidates.** "Every repository we could name" is a person's list for the first 50 and, helped by
  GitHub's search, for the held-out archives and projects; the held-out changelog group is a crawl. Each list is
  published so anyone can add to it and run the gate again.
- **A third of each sample keeps no decision records by definition.** The changelog group holds none, so the median
  repository reaches 5 decision records only when at least half of all the repositories, nearly all the other two
  groups, have 5 or more read. The gate's rule is the plan's; RESULTS.md gives each group's median beside it.
