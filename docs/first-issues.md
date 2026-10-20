# The 20 "good first reader" issues

For launch (step 1.9 of Genter's open-source plan). The maintainers create them in GitHub from this list; nothing here
has been created. Make the labels first: `good first reader`, `reader`, `rules`. Each section is one issue: its heading
is the title, the `Labels:` line the labels, the rest the body. Twelve are readers for a format, eight are the phrases of
a language.

Each one was checked against the readers in `readers/` and `rules/` on 2026-10-20, so that it is a format no reader
reads yet or a gap a fixture shows.

## What every issue says at its end

> **How to take it.** Say so in a comment, so that two people do not do the same one. `git clone`, `npm ci`, then
> `genter reader new <name>` (a reader) or copy `rules/ru.json` (a language), and read
> [CONTRIBUTING.md](https://github.com/Genterai/genter/blob/main/CONTRIBUTING.md#readers-and-language-rules). Fixtures are documents shaped like the real ones with
> **invented** content. You need no brief: the `readers` check is the review. Sign off your commits (`git commit -s`).
> Set `owner` in `reader.json` to your GitHub handle: you keep the reader.

## Readers

### 1. reader: Rust RFCs (`text/0000-name.md`)

Labels: `good first reader`, `reader`

The Rust RFC repository keeps each RFC as `text/NNNN-name.md`, opening with a list: `- Feature Name: …`,
`- Start Date: 2015-03-11`, `- RFC PR: …`. The `rfc` reader already knows a "Start Date" line, but it only reads files
under `rfcs/`, `rfc/`, `peps/` and `keps/`, so these get no date.
Make `readers/rust-rfc/`: files `**/text/[0-9][0-9][0-9][0-9]-*.md`, the date from the `Start Date` line (take the `rfc`
reader's pattern), fixtures with an RFC that has a date and one that has none.
Done when: `genter reader check readers/rust-rfc` passes and the date is in `expected.json`.

### 2. reader: "Last updated" lines in any document

Labels: `good first reader`, `reader`

Many documents carry no front matter and say when they were written in a line: `Last updated: 2026-03-02`,
`_Updated 2026-03-02_`, `Updated on: 2026-03-02`. No reader gives those a date, so Genter falls back to the file's time,
which a fresh clone makes useless.
Make `readers/last-updated/` with `"fallback": true` (format readers are asked first): files `**/*.md` and `**/*.mdx`, a
date rule in `top` for those three shapes. Fixtures: each shape, and a document that mentions a date in prose and must
give none.
Done when: `genter reader check readers/last-updated` passes.

### 3. reader: Org-mode files

Labels: `good first reader`, `reader`

Org files (`.org`) start with keywords such as `#+TITLE:` and `#+DATE: <2026-03-02 Mon>` (org-roam also writes
`#+LAST_MODIFIED:`). No reader takes `*.org`.
Make `readers/org-mode/`: files `**/*.org`, a date from `#+DATE:` or `#+LAST_MODIFIED:` in either bracket style
(`<…>` or `[…]`). Fixtures: both keywords, and a file with none.
Done when: `genter reader check readers/org-mode` passes.

### 4. reader: Helm charts that are deprecated

Labels: `good first reader`, `reader`

A Helm `Chart.yaml` can say `deprecated: true`. A repository of charts then holds a chart nobody should install, and no
reader marks it.
Make `readers/helm-chart/`: files `**/Chart.yaml`, a `deprecated` mark on a line `deprecated: true` (`"in": "any"`,
`lines` as needed). Fixtures: a deprecated chart, a chart with `deprecated: false`, and one that says nothing.
Done when: `genter reader check readers/helm-chart` passes and only the first fixture is marked.

### 5. reader: Go modules that are deprecated

Labels: `good first reader`, `reader`

A `go.mod` deprecates its module with a comment paragraph before the `module` line: `// Deprecated: use
example.com/mod/v2 instead.` No reader marks it.
Make `readers/go-mod/`: files `**/go.mod`, a `deprecated` mark on a comment line starting `// Deprecated:`, with the rest
of the line as the `name`. Fixtures: a deprecated module, a module whose comment says "deprecated" elsewhere (must not
mark), and an ordinary one.
Done when: `genter reader check readers/go-mod` passes.

### 6. reader: abandoned Composer packages

Labels: `good first reader`, `reader`

A `composer.json` can carry `"abandoned": true`, or `"abandoned": "vendor/other"` naming the package to use instead.
Make `readers/composer/`: files `**/composer.json`, an `unmaintained` mark for `"abandoned": true`, and a `superseded`
mark with the replacement as the `name` for the string form. Fixtures: both forms, `"abandoned": false` and none.
Done when: `genter reader check readers/composer` passes.

### 7. reader: Rust crates marked deprecated

Labels: `good first reader`, `reader`

A `Cargo.toml` may declare its maintenance status in `[badges]`: `maintenance = { status = "deprecated" }`.
Make `readers/cargo-maintenance/`: files `**/Cargo.toml`, `lines` up to 400 (the table can be far down), a `deprecated`
mark for status `deprecated`. Fixtures: `deprecated`, `actively-developed`, and no `[badges]`.
Done when: `genter reader check readers/cargo-maintenance` passes.

### 8. reader: Python projects that are inactive

Labels: `good first reader`, `reader`

A Python project says it is no longer developed with the trove classifier `Development Status :: 7 - Inactive` (in
`pyproject.toml` or `setup.cfg`).
Make `readers/pyproject-inactive/`: files `**/pyproject.toml` and `**/setup.cfg`, an `unmaintained` mark for that
classifier. Fixtures: the classifier in both files, `Development Status :: 5 - Production/Stable`, and none.
Done when: `genter reader check readers/pyproject-inactive` passes.

### 9. reader: Maven artifacts that moved

Labels: `good first reader`, `reader`

A Maven `pom.xml` with a `<relocation>` element under `<distributionManagement>` says the artifact moved to other
coordinates.
Make `readers/maven-relocation/`: files `**/pom.xml`, a `moved` mark on the `<relocation>` line, `lines` up to 400.
Fixtures: a pom with a relocation, a pom with a `<relocation>` word only in a comment (decide and document how you
treat it), and an ordinary pom.
Done when: `genter reader check readers/maven-relocation` passes.

### 10. reader: yanked releases in a changelog

Labels: `good first reader`, `reader`

Keep a Changelog marks a release taken back with `## [0.0.5] - 2014-12-13 [YANKED]`. The `changelog` reader's heading
pattern ends at the date, so this release gets neither its date nor a mark (the release under it is read fine).
Extend `readers/changelog/reader.json`: let the heading pattern end in `[YANKED]`, and add a `removed` mark for it. Add
such a release to a fixture, with its date and its mark in `expected.json`.
Done when: `genter reader check readers/changelog` passes and the other releases are unchanged.

### 11. reader: ADRs written in Russian

Labels: `good first reader`, `reader`

A Russian-speaking team writes an ADR with `Дата: 2026-03-03` and `Статус: принято` or `Статус: заменено на
ADR-0007`. The `adr` reader reads English `Date:` and `Status:` lines only, so these get no date and no
status; the replaced mark they already get from the Russian phrases of `rules/ru.json`.
Make `readers/adr-ru/`: the `adr` reader's globs, the date from `Дата:` and the status from `Статус:` in front matter,
`top` and a `## Статус` section. Character classes may use `а-яё`. A Russian speaker reviews it.
Done when: `genter reader check readers/adr-ru` passes.

### 12. reader: deprecation callouts written as MDX components

Labels: `good first reader`, `reader`

Docs sites written in MDX mark a deprecated page with a component: `<Admonition type="danger" title="Deprecated">`,
`<Callout type="warn" title="Deprecated">`. The `banners` reader knows `:::`, `!!!`, GitHub alerts and plain phrases, and
not these.
Extend `readers/banners/reader.json`: a `deprecated` mark in `top` for a component whose `title` is "Deprecated", and a
`superseded` one for "Superseded". Add `.mdx` fixtures, with a component that must not mark.
Done when: `genter reader check readers/banners` passes.

## Language rules

Each is `rules/<lang>.json`, copied from `rules/ru.json`: the markers `deprecated`, `obsolete`, `superseded`,
`replaced by`, `moved to`, `no longer maintained` and `archived` as the language says them, each with `hits` (lines it
marks) and `misses` (lines that look alike and must not). A native speaker writes or reviews it; the phrases below are
where to start, not an answer. Done when `genter reader check` passes with it.

### 13. rules: Spanish (`rules/es.json`)

Labels: `good first reader`, `rules`

Start from: obsoleto, en desuso, descontinuado, reemplazado por, sustituido por, movido a, ya no se mantiene,
archivado.

### 14. rules: German (`rules/de.json`)

Labels: `good first reader`, `rules`

Start from: veraltet, obsolet, ersetzt durch, abgelöst durch, verschoben nach, wird nicht mehr gepflegt, archiviert.

### 15. rules: French (`rules/fr.json`)

Labels: `good first reader`, `rules`

Start from: obsolète, déprécié, remplacé par, déplacé vers, n'est plus maintenu, archivé.

### 16. rules: Portuguese (`rules/pt.json`)

Labels: `good first reader`, `rules`

Start from: obsoleto, descontinuado, substituído por, movido para, não é mais mantido, arquivado. Say in the pull
request whether it follows Brazilian or European usage where they differ.

### 17. rules: Chinese (`rules/zh.json`)

Labels: `good first reader`, `rules`

Start from: 已弃用, 已废弃, 已过时, 已被……取代, 已迁移到, 不再维护, 已归档. Word boundaries (`\b`) do not separate
Chinese characters, so the `misses` matter most here. Say whether it is Simplified or Traditional; the other is a second
file.

### 18. rules: Japanese (`rules/ja.json`)

Labels: `good first reader`, `rules`

Start from: 非推奨, 廃止, 置き換えられ, 移動しました, メンテナンスされていません, アーカイブ. As in Chinese, `\b` does not
split words, so write the `misses` with care.

### 19. rules: Ukrainian (`rules/uk.json`)

Labels: `good first reader`, `rules`

Start from: застарілий, замінено на, перенесено до, більше не підтримується, архівовано. `rules/ru.json` shows the
character classes for Cyrillic; Ukrainian has its own letters (і, ї, є, ґ).

### 20. rules: Italian (`rules/it.json`)

Labels: `good first reader`, `rules`

Start from: obsoleto, deprecato, sostituito da, spostato in, non più mantenuto, archiviato.
