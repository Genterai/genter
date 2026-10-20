// The README's pictures, rendered from the files beside this one so anyone can make them again:
//
//   node docs/art/render.mjs          # all three
//   node docs/art/render.mjs hero     # docs/hero.png and docs/hero-dark.png from docs/art/hero.html
//   node docs/art/render.mjs demo     # docs/art/demo.txt and docs/demo.gif from `genter demo`
//
// It needs Chromium through Playwright's command line (`npx playwright@1.56.1`, fetched by npx, never a dependency of
// genter-cli: run `npx playwright@1.56.1 install chromium` once if npx says the browser is missing) and ffmpeg. The
// GIF is made from what `node bin/genter.js demo` prints when this runs: its lines are written to docs/art/demo.txt
// (test/first-screen.test.js fails when the demo prints anything else, so the GIF is made again) and each frame shows the
// lines printed up to that point, nothing typed in. The demo takes about a tenth of a second; the frames are paced to
// be read. Each run records in docs/art/rendered.json the SHA-256 of every picture it made and of the files it made it
// from, so the test fails when a picture or one of its sources changes without a new render.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const art = join(root, "docs/art");
const PLAYWRIGHT = "playwright@1.56.1";
const LIMIT = 1.5 * 1024 * 1024; // each picture stays under 1.5 MB
const RENDERED = join(art, "rendered.json");

export const sha256 = (path) => createHash("sha256").update(readFileSync(join(root, path))).digest("hex");

// Writes down, for each picture just made, its digest and the digests of the files it was made from.
function record(pictures, from) {
  let all = {};
  try {
    all = JSON.parse(readFileSync(RENDERED, "utf8"));
  } catch {}
  for (const picture of pictures) all[picture] = { sha256: sha256(picture), from: Object.fromEntries(from.map((f) => [f, sha256(f)])) };
  const sorted = Object.fromEntries(Object.entries(all).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(RENDERED, `${JSON.stringify(sorted, null, 2)}\n`);
}

// One full-page screenshot at twice the pixels, in the colour scheme asked.
function shot(file, out, { width, height, scheme = "light" }) {
  const args = ["-y", PLAYWRIGHT, "screenshot", "--device=Desktop Chrome HiDPI", `--viewport-size=${width},${height}`, "--full-page", `--color-scheme=${scheme}`, "--wait-for-timeout=300"];
  execFileSync("npx", [...args, pathToFileURL(file).href, out], { stdio: ["ignore", "ignore", "inherit"] });
}

function small(file) {
  const { size } = statSync(file);
  if (size > LIMIT) throw new Error(`${file} is ${size} bytes, over ${LIMIT}`);
  console.log(`${file.slice(root.length)} ${size} bytes`);
}

function hero() {
  for (const [scheme, name] of [["light", "hero.png"], ["dark", "hero-dark.png"]]) {
    const out = join(root, "docs", name);
    shot(join(art, "hero.html"), out, { width: 760, height: 400, scheme });
    small(out);
  }
  record(["docs/hero.png", "docs/hero-dark.png"], ["docs/art/hero.html"]);
}

// What `genter demo` prints now, in a temp folder of its own, with no colour and no key in its environment.
export function demoOutput() {
  const tmp = mkdtempSync(join(tmpdir(), "genter-art-"));
  try {
    const env = { PATH: process.env.PATH, HOME: tmp, GENTER_HOME: join(tmp, "home"), TMPDIR: tmp, NO_COLOR: "1" };
    return execFileSync(process.execPath, [join(root, "bin/genter.js"), "demo"], { cwd: tmp, env, encoding: "utf8" });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// The steps the lines appear in, cut where the output itself turns: a command, the answer's places, a line of the
// story, what changed since the last look, the next command. Each step's hold, in seconds, by what it starts with.
export function steps(lines) {
  const cut = (l) => /^\$ /.test(l) || /^ {2}\[\d+\] /.test(l) || /^ {2}Since the last look/.test(l) || /^[A-Z]/.test(l);
  const out = [];
  lines.forEach((l, i) => {
    if (i === 0 || cut(l)) out.push({ from: i, to: i, first: l });
    else out.at(-1).to = i;
  });
  const hold = (s, last) => (last ? 3.5 : /^\$ /.test(s.first) ? 0.9 : /^ {2}Since/.test(s.first) ? 1.4 : /^ {2}\[\d+\] /.test(s.first) ? 3.4 : s.from === 0 ? 1.6 : 3.6);
  return out.map((s, i) => ({ ...s, hold: hold(s, i === out.length - 1) }));
}

const html = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function demo() {
  const printed = demoOutput();
  writeFileSync(join(art, "demo.txt"), printed);
  const lines = printed.replace(/\n$/, "").split("\n");
  const list = steps(lines);
  const frame = (to) => {
    const shown = lines.slice(0, to + 1).map((l) => (/^\$ /.test(l) ? `<b>${html(l)}</b>` : html(l)));
    return `<div class="frame"><div class="win"><div class="bar"><i></i><i></i><i></i></div><pre>${shown.join("\n")}</pre></div></div>`;
  };
  const page = readFileSync(join(art, "terminal.html"), "utf8").replace("<!-- frames -->", list.map((s) => frame(s.to)).join("\n"));
  const tmp = mkdtempSync(join(tmpdir(), "genter-gif-"));
  try {
    writeFileSync(join(tmp, "frames.html"), page);
    const column = join(tmp, "frames.png");
    shot(join(tmp, "frames.html"), column, { width: 940, height: 600 });
    // The column is 2x: each frame 1880 by 1200 pixels, one under the other.
    const concat = [];
    list.forEach((s, i) => {
      const png = join(tmp, `f${i}.png`);
      execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", column, "-vf", `crop=1880:1200:0:${i * 1200},scale=1128:-1:flags=lanczos`, png]);
      concat.push(`file '${png}'`, `duration ${s.hold}`);
    });
    concat.push(`file '${join(tmp, `f${list.length - 1}.png`)}'`); // the concat demuxer drops the last duration otherwise
    writeFileSync(join(tmp, "frames.txt"), `${concat.join("\n")}\n`);
    const gif = join(root, "docs/demo.gif");
    const filter = "split[a][b];[a]palettegen=max_colors=48:stats_mode=full[p];[b][p]paletteuse=dither=none:diff_mode=rectangle";
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", join(tmp, "frames.txt"), "-filter_complex", filter, "-loop", "0", gif]);
    small(gif);
    record(["docs/demo.gif"], ["docs/art/demo.txt", "docs/art/terminal.html"]);
    console.log(`${list.length} frames, ${list.reduce((n, s) => n + s.hold, 0).toFixed(1)} s`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const what = process.argv[2] ?? "all";
  if (what === "hero" || what === "all") hero();
  if (what === "demo" || what === "all") demo();
}
