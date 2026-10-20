import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { demoOutput, sha256, steps } from "../docs/art/render.mjs";
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

// What a reader sees of HTML and Markdown: tags, links' addresses and line breaks gone, spaces collapsed.
const plain = (s) =>
  s
    .replace(/<br>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
// The part above the first rule (---): the first screen.
const firstScreen = (s) => s.slice(0, s.indexOf("\n---\n"));
// The latest results of a bench: the file its RESULTS.md names, both written by the same run (a run may name its file
// for what it adds, results/2026-10-20-chain.json, so the newest name alone does not say which is latest).
function latest(bench) {
  const named = /the numbers are in \[(results\/[^\]]+\.json)\]/.exec(text(join(bench, "RESULTS.md")));
  assert.ok(named, `${bench}/RESULTS.md names no results file`);
  return JSON.parse(text(join(bench, named[1])));
}
// The 50-repository gate's verdict, judged on the held-out sample; the first 50 beside it (a run before the held-out
// sample had one verdict, on the first 50).
const sample = (results, id) => (results.samples ? results.samples.find((s) => s.id === id)?.verdict : id === "first" ? results.verdict : undefined);
const gate = (results) => sample(results, "heldout") ?? sample(results, "first");
// The readers in readers/: a folder with a manifest.
const readerCount = () => readdirSync(at("readers"), { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(at(join("readers", d.name, "reader.json")))).length;
// A PEP as the READMEs name it: peps/pep-0566.rst is PEP 566.
function pep(path) {
  const m = /(?:^|\/)pep-0*(\d+)\.[a-z]+$/.exec(path);
  assert.ok(m, `${path} is not a PEP the READMEs can name`);
  return `PEP ${m[1]}`;
}
// A count in Russian: 1 ридер, 2 ридера, 5 ридеров, 21 ридер.
const ru = (n, [one, few, many]) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? few : many}`;
// A question an arm does worse on than plain ranking, the current answer counted with its chain or as written
// (old-answer/losses-published).
function lost(q, written) {
  const first = written ? "written_first" : "current_first";
  const top5 = written ? "written_top5" : "current_top5";
  const { plain: p, genter: g } = q;
  return g.old_first || g.old_unmarked || (p[first] && !g[first]) || (p[top5] && !g[top5]);
}
// The files a picture was made from, as docs/art/render.mjs recorded them; the picture and each of them unchanged since.
function madeFrom(picture) {
  const made = JSON.parse(text("docs/art/rendered.json"))[picture];
  assert.ok(made, `${picture} has no record in docs/art/rendered.json: run node docs/art/render.mjs`);
  assert.equal(sha256(picture), made.sha256, `${picture} is not the picture docs/art/render.mjs made: run it`);
  for (const [source, digest] of Object.entries(made.from)) assert.equal(sha256(source), digest, `${source} changed since ${picture} was made: run node docs/art/render.mjs`);
  return Object.keys(made.from).sort();
}

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
    assert.equal(gate(latest("bench/repos")).passes, false);
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
    // Each PNG is the one rendered from hero.html as it is now.
    for (const file of ["docs/hero.png", "docs/hero-dark.png"]) assert.deepEqual(madeFrom(file), ["docs/art/hero.html"], file);
    assert.deepEqual(Object.keys(JSON.parse(text("docs/art/rendered.json"))).sort(), ["docs/demo.gif", "docs/hero-dark.png", "docs/hero.png"]);
    // Dark is drawn for, in the page the pictures come from.
    assert.match(text("docs/art/hero.html"), /@media \(prefers-color-scheme: dark\)/);
    const pkg = JSON.parse(text("package.json"));
    assert.equal(pkg.dependencies, undefined);
    assert.ok(!pkg.files.some((f) => f.startsWith("docs")), "the pictures are not shipped");
  });

  it("[rl:first-screen/gif-real] the GIF is made from what `genter demo` prints, and no frame shows a line it did not print", () => {
    const printed = demoOutput();
    assert.equal(text("docs/art/demo.txt"), printed, "docs/art/demo.txt is what the demo prints: run node docs/art/render.mjs demo");
    // The GIF is the one rendered from that demo.txt, in that window: demo.txt refreshed by hand leaves it stale, and fails.
    assert.deepEqual(madeFrom("docs/demo.gif"), ["docs/art/demo.txt", "docs/art/terminal.html"]);
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
    // The old-answer test's counts, as its latest run wrote them: the table, every sentence that states one, and the
    // Benchmarks section, in both languages. The current answer is counted with its chain and as written.
    const results = latest("bench/old-answer");
    const { plain: p, genter: g } = results.totals;
    const n = p.n;
    assert.ok(Number.isInteger(g.written_first), "the latest old-answer run counts the current answer both ways");
    const drift = results.sources.find((s) => s.id === "driftbench").plain.n;
    const archive = n - drift;
    // The questions whose first result is not plain ranking's, and how many of them are the archives'.
    const differ = results.questions.filter((q) => q.plain.first !== q.genter.first);
    const differArchive = differ.filter((q) => q.source !== "driftbench").length;
    // The questions where both arms put another document first, neither the old answer nor the current one.
    const other = results.questions.filter((q) => [q.plain, q.genter].every((a) => !a.old_first && !a.current_first)).length;
    // Genter's losses both ways, and the questions the chain changed (named under Benchmarks).
    const losses = results.questions.filter((q) => lost(q, false)).length;
    const lossesWritten = results.questions.filter((q) => lost(q, true)).length;
    const changed = results.questions.filter((q) => [q.plain, q.genter].some((a) => a.current_first !== a.written_first));
    const chained = changed.map((q) => q.id);
    assert.ok(chained.length, "the chain changes a question, which the README names");
    // On each, what both arms put first, as the Benchmarks sections say it: plain ranking the document the question
    // was written for, Genter the last of its chain, so counted as written it is a loss and with the chain none.
    for (const q of changed) {
      assert.equal(q.plain.first, q.current, `${q.id}: plain ranking puts first the document the question was written for`);
      assert.equal(q.genter.first, q.later.at(-1).place, `${q.id}: Genter puts first the last of its chain`);
      assert.ok(lost(q, true) && !lost(q, false), `${q.id}: a loss as written, none with the chain`);
    }
    const oneLoss = lossesWritten === 1;
    // The 50-repository gate: its verdict on the held-out sample, and the first 50 beside it.
    const repos = latest("bench/repos");
    const h = gate(repos);
    const f = sample(repos, "first");
    const readers = readerCount();
    const en = text("README.md");
    const ru_ = text("README.ru.md");
    const said = {
      "README.md": [
        `| old answer unmarked in the first five | ${p.old_unmarked} of ${n} | **${g.old_unmarked} of ${n}** |`,
        `| old answer first | ${p.old_first} of ${n} | **${g.old_first} of ${n}** |`,
        `| current answer first, with its chain | ${p.current_first} of ${n} | **${g.current_first} of ${n}** |`,
        `| current answer first, as written | ${p.written_first} of ${n} | ${g.written_first} of ${n} |`,
        `| of ${n} questions (results) | plain ranking |`,
        `${n} questions whose answer was replaced: ${archive} from public decision archives`,
        `and ${drift} from DriftBench.`,
        `unmarked in its first five on ${p.old_unmarked} of ${n} and puts it first on ${p.old_first} of ${n}; Genter on ${g.old_unmarked} of ${n} for both`,
        `Genter puts the current answer first on ${g.current_first} of ${n} (plain ranking: ${p.current_first} of ${n})`,
        `the current answer being the document the question was written for or a later one the archive's own replacement marks lead to; counted as written, that document alone, ${g.written_first} of ${n} (plain ranking: ${p.written_first} of ${n})`,
        `Genter's first result differs from plain ranking's on ${differ.length} of ${n} questions, ${differArchive} of them among the ${archive} archive questions; on ${other} of ${n} both put another document first`,
        `the losses (${losses} counted with the chain, ${lossesWritten} as written)`,
        `asks ${n} questions whose answer a newer document replaced`,
        `The chain rule was set after a run in which it changed ${chained.length === 1 ? "one question" : `${chained.length} questions`}, ${chained.join(", ")}:`,
        ...changed.map((q) => `plain ranking puts first ${pep(q.plain.first)}, the document the question was written for, and Genter ${pep(q.genter.first)}, the last of that chain, so counted as written that question is ${oneLoss ? "Genter's one loss" : `one of Genter's ${lossesWritten} losses`}`),
        `Its ${readers} readers (readers/) read`,
        "The " + readers + " readers in `readers/` read",
        `of ${h.repos} popular ones the readers were not written for, the median holds ${h.median_records} records the readers read`,
        `The gate is judged on ${h.repos} held out, picked by the same written rule and committed before the readers ran on them: the median holds ${h.median_records} decision records the readers read, ${h.with_records} of ${h.repos} hold 5 or more, and ${h.with_marks} of ${h.repos} hold at least one document with a mark the readers read, so it ${h.passes ? "passes" : "does not pass"}`,
        `On the first ${f.repos}, which the readers were widened looking at (a biased number, shown to compare), the median holds ${f.median_records}, ${f.with_records} of ${f.repos} hold 5 or more and ${f.with_marks} of ${f.repos} a mark.`,
      ],
      "README.ru.md": [
        `| старый ответ без отметки в первой пятёрке | ${p.old_unmarked} из ${n} | **${g.old_unmarked} из ${n}** |`,
        `| старый ответ первым | ${p.old_first} из ${n} | **${g.old_first} из ${n}** |`,
        `| актуальный ответ первым, с цепочкой замен | ${p.current_first} из ${n} | **${g.current_first} из ${n}** |`,
        `| актуальный ответ первым, без цепочки замен | ${p.written_first} из ${n} | ${g.written_first} из ${n} |`,
        `| из ${n} вопросов (результаты) | обычное ранжирование |`,
        `${n} вопросов, ответ на которые заменён более новым документом: ${archive} из публичных архивов решений`,
        `и ${drift} из DriftBench.`,
        `без отметки в первой пятёрке в ${p.old_unmarked} из ${n} и ставит его первым в ${p.old_first} из ${n};`,
        `Genter не делает ни того, ни другого ни в одном вопросе (${g.old_unmarked} из ${n})`,
        `Актуальный ответ Genter ставит первым в ${g.current_first} из ${n} (обычное ранжирование: в ${p.current_first} из ${n})`,
        `актуальным считается документ, для которого написан вопрос, или более поздний, к которому ведут собственные пометки архива о замене. Если считать только этот документ, то в ${g.written_first} из ${n} (обычное ранжирование: в ${p.written_first} из ${n})`,
        `Первый результат у Genter и у обычного ранжирования разный в ${differ.length} из ${n} вопросов, в том числе в ${differArchive} из ${archive} вопросов по архивам; в ${other} из ${n} оба ставят первым другой документ`,
        `проигрыши (${losses} с цепочкой замен, ${lossesWritten} без неё)`,
        `Правило цепочки принято после запуска, в котором оно изменило ${chained.length === 1 ? "один вопрос" : `${chained.length} вопроса`}, ${chained.join(", ")}:`,
        ...changed.map((q) => `обычное ранжирование ставит первым ${pep(q.plain.first)}, для которого написан вопрос, а Genter — ${pep(q.genter.first)}, последний в этой цепочке, так что без цепочки этот вопрос — ${oneLoss ? "единственный проигрыш Genter" : `один из проигрышей Genter (их ${lossesWritten})`}`),
        `${ru(readers, ["ридер", "ридера", "ридеров"])} (readers/) читают`,
        ru(readers, ["ридер", "ридера", "ридеров"]) + " в `readers/` читают",
        `из ${h.repos} популярных репозиториев, которых ридеры не видели, пока их писали, у медианного ${h.median_records} записей`,
        `Итог проверки подводят по ${h.repos} отложенным репозиториям, которые выбраны по тому же записанному правилу и закоммичены до того, как на них запустили ридеры: у медианного репозитория ${h.median_records} записей решений, которые читают ридеры, у ${h.with_records} из ${h.repos} их 5 или больше, а ${h.with_marks} из ${h.repos} содержат хотя бы один документ с пометкой, которую ридеры читают, поэтому проверка ${h.passes ? "пройдена" : "не пройдена"}`,
        `На первых ${f.repos}, глядя на которые ридеры расширяли (число заведомо смещённое, оно для сравнения), медианное число записей — ${f.median_records}, у ${f.with_records} из ${f.repos} их 5 или больше, у ${f.with_marks} из ${f.repos} есть пометка`,
      ],
    };
    for (const [file, sentences] of Object.entries(said)) {
      const md = file === "README.md" ? en : ru_;
      for (const sentence of sentences) assert.ok(md.includes(sentence) || plain(md).includes(sentence), `${file}: ${sentence}`);
    }
    // DriftBench's tables are in the English README only, where its guard reads them.
    assert.match(en, /^\| \*\*genter\*\* \|/m);
    assert.doesNotMatch(ru_, /driftbench:start|\| \*\*genter\*\* \|/);
  });

  it("[rl:first-screen/npm-name] both say the package is genter-cli, and that npm's genter is someone else's", () => {
    assert.ok(text("README.md").includes("> The package is `genter-cli`. The npm package called `genter` belongs to someone else."));
    assert.ok(text("README.ru.md").includes("> Пакет называется `genter-cli`. Пакет `genter` в npm принадлежит кому-то другому."));
  });
});
