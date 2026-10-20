// A release's notes start with its section of CHANGELOG.md (plain words, what can break first), and the release job
// puts GitHub's list of the pull requests merged since the release before after it:
// `node .github/scripts/notes.mjs <version>` prints the section, and exits 1 when CHANGELOG.md has none. The tests ask
// for package.json's version, so a release without notes fails before anything is published. Read by
// test/packaging.test.js.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL("../..", import.meta.url));
const HEADING = /^## \[?v?(\d+\.\d+\.\d+[0-9A-Za-z.+-]*)\]?(?:\s|$)/;

// The text under `## <version>` (or `## [<version>] - <date>`) up to the next `## `, trimmed; null when there is none.
export function notesOf(version, changelog = readFileSync(join(here, "CHANGELOG.md"), "utf8")) {
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((line) => HEADING.exec(line)?.[1] === version);
  if (start < 0) return null;
  const next = lines.findIndex((line, i) => i > start && line.startsWith("## "));
  return lines.slice(start + 1, next < 0 ? lines.length : next).join("\n").trim() || null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const version = process.argv[2];
  const notes = version && notesOf(version);
  if (!notes) {
    console.error(version ? `CHANGELOG.md has no section for ${version}: add "## ${version}" with what it brings` : "node .github/scripts/notes.mjs <version>");
    process.exit(1);
  }
  console.log(notes);
}
