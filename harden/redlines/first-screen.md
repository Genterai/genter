# The README's first screen

Intent: a person who lands on the repository can say in a few seconds what Genter is and why, try it on a sample team
or on their own repository, and trust every number they read — success: the first screen gives the promise and its
sentence word for word, in English and in Russian, under a picture labelled for what it shows, and every link on it
resolves and every number on it names the file in `bench/` it comes from.
Sources: step 1.9 of Genter's open-source plan (the first screen of its §3, the gate of its step 1.10); `README.md`,
`README.ru.md`, `docs/art/`, `docs/hero.png`, `docs/hero-dark.png`, `docs/demo.gif`.

Most weight: [numbers-named] (a number nobody can reproduce costs the trust the marks need: STEWARDSHIP.md promises
README numbers reproduce with the open code), [hero-cloud] (the picture says whose it is: Genter Cloud's marks found
with a model are not the open engine's) and [gif-real] (the GIF shows only what the command prints).

The DriftBench tables inside README.md are DriftBench's (driftbench/readme-generated): its run writes them and its
guard reads them. `package.json` is outside Sources on purpose (a release changes its version); a test reads its
description.

## Red lines

* **[promise]** README.md's first screen (everything above its first `---`) gives, before any section, "Genter", the
  promise "Your AI stops quoting the old answer." and the sentence "Genter shows your AI what your team decided, where it
  is written and when, and marks what was replaced since.", word for word; README.ru.md gives them in Russian, word for
  word as it has them ("Ваш ИИ перестаёт цитировать старый ответ." and its sentence); `package.json`'s description
  starts with the promise and the sentence.
* **[hero-cloud]** While the 50-repository gate does not pass (old-answer/repos-gate: the latest `bench/repos` run's
  verdict), the first picture on both first screens is Genter Cloud's try page, labelled in the picture itself as
  recorded from Genter Cloud on a fictional team, served light and dark (`<picture>`, `prefers-color-scheme`) with alt
  text that says what it says, and linked to `https://genter.ai/try`; "See it on a sample team" (in Russian, "Посмотреть
  на примере команды") is the first call to action after the promise. The text beside it says the picture is Genter
  Cloud's, that what it marks takes a model, and what the open engine marks with no key.
* **[pictures]** `docs/hero.png`, `docs/hero-dark.png` (the same size, twice the 760 pixels the README shows) and
  `docs/demo.gif` are rendered by `docs/art/render.mjs` from `docs/art/hero.html` and `docs/art/terminal.html`, each
  under 1.5 MB; `docs/art/rendered.json`, written by the same run, holds each picture's SHA-256 and those of the files
  it was made from, and a picture or a source changed without a new render fails a test; rendering them installs
  nothing with genter-cli (Playwright's command line through npx, and ffmpeg), and the package ships none of them.
* **[gif-real]** `docs/demo.gif` is made from what `genter demo` prints, recorded in `docs/art/demo.txt`; the demo
  printing anything else fails a test until the GIF is made again. Each frame shows the lines printed up to that point,
  every line once and in order, about 20 seconds in all; the window around them holds no words of its own.
* **[links-resolve]** Every link and picture of README.md and README.ru.md resolves: a path to a file in the
  repository, an anchor to a heading of the file it names, anything else over `https`. "Add to Cursor" and "Install in
  VS Code" are those editors' install links carrying the entry `genter install` writes for them
  (`npx -y genter-cli mcp` over stdio); "Add to Claude" and "Add to ChatGPT" lead to the steps that add Genter Cloud's
  one address; the `.mcpb` links the releases page, never a download no release carries. Each README links the other at
  its top.
* **[numbers-named]** Every number README.md or README.ru.md states as a measurement (a percentage, "N of M", a time
  in ms) is in a paragraph, list or table that links the file in `bench/` it comes from, and the old-answer test's
  counts and the 50-repository gate's are the latest results' of those benches. DriftBench's tables are in README.md
  only, where its guard reads them.
* **[npm-name]** Both READMEs say the package is `genter-cli` and that the npm package called `genter` belongs to
  someone else.
