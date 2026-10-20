// package.json's version is the release; the registry entry (server.json, twice) and the Claude Desktop extension
// (manifest.json) name it too, and must say the same. `node .github/scripts/versions.mjs` writes it into them (after
// raising "version" in package.json); `--check` only says which differ. Read by test/packaging.test.js.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL("../..", import.meta.url));
const FILES = ["server.json", "manifest.json"];
const LINE = /^(\s*"version": ")([^"]*)(")/gm;

export const versionOf = (root = here) => JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

// [{ file, found }]: each version those files name that is not package.json's.
export function mismatches(root = here) {
  const version = versionOf(root);
  return FILES.flatMap((file) => [...readFileSync(join(root, file), "utf8").matchAll(LINE)].map((m) => ({ file, found: m[2] }))).filter((m) => m.found !== version);
}

// Writes package.json's version into them, line by line, so nothing else in a file moves.
export function sync(root = here) {
  const version = versionOf(root);
  for (const file of FILES) {
    const path = join(root, file);
    writeFileSync(path, readFileSync(path, "utf8").replace(LINE, `$1${version}$3`));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === "--check") {
    const wrong = mismatches();
    for (const { file, found } of wrong) console.error(`${file} says ${found}, package.json says ${versionOf()}`);
    process.exit(wrong.length ? 1 : 0);
  }
  sync();
  console.log(`${FILES.join(" and ")}: ${versionOf()}`);
}
