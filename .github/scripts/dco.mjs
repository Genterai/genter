// The Developer Certificate of Origin (https://developercertificate.org) in place of a CLA: every commit a pull request
// adds says, in a "Signed-off-by: Name <email>" line (`git commit -s`), that its author may give it under this
// repository's licence. One script and plain git, no app: .github/workflows/dco.yml runs `node .github/scripts/dco.mjs`
// with DCO_BASE, DCO_HEAD and DCO_PR_AUTHOR. Read by test/community.test.js.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Pull requests opened by these accounts are not checked: their commits are made by a service, not signed by a person.
// It is the pull request's opener that counts, never a commit's author line, which anyone can write.
export const EXEMPT = ["dependabot[bot]"];

const SIGN_OFF = /^Signed-off-by:[ \t]+(\S[^<>\n]*?)[ \t]+<([^<>\s@]+@[^<>\s@]+)>[ \t]*\r?$/gim;

// The sign-offs in a commit message: [{ name, email }].
export const signOffs = (message) => [...message.matchAll(SIGN_OFF)].map((m) => ({ name: m[1], email: m[2] }));

// commits: [{ sha, subject, parents, authorEmail, committerEmail, message }]. A merge commit (the "update branch"
// button) is nobody's change and is skipped. A sign-off must be the author's or the committer's own address, so that
// nobody signs for someone else. { exempt?, failures: [{ sha, subject, why }] }.
export function check(commits, { prAuthor = "" } = {}) {
  if (EXEMPT.includes(prAuthor)) return { exempt: prAuthor, failures: [] };
  const failures = [];
  for (const c of commits) {
    if (c.parents > 1) continue;
    const marks = signOffs(c.message);
    const own = [c.authorEmail, c.committerEmail].filter(Boolean).map((e) => e.toLowerCase());
    if (!marks.length) failures.push({ sha: c.sha, subject: c.subject, why: "no Signed-off-by line" });
    else if (!marks.some((m) => own.includes(m.email.toLowerCase()))) failures.push({ sha: c.sha, subject: c.subject, why: `signed off as ${marks.map((m) => m.email).join(", ")}, which is neither its author (${c.authorEmail}) nor its committer (${c.committerEmail})` });
  }
  return { failures };
}

// The commits of base..head, from git, each read from its own raw object: the headers end at the first empty line and
// the message is all that follows, so nothing a message says (a tab, a control character, a line that looks like a
// header) can move a field or turn a commit into a merge.
export function commitsBetween(base, head, cwd = process.cwd()) {
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return git("rev-list", `${base}..${head}`)
    .split("\n")
    .filter(Boolean)
    .map((sha) => {
      const raw = git("cat-file", "commit", sha);
      const cut = raw.indexOf("\n\n");
      const headers = (cut < 0 ? raw : raw.slice(0, cut)).split("\n").filter((line) => !line.startsWith(" "));
      const message = cut < 0 ? "" : raw.slice(cut + 2);
      const emailOf = (key) => /<([^<>]*)>[^<>]*$/.exec(headers.find((line) => line.startsWith(`${key} `)) ?? "")?.[1] ?? "";
      return { sha, subject: message.split("\n")[0], parents: headers.filter((line) => line.startsWith("parent ")).length, authorEmail: emailOf("author"), committerEmail: emailOf("committer"), message };
    });
}

const HOW = `Sign off with the address you commit with:
  git rebase --signoff origin/main     (every commit of the branch)
  git commit --amend --signoff --no-edit     (only the last one)
then git push --force-with-lease. From now on, git commit -s signs off as it commits.
What signing off means: https://developercertificate.org`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { DCO_BASE: base, DCO_HEAD: head, DCO_PR_AUTHOR: prAuthor = "" } = process.env;
  if (!base || !head) {
    console.error("DCO_BASE and DCO_HEAD name the commits to check");
    process.exit(1);
  }
  const commits = commitsBetween(base, head);
  const { exempt, failures } = check(commits, { prAuthor });
  if (exempt) console.log(`Pull request by ${exempt}: not checked.`);
  else if (!failures.length) console.log(`${commits.filter((c) => c.parents <= 1).length} commit(s), all signed off.`);
  else {
    for (const f of failures) console.error(`${f.sha.slice(0, 7)} ${f.subject}: ${f.why}`);
    console.error(`\n${HOW}`);
    process.exit(1);
  }
}
