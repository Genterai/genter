# /health while searches run: a search gives the event loop its turns

Status: shipped
Request: the product owner (dan), 2026-10-20, accepting Genter's open-source plan: "по всему что предлагаешь" (on
everything you propose), and asking to carry it through to main. This fixes step 3.3 of that plan (`genter serve`,
whose red line serve/async-reads says `/health` answers at once "also while 20 searches run"): on pull request #92's
CI run, the job `test (22)` failed once on `test/serve.test.js`'s smoke test and passed when run again
(https://github.com/Genterai/genter/actions/runs/39498720225/job/118890415857: "/health answers while 20 searches run
(in 618 ms; the searches took 696 ms)", "health 200 after 618 ms, at +696 ms; last search at +696 ms"). "Flaky" is no
root cause: find it, and fix the product if it is the product, the red line kept as written.

Intent: `genter serve` answers `/health` at once while 20 searches run, as serve/async-reads says, on a busy machine as
on an idle one — success: with the 20 searches sent over connections already open (so all 20 reach the server
together), `/health` is answered behind no more of them than two turns of the event loop end (two turns of
`LIMITS.turnMs`, each the searches that fit in it and the one it falls in: 4 to 6 here) instead of after all 20, in
every run under full CPU contention, and the smoke test judges it by that count, not by a number of milliseconds.
Searched: `npx -y genter-cli@0.3 ask "does a search hold the event loop, so /health waits while searches run?"` from
the worktree answers `sh: 1: genter: not found` (inside its own repository npx resolves to this package, which has no
`genter` bin there), so it was asked with this worktree's engine (`node bin/genter.js ask`, its own `GENTER_HOME`):
the serve brief's Proof (the one-at-a-time test holds its `find` on a gate, a promise that waits, so a search that
never waits was not tried) and `test/serve.test.js` "[rl:serve/async-reads] tool calls run one at a time …"; then
"files already read are kept in memory: does look read them again, and what runs one tool call at a time?"
(`harden/redlines/serve.md` [async-reads], `src/http.js`'s header: "the files' text is read off the main thread, so
/health and every refusal answer at once while searches run").
Sources: `src/local.js` (`look`, `texts`, `pool`, `readFiles`, `settle`, `find`, `LIMITS`), `src/http.js` (`serveHttp`,
`inTurn`), `test/serve-smoke.mjs` (`check`), `test/serve.test.js`, `test/serve-compose.test.js`,
`harden/briefs/2026-10-20-genter-serve-and-a-compose-file-for-small-teams.md` (its Proof: "`/health` answered in
1 ms"); the failed job above; Node's event loop: a promise that resolves at once continues as a microtask, and node
runs every microtask before it polls for I/O again; `setImmediate` runs after the poll.
Red lines: serve/async-reads kept as written ("meanwhile `/health`, listing and every refusal answer at once, also
while 20 searches run"), now true for searches over files already read; serve/health unchanged; contract/place-ids
stays true (files are settled one after the other, in the order listed); local-search/reads-again,
local-search/current-first and local-search/ranking-words unchanged (every search reads again, and answers the same,
ranked the same); remote/anchors-not-copies and remote/says-when-failing unchanged (an MCP server's documents are
cut into sections with the files', with the same turns); security/never-run and zero runtime dependencies stay true (`setImmediate` and
`performance.now()` are Node's own).
Decided:
* The root is in the product. A search over files already read waits for nothing: `look` finds a file's text in what
  this process read (`texts`) and resolves at once, so `pool`'s awaits, the settling of every file and the ranking run
  as one stretch of microtasks, and node polls for no I/O until it ends. Measured in process, 20 searches one after the
  other held the event loop for 182 ms over the smoke folder's 403 files and for 1.99 s over 4,903 files, and a 1 ms
  timer did not fire once. When 20 requests reach the server in one poll, their 20 searches run back to back, and a
  `/health` that arrives meanwhile is answered after the last. Reading the text off the main thread (step 3.3) made a
  first search wait on every read; a search over files already read, the usual one in `genter serve`, never did.
* The CI failure is that: the 20 requests came in on new connections and were read before `/health`'s, so it waited
  behind every search and was answered in the millisecond the last one was. What failed was "before the last search",
  not the 1,000 ms bound (it answered in 618 ms). Reproduced here before the fix: 1 failure in 40 runs of the smoke test
  8 at once ("health 200 after 570 ms, at +645 ms; last search at +641 ms"; on the main before #92; none in 80 on main
  now, so rare with new connections), and in 29 of 32 runs when the same 20 searches go over connections already open,
  under load (Proof).
* The fix, in the engine: a turn of the event loop (`setImmediate`) once the process has worked `LIMITS.turnMs` (10 ms)
  since the last one (`due`, `turn`): after each item of `pool` (each file looked at, each replacing place), after each
  file `readFiles` settles, and after each place's sections in `find`. The files are still settled one after the other
  in the order listed, tool calls still run one at a time, and the answer is the same. What stays one stretch: the
  folder's listing, BM25 over all sections, the sort and a store write when something changed; the longest stretch
  measured is 12–16 ms over 403 files and 32–36 ms over 4,903 (from 182 ms and 1.99 s).
* Not a turn in `src/http.js` before each queued call: it would cover the gaps between searches but not one long search
  over a large folder. With the turns inside the search, a call that starts right after another goes on with the same
  10 ms budget.
* The test: `test/serve-smoke.mjs` sends the 20 searches twice, the second time over the connections the first opened,
  so they reach the server together (the case that shows a held event loop on almost every run), and judges `/health`
  by the searches still running when it was asked that were answered before it. `/health` waits for at most two turns
  of the event loop (one accepts its connection, one reads its request), and a turn comes after at most `turnMs` of
  search work, so after the searches that fit in `turnMs` and the one it falls in; one search takes what one took in
  that round (the median time between two answers, as they run one at a time). So the check allows
  2 × (⌈`turnMs` / one search⌉ + 1) searches: 4 to 6 on this machine. The 1,000 ms bound goes: a busy machine slows the
  searches and `/health` alike, and a faster one ends more searches in a turn, which the bound follows (over a folder of
  20 notes, where a search takes about 3 ms instead of 9, `/health` waited behind up to 5 of the 14 still running at
  the median, close to the half a fixed share would allow, and the bound allowed 8 to 12). Before the fix it waited behind
  19 of the 19 still running at the median. The docker compose smoke test (`test/serve-compose.test.js`) runs the same
  check. Two tests in process: a timer due at once fires before 20 searches over files already read, one after the
  other, end (before the fix it fired after all 20); and one such search, with no budget left (`turnMs` 0), turns the
  event loop at least once per file (858 turns over the smoke folder's 403 files; 0 before the fix, and 1 with a single
  turn at the start of each search, the alternative above, which the first test does not tell apart).
Open:
* A warm search over a large folder spends about a fifth of its time cutting Markdown that did not change
  (`describeFile` calls `splitMarkdown` at every settle: 441 of 2,092 ms for 20 searches over 4,903 files) → a
  performance change of its own; this one changes no cost [non-blocking]
* BM25 over all sections stays one stretch (about 10 ms over 4,903 files on an idle machine) → slicing it would change
  `src/lexical.js`'s interface; only if a larger folder shows it [non-blocking]
Proof: `test/serve.test.js` "[rl:serve/same-contract] [rl:serve/tokens] [rl:serve/health] [rl:serve/read-only]
[rl:serve/async-reads] [rl:serve/team-reads-all] the smoke test passes against genter serve …" with the new check:
on the code before the fix it fails on almost every run, not on every one: with the first bound (fewer than half),
3 of 3 alone and 16 of 16 eight at once ("health 200 asked at +25 ms, answered at +469 ms; searches answered by then
20, the last at +469 ms"), and 28 of 30 under a busy loop per core in review; with the bound tied to `turnMs`
(2 × (⌈`turnMs` / one search⌉ + 1), the old code given the same 10 ms), 10 of 10 alone, 10 of 10 alone under the busy
loops and 16 of 16 eight at once ("in 346 ms, behind 20 of the 20 still running, at most 4"). With the fix it passes
40 of 40 alone under the busy loops, 40 of 40 eight at once under them and 40 of 40 eight at once idle. A second set
took the raw times of both rounds, main (a32c0f7) and the fix in turns, over 400 notes (30 runs each under the busy
loops, 20 idle), 80 notes (the same) and 20 notes (20 idle), and judged them offline: with the fix every run passes,
with 4 to 12 allowed and `/health` behind at most 5, at least 3 fewer than allowed in every round; main passes 0 of
60 under the busy loops and 3 of 60 idle (a fixed half would have passed 0 and 2).
The deterministic test of the old code is the in-process one: "[rl:serve/async-reads] searches over files already read
give the event loop its turns: a timer due at once fires before 20 of them, one after the other, end" fails before the
fix and passes with it, and "[rl:serve/async-reads] one search over files already read gives the event loop turns
while it runs, not only between searches …" fails before the fix (0 turns), fails with one turn per search and none
inside it (1 turn), and passes with the fix (858 turns over 403 files). The first set, before the review: on 4 cores
with a busy loop on each (`node -e 'for(;;){}'`), `genter serve` over the smoke folder, 32 runs on main (a32c0f7) and 32 with the fix, taken in turns; each run reads every file once, then
sends the 20 searches and asks `/health` 20 ms later, over new connections, then again over the open ones. Over open
connections: `/health` before min 22 / p50 291 / p90 368 / max 408 ms, answered after the last search in 29 of 32,
behind 19 of the 19 still running at the median; after min 1 / p50 11 / p90 27 / max 36 ms, after the last search in
0 of 32, behind 0–2. Over new connections (the old check's step): before min 2 / p50 14 / p90 34 / max 74 ms, after
min 1 / p50 12 / p90 20 / max 37 ms. A first set on the main before #92 gave the same (open connections: before p50
364, max 932 ms, after the last search in 32 of 32; after p50 9, max 32 ms, in 0 of 32). The 20 searches took p50
330 ms before and 354 ms after over open connections (392 and 372 in the first set), what a busy machine varies by; on
an idle one 185 and 185 ms (12 runs each, in turns), and one search in process, p50 of 60, 8.2 and 8.3 ms over 403
files, 97 and 100 ms over 4,903. / `npm test` 235 of 235 (and three more times under the busy loops: 235, 235, and once
234 when `[rl:cli/demo-fast]`'s half-second bound gave 504, 604, 762 ms under that load; `genter demo` takes 122–170 ms
with and without the fix on an idle machine), `npm run lint`, `harden check`; the docker compose smoke test runs in
CI's serve job (Docker's daemon does not run here).

## Red lines after

- serve/async-reads (kept as written; made true for a search over files already read and for the searches queued
  behind it)
