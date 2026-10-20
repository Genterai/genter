# The README's first screen: the promise, the try page first, English and Russian

Status: shipped
Request: the product owner (dan), 2026-10-20, accepting Genter's open-source plan as proposed: "по всему что
предлагаешь" (on everything you propose), and asking to carry it through to `main`. This is the rest of step 1.9 of
that plan, the README's first screen in English and Russian (its community files shipped in #91): the promise "Your AI
stops quoting the old answer." and the sentence "Genter shows your AI what your team decided, where it is written and
when, and marks what was replaced since.", a picture in light and dark, a 20-second GIF of `npx genter-cli demo`, the
three commands, the buttons (a sample team, Add to Claude, Add to ChatGPT, Add to Cursor, Install in VS Code, Claude
Desktop's `.mcpb`), what needs a key and what does not, and the note on the npm name; README numbers come from the open
code. The plan's gate, step 1.10: when the 50-repository gate does not pass, the hero leads with the hosted try page.

Intent: a person who lands on the repository can say in a few seconds what Genter is and why, try it on a sample team or
on their own repository, and trust every number they read — success: README.md and README.ru.md open with Genter
Cloud's try page drawn as it shows a recorded answer, labelled as Genter Cloud on a fictional team, then the promise and
the sentence word for word, then "See it on a sample team" first among the buttons; the local engine follows, led by the
old-answer test's counts with Genter's losses, then the GIF made from `genter demo`'s own output and the three commands
as they behave on main; every link resolves and every number names its file in `bench/`, both checked by tests.
Searched: `npx -y genter-cli@0.3 ask "which README numbers come from which bench results file, and what must the first
screen show?"` (run as the published 0.3.0 from a scratch folder with this worktree added: inside the package `npx
genter-cli` resolves to the worktree and answers "genter: not found"): `bench/old-answer/README.md` "Limits" (marks are
per document; a PEP's `Superseded-By:` names a number; one agent wrote the questions) and the old-answer brief's line
that the root README would not quote those numbers until they were reviewed, the README being this step's; `ask "which
entry does genter install write for Cursor and VS Code, command and args?"`: `harden/redlines/install.md` and
`src/install/{cursor,vscode}.js` (`{ type: "stdio", command: "npx", args: ["-y", "genter-cli", "mcp"] }`). Then the
commands run on main (`node bin/genter.js demo`, `install --dry-run` in a temp home, `decisions` in a two-ADR repository)
and as published (`npx genter-cli@0.3.0 demo` prints the old demo; `install` and `decisions` are "Unknown command").
Sources: `README.md` (rewritten), `README.ru.md` (new), `package.json` (`description`, `keywords`), `docs/art/` (new:
`hero.html`, `terminal.html`, `render.mjs`, `demo.txt`), `docs/hero.png`, `docs/hero-dark.png`, `docs/demo.gif` (new);
`bench/old-answer/RESULTS.md` and `results/2026-10-20.json` (39 questions; old answer unmarked in the first five 31 and 0,
first 8 and 7, current first 20 and 21; the 7 losses), `bench/repos/RESULTS.md` and `results/2026-10-20.json` (the gate
does not pass: median 0 records read, 28 of 50 with a mark), `bench/drift/results/2026-10-10.md` (DriftBench, the
crosslingual row: 1 of 6 by words, 5 of 6 by meaning; cold start 184 ms; median search 3 ms), `bench/convo/results/
2026-10-09.md`; `readers/*/reader.json` (what the first screen names: ADR folders, `rfc/` and `rfcs/`, `peps/pep-*`, a
KEP's `kep.yaml`, CHANGELOG, `decisions.md`, banners, Obsidian), `rules/ru.json` ("заменён"); `src/demo.js` and
`bin/local.js` (the demo, `install`, `decisions` as they print); `src/install/{cursor,vscode}.js`;
`harden/redlines/{driftbench,community,cli,plugin,serve}.md` ([readme-generated], [stewardship], [mcpb-starts],
the plugin's and serve's README lines); `test/{local,plugin,serve,driftbench,packaging}.test.js` (what they hold the
README to); outside, read on 2026-10-20: Cursor's install-link page (cursor.com/docs/context/mcp/install-links:
`cursor://anysphere.cursor-deeplink/mcp/install?name=…&config=<base64 of the server's JSON>`; its web page
`https://cursor.com/install-mcp?…` opens that link, checked in Chromium), VS Code's MCP guide (`vscode:mcp/install?<the
JSON, URL-encoded>`; `https://vscode.dev/redirect/mcp/install?name=…&config=…` answers 302 to exactly that link),
Claude's "Add a connector that isn't in the directory" (Customize › Connectors › Add custom connector, one custom
connector on the Free plan), OpenAI's "Connect from ChatGPT" (Plugins › + › Add custom MCP server), the npm registry
(genter-cli 0.3.0 is the latest; 0.3.1 is not published), GitHub's releases of this repository (one, v0.3.0, with no
`genter.mcpb`), and `https://genter.ai/try` (404, see Open).
Red lines: new area `first-screen` ([promise], [hero-cloud], [pictures], [gif-real], [links-resolve],
[numbers-named], [npm-name]); driftbench/readme-generated and driftbench/scheduled-run stay true (the block is kept
byte for byte and `node bench/drift/run.mjs --no-takes --guard README.md` passes); community/stewardship stays true
(README numbers reproduce with the open code, now tested); cli/demo, cli/demo-fast, cli/mcpb-starts (the packed
README.ru.md is part of what npm ships, so the bundle holds it: the test's list of allowed paths names it), plugin/*
and serve/team-reads-all stay true (their README lines kept); zero runtime dependencies stays true (the pictures render
through `npx playwright@1.56.1` and ffmpeg, from `docs/art/`, nothing in `src/`).
Decided:
* **The hero is Genter Cloud's try page.** The 50-repository gate does not pass (the median repository has 0 decision
  records the readers read, under 5), so by the plan the hero leads with the hosted try page. The picture draws what
  the try page is built to show for one of its preset questions, the plan's own cloud picture (a Slack thread of
  2026-09-10 replaced a Notion page nobody marked). genter.ai does not serve the try page yet (Open), so its words were
  not taken from a live page: they are the try page's recorded answer as Genter Cloud prepared it for the page, its
  label ("Recorded from Genter Cloud on Kestrel Works, a fictional team, as of 2026-10-16."), the question, "Found 10
  sources for your AI. The first five, as it gets them:", the first two results with their meta lines and the mark, and
  passages from them (an ellipsis where a passage is cut). The address chip ("genter.ai/try") and the two highlights
  on the regions are this step's. The words beside the picture are the README's, and they say it is Genter Cloud's and
  that what it marks takes a model. Once genter.ai serves the page, its words are checked against the picture's and the
  picture is made again where they differ.
* **What each picture was made from is recorded.** `docs/art/render.mjs` writes `docs/art/rendered.json`: each
  picture's SHA-256 and those of the files it was made from (`hero.html` for both PNGs; `demo.txt` and `terminal.html`
  for the GIF). A test fails when a picture or one of its sources changes without a new render, so a `demo.txt`
  refreshed by hand with a stale GIF, or a `hero.html` edited without new PNGs, does not pass.
* **The local part leads with the old-answer test,** plain ranking against Genter with the losses in the same sentence
  (Genter's 7 "old answer first" are PEPs whose mark names a number), and says beside it that the archive questions
  wait for a person's review, as `bench/old-answer/README.md` does. Then what the readers read, named from
  `readers/*/reader.json`, and the gate's count beside it (most repositories keep their records where no reader looks
  yet), so the first screen does not promise more than the readers deliver.
* **The GIF is the local picture.** The plan's local hero (two answers to "Can we deploy on Friday?") would put words in
  a picture that no command prints ("No. Since Oct 3 there are no Friday deploys"); the GIF shows the same story in the
  words `genter demo` prints. Its frames show the demo's lines as printed, cut where the output turns (a command, a
  place, a line of the story, the next command), with no prompt and no title of their own; the alt text says it is
  paced to be read and that the command takes about a tenth of a second.
* **Links that work today.** Add to Claude and Add to ChatGPT lead to the README's own steps for Genter Cloud's one
  address, written from Claude's and OpenAI's guides (genter.ai publishes no page with these steps today); Claude's
  dialog link with the address filled in is not in Claude's guide, so it is not used. Add to Cursor and Install in VS
  Code are the editors' install pages over https, which open their documented `cursor:` and `vscode:` links, carrying
  the entry `genter install` writes. Claude Desktop's `.mcpb` links the releases page, "next release": no release
  carries `genter.mcpb` yet. No Discord: there is none.
* **The npm package is older than main.** npm has genter-cli 0.3.0; `demo` there prints the old demo, and `install` and
  `decisions` are unknown commands. The first screen says so in one note under the commands and gives
  `npx -y github:Genterai/genter <command>` (checked: it runs main's demo); the editor links and `install` add
  `npx -y genter-cli mcp`, which starts 0.3.0 until the next release, and the note says that too. No version bump.
* **Claims the open code does not back are gone or corrected:** the "resolver for AI agents" banner and line (the
  banner file stays: the README npm shows for 0.3.0 points to it); "200 files in 0.2 s", which no bench measures (now
  the takes table's cold start, 184 ms for 34 docs, in its block); "500 more apps" for Genter Cloud; the harden example
  whose output no file records. The Genter Cloud column leaves the meaning table; numbers in tables and paragraphs name
  their file.
* **README.ru.md** has the same first screen and the same facts, in Russian, and shorter sections below that point to
  the English README for DriftBench's tables, the commands and the editors; it carries no DriftBench table, so the
  DriftBench guard has nothing to read there, and the old-answer and gate counts in it are tested like the English
  ones. Both link each other at the top and in the line under the commands. npm ships README.ru.md with README.md (npm
  always packs `README*`; a negation in `files` does not keep it out).
* `package.json`'s description is the promise and the sentence, then "CLI, MCP server and library: no key, no
  dependencies."; the keyword "resolver" gives way to "decisions" and "adr". `server.json`, `manifest.json` and
  `docs/listings.md` keep their descriptions (cli/registry-entry, cli/listings: their own step).
Open:
* **`https://genter.ai/try` answers 404 today.** The try page is not live yet: genter.ai serves its earlier signed-out
  page ("One agent for everything in your apps."), and `/try` answers 404. The README's first link, and the picture's,
  lead there, and the picture's words are the page's prepared answer, public on this branch before the page is. →
  Nothing in this repository changes for it: the pull request stays a draft until genter.ai serves `/try`, and the lead
  deploys Genter Cloud or decides, with the owner, whether the fictional answer may be public before the page; once it
  is served, its words are checked against the picture's and the picture made again where they differ
  [non-blocking for this brief; it blocks marking the pull request ready]
* The archive questions of the old-answer test wait for the owner's review (`bench/old-answer/RESULTS.md`, "reviewed:
  pending owner"), and the first screen quotes their counts. → Quote them now with that said beside them, as step 1.9
  asks to lead the local part with them; a review that changes a count changes the README in the same pull request,
  and the test holds them equal [non-blocking]
* Pull request #93 (wider readers and a held-out gate) may change both benches' counts and what the readers read. →
  If it merges first, merge main and refresh: the tests read the latest results and fail on any count left behind
  [non-blocking]
* The repository's GitHub description still says "Resolver for AI agents…". → The owner changes it to the promise in
  the repository's settings [non-blocking]
* The 20-stranger test (15 of 20 say what Genter is and why after 5 seconds on the first screen) is the launch gate and
  cannot be run here [non-blocking]
Proof: `test/first-screen.test.js`: "[rl:first-screen/promise]" the name, the promise and the sentence word for word on
both first screens, before any section, and `package.json`'s description starting with them /
"[rl:first-screen/hero-cloud]" the `<picture>` (dark source, light image, alt text naming Genter Cloud, Kestrel Works
and a fictional team) before the heading, linked to the try page, "See it on a sample team" the first link after the
promise, the words beside it, the picture's own label, and the gate's verdict still "does not pass" /
"[rl:first-screen/pictures]" both PNGs the same size, 1520 pixels wide, the GIF a GIF, each under 1.5 MB, their sources
in `docs/art/`, both PNGs and `hero.html` the files `docs/art/rendered.json` records them as, no dependency, nothing of
`docs/` shipped / "[rl:first-screen/gif-real]" `docs/art/demo.txt` equal to what `genter demo` prints now, the GIF,
`demo.txt` and `terminal.html` the files `rendered.json` records, the frames covering every line once in order, 15 to
25 seconds, and the frame page holding no words of its own / "[rl:first-screen/links-resolve]" every relative link and picture of both READMEs a file
here and every anchor a heading (GitHub's anchors, Cyrillic included), every outside link https, no release download,
the Cursor and VS Code links decoding to `src/install`'s own entries, the two Genter Cloud links to their steps, each
README naming the other at its top / "[rl:first-screen/numbers-named]" every percentage, "N of M" and time in ms in a
block that links its file in `bench/`, and in both languages the old-answer rows and sentences (the questions, the
split between the archives and DriftBench, the questions whose first result differs) and the gate's sentences, in the
first screen and under Benchmarks, equal to the latest results, DriftBench's table only in README.md / "[rl:first-screen/npm-name]". Each fails when its part is undone
(checked by hand: an anchor misspelt in either README, a link to a file that is not here, a "99%" with no file beside
it, a Russian or English count changed by one, a byte of the GIF or of `demo.txt` changed without a new render). Outside links checked on 2026-10-20: Cursor's page 200 and opening its install link in Chromium, vscode.dev 302 to
`vscode:mcp/install?{…"args":["-y","genter-cli","mcp"],"name":"genter"}`, Claude's and OpenAI's guides 200, GitHub
200; claude.ai, chatgpt.com and npmjs.com answer an automated client with a challenge page (403), as they do any
script; genter.ai/try 404 (Open). Checks that nothing else broke: `npm test`, `npm run lint`, `harden check`,
`node bin/genter.js reader check`, `node bench/drift/run.mjs --no-takes --guard README.md`.

## Red lines after

- first-screen/promise (new)
- first-screen/hero-cloud (new)
- first-screen/pictures (new)
- first-screen/gif-real (new)
- first-screen/links-resolve (new)
- first-screen/numbers-named (new)
- first-screen/npm-name (new)
