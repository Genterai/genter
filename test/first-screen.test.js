import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { demoOutput, steps } from "../docs/art/render.mjs";
import cursor from "../src/install/cursor.js";
import vscode from "../src/install/vscode.js";

// The README's first screen, in English and Russian (step 1.9 of Genter's open-source plan): the promise and its
// sentence, Genter Cloud's picture first while the 50-repository gate does not pass, the GIF made from `genter demo`'s
// own output, links that resolve, and numbers that name the file in bench/ they come from.
const root = fileURLToPath(new URL("..", import.meta.url));
const at = (path) => join(root, path);
const text = (path) => readFileSync(at(path), "utf8");
const READMES = ["README.md", "README.ru.md"];
const PROMISE = "Your AI stops quoting the old answer.";
const SENTENCE = "Genter shows your AI what your team decided, where it is written and when, and marks what was replaced since.";
const PROMISE_RU = "Ваш ИИ перестаёт цитировать старый ответ.";
const SENTENCE_RU = "Genter показывает вашему ИИ, что решила ваша команда, где это записано и когда, и отмечает, что с тех пор заменено.";
const MB = 1024 * 1024;

// What a reader sees of HTML and Markdown: tags and line breaks gone, spaces collapsed.
const plain = (s) => s.replace(/<br>/g, " ").replace(/<[^>]+>/g, "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
// The part above the first rule (---): the first screen.
const firstScreen = (s) => s.slice(0, s.indexOf("\n---\n"));
// The latest dated results of a bench.
const latest = (dir) => JSON.parse(text(join(dir, readdirSync(at(dir)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().at(-1))));

// Every link and picture of a Markdown file: [text](target), href="", src="", srcset="".
function links(md) {
  const out = [];
  const prose = md.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  for (const m of prose.matchAll(/\]\(([^)\s]+)\)/g)) out.push(m[1]);
  for (const m of prose.matchAll(/(?:href|src|srcset)="([^"]+)"/g)) out.push(m[1].replace(/&amp;/g, "&"));
  return out;
}

// GitHub's anchors for a file's headings: lower case, punctuation dropped, spaces to hyphens, repeats numbered.
function anchors(md) {
  const seen = new Map();
  const out = new Set();
  for (const m of md.replace(/```[\s\S]*?```/g, "").matchAll(/^#{1,6} (.+)$/gm)) {
    const words = m[1].replace(/`/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
    const base = words.trim().toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, "").replace(/ /g, "-");
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.add(n ? `${base}-${n}` : base);
  }
  return out;
}

// The blocks of a Markdown file a person reads as one: paragraphs, list items run together, tables; code left out, and
// the block DriftBench's run writes kept whole (its last line names its results).
function blocks(md) {
  const drift = /<!-- driftbench:start -->[\s\S]*?<!-- driftbench:end -->/.exec(md)?.[0];
  const rest = md.replace(/```[\s\S]*?```/g, "").replace(/<!-- driftbench:start -->[\s\S]*?<!-- driftbench:end -->/, "");
  return [...(drift ? [drift] : []), ...rest.split(/\n\s*\n/)];
}
const MEASURE = /\d+(?:\.\d+)?%|\b\d+ (?:of|из) \d+\b|\b\d+ ms\b/;
// A block's words without the addresses its links point to (an encoded "%22" is not a number).
const words = (block) => block.replace(/(?:href|src|srcset)="[^"]*"/g, "").replace(/\]\([^)]*\)/g, "]");

describe("the README's first screen", () => {
  it("[rl:first-screen/promise] leads with the promise and its sentence, word for word, in English and in Russian, and the package says them", () => {
    const en = firstScreen(text("README.md"));
    const ru = firstScreen(text("README.ru.md"));
    assert.ok(plain(en).includes(`Genter ${PROMISE} ${SENTENCE}`), "the name, the promise, then the sentence");
    assert.ok(plain(ru).includes(`Genter ${PROMISE_RU} ${SENTENCE_RU}`));
    // Nothing but the language switch and the picture comes before them.
    for (const md of [en, ru]) assert.ok(md.indexOf("<h1") < md.indexOf("\n## "), "the promise before any section");
    const pkg = JSON.parse(text("package.json"));
    assert.ok(pkg.description.startsWith(`${PROMISE} ${SENTENCE}`), pkg.description);
    assert.doesNotMatch(pkg.description, /resolver/i);
  });

  it("[rl:first-screen/hero-cloud] the first picture is Genter Cloud's on a fictional team, light and dark, linked to the try page, which is the first call to action", () => {
    for (const file of READMES) {
      const md = firstScreen(text(file));
      const picture = /<a href="https:\/\/genter\.ai\/try"><picture>\s*<source media="\(prefers-color-scheme: dark\)" srcset="docs\/hero-dark\.png">\s*<img src="docs\/hero\.png" width="760" alt="([^"]+)">\s*<\/picture><\/a>/.exec(md);
      assert.ok(picture, `${file}: the picture, light and dark, linked to the try page`);
      assert.ok(md.indexOf("<picture>") < md.indexOf("<h1"), `${file}: the picture comes first`);
      assert.match(picture[1], /Genter Cloud/);
      assert.match(picture[1], /Kestrel Works/);
      assert.match(picture[1], file === "README.md" ? /a fictional team/ : /вымышленной команде/);
      // The first link after the promise is the try page.
      const after = md.slice(md.indexOf("</h1>"));
      const first = /<a href="([^"]+)"><b>([^<]+)<\/b><\/a>/.exec(after);
      assert.equal(first[1], "https://genter.ai/try");
      assert.equal(first[2], file === "README.md" ? "See it on a sample team" : "Посмотреть на примере команды");
      assert.ok(after.indexOf("https://genter.ai/try") < after.indexOf("cursor.com"), `${file}: before the other links`);
      // Beside it: the picture is the cloud's, what it marks takes a model, and what the open engine marks with no key.
      const said = plain(md);
      assert.match(said, file === "README.md" ? /The picture is Genter Cloud.*takes a model.*with no key, Genter's open engine marks what a document says about itself/ : /На картинке Genter Cloud.*нужна модель.*без ключа открытый движок Genter отмечает то, что документ говорит о себе сам/);
    }
    // The picture says so itself, and the gate it follows from does not pass.
    const hero = text("docs/art/hero.html");
    assert.match(plain(hero), /Recorded from Genter Cloud on Kestrel Works, a fictional team, as of \d{4}-\d{2}-\d{2}\./);
    assert.equal(latest("bench/repos/results").verdict.passes, false);
  });

  it("[rl:first-screen/pictures] the pictures are rendered from files in docs/art, each under 1.5 MB, with nothing installed with genter-cli", () => {
    const png = (file) => {
      const b = readFileSync(at(file));
      assert.equal(b.subarray(1, 4).toString(), "PNG", file);
      return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
    };
    assert.deepEqual(png("docs/hero.png"), png("docs/hero-dark.png"), "light and dark are the same picture");
    assert.equal(png("docs/hero.png").width, 1520, "twice the 760 the README shows");
    assert.equal(readFileSync(at("docs/demo.gif")).subarray(0, 6).toString(), "GIF89a");
    for (const file of ["docs/hero.png", "docs/hero-dark.png", "docs/demo.gif"]) assert.ok(statSync(at(file)).size < 1.5 * MB, file);
    for (const file of ["docs/art/hero.html", "docs/art/terminal.html", "docs/art/render.mjs", "docs/art/demo.txt"]) assert.ok(existsSync(at(file)), file);
    // Dark is drawn for, in the page the pictures come from.
    assert.match(text("docs/art/hero.html"), /@media \(prefers-color-scheme: dark\)/);
    const pkg = JSON.parse(text("package.json"));
    assert.equal(pkg.dependencies, undefined);
    assert.ok(!pkg.files.some((f) => f.startsWith("docs")), "the pictures are not shipped");
  });

  it("[rl:first-screen/gif-real] the GIF is made from what `genter demo` prints, and no frame shows a line it did not print", () => {
    const printed = demoOutput();
    assert.equal(text("docs/art/demo.txt"), printed, "docs/art/demo.txt is what the demo prints: run node docs/art/render.mjs demo");
    // The frames: every line once, in order, each step adding the lines after the last.
    const lines = printed.replace(/\n$/, "").split("\n");
    const list = steps(lines);
    assert.equal(list[0].from, 0);
    assert.equal(list.at(-1).to, lines.length - 1);
    for (let i = 1; i < list.length; i++) assert.equal(list[i].from, list[i - 1].to + 1);
    const seconds = list.reduce((n, s) => n + s.hold, 0);
    assert.ok(seconds >= 15 && seconds <= 25, `about 20 seconds: ${seconds}`);
    // The window around them holds no words of its own: no title, no prompt.
    const page = text("docs/art/terminal.html");
    const body = page.slice(page.indexOf("<body>") + 6, page.indexOf("</body>"));
    assert.equal(body.trim(), "<!-- frames -->");
    assert.doesNotMatch(page.replace(/<!--[\s\S]*?-->/g, "").replace(/<style>[\s\S]*?<\/style>/, ""), /<(?:pre|p|span|div)[^>]*>[^<\s]/);
  });

  it("[rl:first-screen/links-resolve] every link and picture resolves: files that are here, anchors that are headings, editor links that add the server `genter install` adds", () => {
    const local = { args: ["-y", "genter-cli", "mcp"] };
    for (const file of READMES) {
      const md = text(file);
      const found = links(md);
      assert.ok(found.length > 20, `${file}: ${found.length} links`);
      for (const link of found) {
        if (/^[a-z]+:/.test(link)) {
          assert.match(link, /^https:\/\//, `${file}: ${link}`);
          assert.doesNotMatch(link, /\/releases\/download\//, `${file}: no release carries a download yet`);
          continue;
        }
        const [path, anchor] = link.split("#");
        const target = path ? normalize(join(dirname(at(file)), path)) : at(file);
        assert.ok(target.startsWith(root) && existsSync(target), `${file}: ${link} is not here`);
        if (anchor) assert.ok(anchors(readFileSync(target, "utf8")).has(decodeURIComponent(anchor)), `${file}: ${link} names no heading`);
      }
      // Add to Cursor and Install in VS Code: each editor's install link, carrying the entry `genter install` writes there.
      const cursorLink = found.find((l) => l.startsWith("https://cursor.com/install-mcp?"));
      const c = new URL(cursorLink).searchParams;
      assert.equal(c.get("name"), "genter");
      assert.deepEqual(JSON.parse(Buffer.from(c.get("config"), "base64").toString()), cursor.local(local));
      const vscodeLink = found.find((l) => l.startsWith("https://vscode.dev/redirect/mcp/install?"));
      const v = new URL(vscodeLink).searchParams;
      assert.equal(v.get("name"), "genter");
      assert.deepEqual(JSON.parse(v.get("config")), vscode.local(local));
      // The .mcpb: the releases page, until a release carries one.
      assert.ok(found.includes("https://github.com/Genterai/genter/releases"));
      // Add to Claude and Add to ChatGPT: the steps for Genter Cloud's one address.
      const cloud = found.filter((l) => l.startsWith("#") && /claude|chatgpt/.test(l));
      assert.equal(cloud.length, 2, `${file}: ${cloud}`);
    }
    // Each names the other at its top.
    assert.match(text("README.md").split("\n")[0], /href="README\.ru\.md">Русский</);
    assert.match(text("README.ru.md").split("\n")[0], /href="README\.md">English</);
  });

  it("[rl:first-screen/numbers-named] every number stated as a measurement names the file in bench/ it comes from, and the counts are that file's", () => {
    for (const file of READMES) {
      for (const block of blocks(text(file))) {
        if (!MEASURE.test(words(block))) continue;
        const named = links(block).filter((l) => l.startsWith("bench/") && existsSync(at(l.split("#")[0])));
        assert.ok(named.length, `${file}: a number with no file in bench/ beside it: ${block.slice(0, 200)}`);
      }
    }
    // The old-answer test's counts, as its latest run wrote them.
    const { plain: p, genter: g } = latest("bench/old-answer/results").totals;
    const n = p.n;
    const en = text("README.md");
    for (const row of [
      `| old answer unmarked in the first five | ${p.old_unmarked} of ${n} | **${g.old_unmarked} of ${n}** |`,
      `| old answer first | ${p.old_first} of ${n} | ${g.old_first} of ${n} |`,
      `| current answer first | ${p.current_first} of ${n} | ${g.current_first} of ${n} |`,
    ])
      assert.ok(en.includes(row), row);
    assert.ok(plain(en).includes(`${n} questions whose answer was replaced`));
    assert.ok(plain(en).includes(`unmarked in its first five on ${p.old_unmarked} of ${n}; Genter on ${g.old_unmarked} of ${n}`));
    assert.ok(plain(en).includes(`old answer first on ${g.old_first} of ${n} (plain ranking: ${p.old_first} of ${n})`));
    const ru = text("README.ru.md");
    for (const row of [
      `| старый ответ без отметки в первой пятёрке | ${p.old_unmarked} из ${n} | **${g.old_unmarked} из ${n}** |`,
      `| старый ответ первым | ${p.old_first} из ${n} | ${g.old_first} из ${n} |`,
      `| актуальный ответ первым | ${p.current_first} из ${n} | ${g.current_first} из ${n} |`,
    ])
      assert.ok(ru.includes(row), row);
    // The 50-repository gate's verdict.
    const v = latest("bench/repos/results").verdict;
    assert.ok(plain(en).includes(`of ${v.repos} popular ones, the median holds ${v.median_records} records`));
    assert.ok(plain(en).includes(`${v.with_marks} of ${v.repos} hold at least one document with a mark`));
    assert.ok(plain(ru).includes(`в медианном из ${v.repos} популярных репозиториев ${v.median_records} записей`));
    assert.ok(plain(ru).includes(`${v.with_marks} из ${v.repos} содержат`));
    // DriftBench's tables are in the English README only, where its guard reads them.
    assert.match(en, /^\| \*\*genter\*\* \|/m);
    assert.doesNotMatch(ru, /driftbench:start|\| \*\*genter\*\* \|/);
  });

  it("[rl:first-screen/npm-name] both say the package is genter-cli, and that npm's genter is someone else's", () => {
    assert.ok(text("README.md").includes("> The package is `genter-cli`. The npm package called `genter` belongs to someone else."));
    assert.ok(text("README.ru.md").includes("> Пакет называется `genter-cli`. Пакет `genter` в npm принадлежит кому-то другому."));
  });
});
