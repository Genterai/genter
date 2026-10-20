// The Claude Desktop extension, genter.mcpb: the files `npm publish` ships (so the extension runs what `npx genter-cli`
// runs, with nothing else to install) and manifest.json, gathered in one folder that `mcpb pack` zips. The release
// workflow runs it: `node .github/scripts/mcpb.mjs stage <folder>`. Read by test/packaging.test.js.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL("../..", import.meta.url));

// The files of npm's tarball, as paths from the package root: npm's own list, so the bundle cannot drift from the package.
export function packedFiles(root = here) {
  const out = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return JSON.parse(out)[0].files.map((f) => f.path);
}

// The files a manifest points at: where the server starts from, and each ${__dirname}/ path it passes the server.
export function pointedAt(manifest) {
  const { entry_point: entry, mcp_config: config } = manifest.server;
  const args = (config.args ?? []).map((a) => /^\$\{__dirname\}\/(.+)$/.exec(a)?.[1]).filter(Boolean);
  return [...new Set([entry, ...args])];
}

// Gathers the package's files and the manifest in an empty folder (made when it is not there), and says which files.
export function stage(folder, root = here) {
  const dest = resolve(folder);
  if (existsSync(dest) && readdirSync(dest).length) throw new Error(`${dest} is not empty: stage into a new folder`);
  const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
  const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
  if (manifest.version !== version) throw new Error(`manifest.json is ${manifest.version} and package.json ${version}: run node .github/scripts/versions.mjs`);
  const files = [...new Set([...packedFiles(root), "manifest.json"])].sort();
  for (const file of files) {
    mkdirSync(dirname(join(dest, file)), { recursive: true });
    copyFileSync(join(root, file), join(dest, file));
  }
  const missing = pointedAt(manifest).filter((file) => !files.includes(file));
  if (missing.length) throw new Error(`manifest.json starts the server from ${missing.join(", ")}, which the package does not ship`);
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, folder] = process.argv.slice(2);
  if (command !== "stage" || !folder) {
    console.error("node .github/scripts/mcpb.mjs stage <new folder>");
    process.exit(1);
  }
  try {
    const files = stage(folder);
    console.log(`${files.length} files in ${resolve(folder)}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
