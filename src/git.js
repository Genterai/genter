import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { realOf } from "./local.js";

// The commit a checkout is at, read from its .git with fs alone: Genter runs nothing (security/never-run), `git`
// included. HEAD holds a commit, or names a branch whose commit is in a loose ref file (refs/heads/<branch>) or in
// packed-refs. A worktree's or a submodule's .git is a file naming its own git folder, whose commondir names the folder
// that holds the branches. A repository whose refs are in git's reftable format (binary tables in .git/reftable, HEAD a
// placeholder naming refs/heads/.invalid) cannot be read this way, and says so.

const SHA = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const HOPS = 5;

const textOf = (path) => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
};

// The git checkout a folder is in: the first folder up from it that holds .git, never the home folder or the root (as
// projectOf in local.js: a home folder kept in git does not make every folder under it a repository).
// { root, commit, branch? }: commit is null when HEAD names a branch with no commit yet; null when no folder up from it
// holds .git. Throws, saying why, when a .git is there but cannot be read.
export function headOf(folder, home = homedir()) {
  const stop = new Set([resolve(home), realOf(resolve(home))]);
  for (let dir = resolve(folder); !stop.has(dir) && dirname(dir) !== dir; dir = dirname(dir)) {
    const dotgit = join(dir, ".git");
    let st = null;
    try {
      st = statSync(dotgit);
    } catch {}
    if (!st) continue;
    return { root: dir, ...headIn(st.isDirectory() ? dotgit : linked(dir, dotgit)) };
  }
  return null;
}

// A .git file: "gitdir: <path>", the path from the folder that holds it or absolute.
function linked(dir, dotgit) {
  const to = /^gitdir: *(.+?)\s*$/m.exec(textOf(dotgit) ?? "")?.[1];
  if (!to) throw new Error(`${dotgit} names no git folder`);
  return resolve(dir, to);
}

// HEAD in a git folder, followed to its commit: { commit, branch? }. A branch is a name under refs/ with no ".." in it,
// looked for in the folder that holds the branches (commondir), then in the git folder itself, then in packed-refs.
function headIn(gitDir) {
  const head = textOf(join(gitDir, "HEAD"));
  if (head == null) throw new Error(`${join(gitDir, "HEAD")} cannot be read`);
  const shared = textOf(join(gitDir, "commondir"))?.trim();
  const common = shared ? resolve(gitDir, shared) : gitDir;
  if (existsSync(join(common, "reftable")) || /^ref: *refs\/heads\/\.invalid\s*$/.test(head)) {
    throw new Error(`${common} keeps its branches in git's reftable format, which Genter cannot read without running git: the commit cannot be stamped`);
  }
  let ref = head.trim();
  let branch;
  for (let hop = 0; hop < HOPS; hop++) {
    if (SHA.test(ref)) return { commit: ref, ...(branch && { branch }) };
    const name = /^ref: *(refs\/[^\s\\]+)$/.exec(ref)?.[1];
    if (!name || name.split("/").some((part) => part === ".." || part === "." || part === "")) throw new Error(`${join(gitDir, "HEAD")} names neither a commit nor a branch`);
    branch ??= name.replace(/^refs\/heads\//, "");
    const loose = textOf(join(common, name)) ?? (common !== gitDir ? textOf(join(gitDir, name)) : null);
    const next = loose?.trim() ?? packed(common, name);
    if (!next) return { commit: null, branch };
    ref = next;
  }
  throw new Error(`${join(gitDir, "HEAD")} names a branch through more than ${HOPS} names`);
}

// A branch's commit in packed-refs ("<commit> <name>" lines; "#" and "^" lines are not branches), or null.
function packed(common, name) {
  for (const line of (textOf(join(common, "packed-refs")) ?? "").split("\n")) {
    const [commit, ref] = line.trim().split(" ");
    if (ref === name && SHA.test(commit)) return commit;
  }
  return null;
}
