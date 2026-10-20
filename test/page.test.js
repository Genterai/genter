import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { headOf } from "../src/git.js";
import { createLocal } from "../src/local.js";
import { decisionsOf, decisionsPage } from "../src/page.js";

const bin = fileURLToPath(new URL("../bin/genter.js", import.meta.url));
const posix = process.platform !== "win32";
const COMMIT = "3f2c1ab9d0e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4";

// A repository with ADRs (one superseded), a runbook replaced by its notice, a CHANGELOG and plain files, under a home
// folder of its own (HOME), so nothing above it counts.
const ACME = {
  ".git/HEAD": "ref: refs/heads/main\n",
  ".git/refs/heads/main": `${COMMIT}\n`,
  "docs/adr/README.md": "# Architecture decision records\n\nOne file per decision, numbered.\n",
  "docs/adr/0001-record-architecture-decisions.md": "# 1. Record architecture decisions\n\nDate: 2025-11-04\n\n## Status\n\nAccepted\n\n## Decision\n\nWe write ADRs.\n",
  "docs/adr/0003-run-jobs-on-postgres.md": "# 3. Run background jobs on Postgres\n\nDate: 2026-03-03\n\n## Status\n\nSuperseded by [11. Run background jobs on Redis](0011-run-jobs-on-redis.md)\n\n## Decision\n\nJobs run on Postgres.\n",
  "docs/adr/0011-run-jobs-on-redis.md": "# 11. Run background jobs on Redis\n\nDate: 2026-09-24\n\n## Status\n\nAccepted\n\n## Decision\n\nJobs run on Redis streams.\n",
  "RUNBOOK.md": "Superseded by [Release process v2](docs/release-process-v2.md)\n\n# Runbook\n\n## Friday\n\nDeploys go out on Fridays from the release branch.\n",
  "docs/release-process-v2.md": "---\ndate: 2026-10-03\n---\n# Release process v2\n\nNo deploys on Fridays since October 3.\n",
  "CHANGELOG.md": "# Changelog\n\n## [2.0.0] - 2026-10-01\n\n### Deprecated\n\n- `acme sync`: use `acme pull` instead.\n",
  "docs/oncall.md": "# On-call\n\nPage the on-call engineer.\n",
  "src/app.js": "// # Not a title\nexport const app = 1;\n",
};

function repo(files = ACME, name = "acme") {
  const base = mkdtempSync(join(tmpdir(), "genter-page-"));
  const home = join(base, "home");
  const dir = join(home, name);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  const genter = join(home, ".genter");
  return { base, home, dir, genter, done: () => rmSync(base, { recursive: true, force: true }) };
}
const rowsOf = (box) => decisionsOf(createLocal({ home: box.genter, secret: "s", cwd: box.dir }).documents());
const pageOf = (box, project = "acme") => decisionsPage({ project, commit: COMMIT, date: "2026-10-20", rows: rowsOf(box) });
const bodyOf = (html) => html.slice(html.indexOf("<body>"));
const run = (box, args = [], cwd = box.dir) => spawnSync(process.execPath, [bin, "decisions", ...args], { cwd, env: { PATH: process.env.PATH, HOME: box.home, GENTER_HOME: box.genter }, encoding: "utf8" });
// Every file under a folder, .git left out: what a command may have written there.
const listing = (dir) => readdirSync(dir, { recursive: true }).filter((f) => !String(f).startsWith(".git")).sort();

const SNAPSHOT = `<body>
<main>
<header>
<h1>Decisions in acme</h1>
<p class="stamp">generated at <code>3f2c1ab</code> on 2026-10-20 · run <code>genter decisions</code> again to refresh</p>
<p class="counts">3 current · 2 replaced, by their own text · dates as the documents give them</p>
</header>
<table>
<thead><tr><th>State</th><th>Decision</th><th>Place</th><th>Its own date</th></tr></thead>
<tbody>
<tr class="current"><td><span class="state">CURRENT</span></td><td>Release process v2</td><td><code>docs/release-process-v2.md:2</code></td><td>2026-10-03</td></tr>
<tr class="current"><td><span class="state">CURRENT</span></td><td>11. Run background jobs on Redis<span class="status"> · Status: accepted</span></td><td><code>docs/adr/0011-run-jobs-on-redis.md:3</code></td><td>2026-09-24</td></tr>
<tr class="current"><td><span class="state">CURRENT</span></td><td>1. Record architecture decisions<span class="status"> · Status: accepted</span></td><td><code>docs/adr/0001-record-architecture-decisions.md:3</code></td><td>2025-11-04</td></tr>
<tr class="replaced with-notice"><td><span class="state">REPLACED</span></td><td>3. Run background jobs on Postgres</td><td><code>docs/adr/0003-run-jobs-on-postgres.md:3</code></td><td>2026-03-03</td></tr>
<tr class="replaced notice"><td></td><td colspan="3"><code>docs/adr/0003-run-jobs-on-postgres.md:7</code> says: “Superseded by [11. Run background jobs on Redis](0011-run-jobs-on-redis.md)” · replaced by <code>docs/adr/0011-run-jobs-on-redis.md</code></td></tr>
<tr class="replaced with-notice"><td><span class="state">REPLACED</span></td><td>Runbook</td><td><code>RUNBOOK.md:3</code></td><td><span class="undated">no date written</span></td></tr>
<tr class="replaced notice"><td></td><td colspan="3"><code>RUNBOOK.md:1</code> says: “Superseded by [Release process v2](docs/release-process-v2.md)” · replaced by <code>docs/release-process-v2.md</code></td></tr>
</tbody>
</table>
<footer>
<p>Each row is what a document says about itself: an ADR's or an RFC's status and date, a heading of a decision log, front matter, a notice at its top. No row is Genter's own verdict, and none says that two documents disagree: that needs a model.</p>
<p>This page quotes the documents of acme: check it before you share it.</p>
</footer>
</main>
</body>
</html>
`;

describe("genter decisions", () => {
  it("[rl:decisions-page/explicit-only] [rl:decisions-page/stamped] a repository with ADRs, one superseded: the page, row by row", () => {
    const box = repo();
    try {
      assert.equal(bodyOf(pageOf(box)), SNAPSHOT);
    } finally {
      box.done();
    }
  });

  it("[rl:decisions-page/explicit-only] a decision log's entries are rows, a mark under an entry is the entry's, and nothing unmarked or undecided is a row", () => {
    const box = repo({
      ...ACME,
      "docs/decisions.md": "# Decisions\n\nOne heading per decision.\n\n## 2026-03-03: Jobs run on Postgres\n\nStatus: superseded by [Jobs run on Redis](#2026-09-24-jobs-run-on-redis)\n\n## 2026-09-24: Jobs run on Redis\n\nStatus: accepted\n",
      "notes/old-dashboard.md": "---\ndate: 2026-01-05\ndeprecated: true\n---\n# Old dashboard\n\nUse the new one.\n",
      "notes/meeting.md": "---\ndate: 2026-06-02\n---\n# Meeting\n\nWe might move to Redis.\n",
      "docs/decisions/0007-flags-in-env.md": "# Flags in the environment\n\n* Status: superseded\n* Date: 2026-04-01\n\n## Context\n\nFlags were env vars.\n",
      "docs/decisions/0008-cache-invoices.md": "# Cache invoices\n\n* Status: proposed\n* Date: 2026-10-12\n",
    });
    try {
      const rows = rowsOf(box);
      const log = rows.filter((r) => r.path === "docs/decisions.md");
      assert.deepEqual(
        log.map((r) => [r.state, r.title, r.line, r.date]),
        [
          ["current", "Jobs run on Redis", 9, "2026-09-24"],
          ["replaced", "Jobs run on Postgres", 5, "2026-03-03"],
        ],
      );
      assert.deepEqual(log[1].notice, { line: 7, quote: "Status: superseded by [Jobs run on Redis](#2026-09-24-jobs-run-on-redis)" });
      assert.deepEqual(log[1].by, { name: "Jobs run on Redis" });
      // Front matter that says it is deprecated is a row; front matter with only a date is not a decision.
      const dashboard = rows.find((r) => r.path === "notes/old-dashboard.md");
      assert.equal(dashboard.state, "replaced");
      assert.equal(dashboard.date, "2026-01-05");
      // A status of a replaced kind with no line naming what replaces it: replaced, by that status; any other status is
      // shown as the document gives it.
      const flags = rows.find((r) => r.path === "docs/decisions/0007-flags-in-env.md");
      assert.deepEqual([flags.state, flags.notice], ["replaced", { line: 3, status: "superseded" }]);
      assert.match(bodyOf(pageOf(box)), /<code>docs\/decisions\/0007-flags-in-env\.md:3<\/code> gives its status as “superseded” · it names nothing that replaces it/);
      const cache = rows.find((r) => r.path === "docs/decisions/0008-cache-invoices.md");
      assert.deepEqual([cache.state, cache.status, cache.date], ["current", "proposed", "2026-10-12"]);
      assert.ok(!rows.some((r) => ["notes/meeting.md", "CHANGELOG.md", "docs/oncall.md", "docs/adr/README.md", "src/app.js"].includes(r.path)), JSON.stringify(rows.map((r) => r.path)));
      // No row is Genter's own: every replaced row quotes a line of its document, as it is written there.
      for (const r of rows.filter((x) => x.notice?.quote)) {
        const lines = readFileSync(join(box.dir, r.path), "utf8").split("\n");
        assert.equal(lines[r.notice.line - 1].trim(), r.notice.quote, `${r.path}:${r.notice.line}`);
      }
      // A date is the document's own, never its file's time.
      for (const r of rows.filter((x) => x.date)) assert.ok(readFileSync(join(box.dir, r.path), "utf8").includes(r.date), `${r.path} gives ${r.date}`);
      assert.ok(!/disagree|contradict/i.test(bodyOf(pageOf(box)).replace(/<footer>[\s\S]*<\/footer>/, "")), "no disagreement rows");
    } finally {
      box.done();
    }
  });

  it("[rl:decisions-page/escaped] a heading holding <script> renders as text, and so does every other text a document gives", () => {
    const box = repo({
      ...ACME,
      "docs/adr/0012-<b>bold.md": '# 12. Use <script>alert("x")</script> & \'quotes\'\n\nDate: 2026-10-01\n\n## Status\n\nSuperseded by [<img src=x onerror=alert(1)>](0011-run-jobs-on-redis.md)\n',
    });
    try {
      const html = pageOf(box, "<i>acme</i>");
      assert.ok(html.includes("12. Use &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;quotes&#39;"), html);
      assert.ok(html.includes("docs/adr/0012-&lt;b&gt;bold.md:3"));
      assert.ok(html.includes("Superseded by [&lt;img src=x onerror=alert(1)&gt;](0011-run-jobs-on-redis.md)"));
      assert.ok(html.includes("<title>Decisions in &lt;i&gt;acme&lt;/i&gt;</title>"));
      assert.ok(!/<script|<img|<b>|<i>/i.test(html), "no tag from a document");
    } finally {
      box.done();
    }
  });

  it("[rl:decisions-page/offline] the page has no script, no link and loads nothing: its one style is allowed by its hash", () => {
    const box = repo({ ...ACME, "docs/legacy-api.md": "Deprecated: replaced by https://example.com/v2 and ![badge](https://img.shields.io/x.svg)\n\n# Legacy API\n" });
    try {
      const html = pageOf(box);
      assert.ok(html.includes("<code>https://example.com/v2</code>"), "a link a notice gives is text");
      assert.ok(!/<script|<link|<img|<iframe|<object|<embed|<video|<audio|<form|<base/i.test(html));
      assert.ok(!/\s(src|href|srcset|action|poster|data|style|on\w+)\s*=/i.test(html), "no attribute that loads, links or runs");
      assert.ok(!/url\(|@import/i.test(html));
      assert.ok(!/<[^>]*https?:/i.test(html), "no address inside a tag");
      const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html)?.[1];
      const style = /<style>([\s\S]*?)<\/style>/.exec(html)[1];
      assert.equal(csp, `default-src 'none'; style-src 'sha256-${createHash("sha256").update(style).digest("base64")}'; base-uri 'none'; form-action 'none'`);
      assert.equal(html.match(/<style>/g).length, 1);
    } finally {
      box.done();
    }
  });

  it("[rl:decisions-page/outside-repo] [rl:cli/no-packages] written outside the repository by default, readable by its owner only, and it says it holds quotes", () => {
    const box = repo();
    try {
      const before = listing(box.dir);
      const out = run(box);
      assert.equal(out.status, 0, out.stderr);
      const page = join(box.genter, "pages", "acme.html");
      assert.equal(out.stdout.trim(), "~/.genter/pages/acme.html holds quotes from acme: check before sharing");
      assert.match(out.stderr, /3 current · 2 replaced in acme at 3f2c1ab/);
      assert.equal(bodyOf(readFileSync(page, "utf8")).replace(/on \d{4}-\d{2}-\d{2}/, "on 2026-10-20"), SNAPSHOT);
      if (posix) assert.equal(statSync(page).mode & 0o777, 0o600);
      assert.deepEqual(listing(box.dir), before, "nothing written in the repository");
      // --out chooses the file, inside the repository too, since the person names it.
      const chosen = run(box, ["--out", "site/decisions.html"]);
      assert.equal(chosen.status, 0, chosen.stderr);
      assert.ok(existsSync(join(box.dir, "site/decisions.html")));
      assert.equal(chosen.stdout.trim(), "site/decisions.html holds quotes from acme: check before sharing");
      // A Genter home inside the repository would put the default there: refused, saying to choose with --out.
      const inside = spawnSync(process.execPath, [bin, "decisions"], { cwd: box.dir, env: { PATH: process.env.PATH, HOME: box.home, GENTER_HOME: join(box.dir, ".genter") }, encoding: "utf8" });
      assert.equal(inside.status, 1);
      assert.match(inside.stderr, /is inside acme: .* --out <file>/);
      assert.ok(!existsSync(join(box.dir, ".genter/pages")));
      // Its flag is its own, and it takes no words.
      for (const args of [["ask", "x", "--out", "a.html"], ["decisions", "docs"], ["decisions", "--out"]]) {
        const bad = spawnSync(process.execPath, [bin, ...args], { cwd: box.dir, env: { PATH: process.env.PATH, HOME: box.home, GENTER_HOME: box.genter }, encoding: "utf8" });
        assert.equal(bad.status, 1, args.join(" "));
      }
    } finally {
      box.done();
    }
  });

  it("[rl:decisions-page/stamped] a folder that is not a git repository says so, and no page is written", () => {
    const box = repo(Object.fromEntries(Object.entries(ACME).filter(([path]) => !path.startsWith(".git/"))));
    try {
      const out = run(box);
      assert.equal(out.status, 1);
      assert.match(out.stderr, /not a git repository/);
      assert.ok(!existsSync(join(box.genter, "pages")));
    } finally {
      box.done();
    }
  });

  it("[rl:decisions-page/stamped] the commit is read from .git with fs alone: a loose ref, packed-refs, a detached HEAD, a worktree, a branch with no commit", () => {
    const base = mkdtempSync(join(tmpdir(), "genter-git-"));
    const put = (path, text) => {
      mkdirSync(join(base, path, ".."), { recursive: true });
      writeFileSync(join(base, path), text);
    };
    const other = "a".repeat(40);
    try {
      put("loose/.git/HEAD", "ref: refs/heads/main\n");
      put("loose/.git/refs/heads/main", `${COMMIT}\n`);
      put("loose/.git/packed-refs", `# pack-refs with: peeled fully-peeled sorted\n${other} refs/heads/main\n`);
      put("loose/docs/adr/x.md", "x");
      assert.deepEqual(headOf(join(base, "loose/docs/adr"), base), { root: join(base, "loose"), commit: COMMIT, branch: "main" }, "the loose ref wins over packed-refs, from a folder inside");
      put("packed/.git/HEAD", "ref: refs/heads/feature/pages\n");
      put("packed/.git/packed-refs", `# pack-refs with: peeled fully-peeled sorted\n${other} refs/heads/main\n${COMMIT} refs/heads/feature/pages\n^${other}\n`);
      assert.deepEqual(headOf(join(base, "packed"), base), { root: join(base, "packed"), commit: COMMIT, branch: "feature/pages" });
      put("detached/.git/HEAD", `${COMMIT}\n`);
      assert.deepEqual(headOf(join(base, "detached"), base), { root: join(base, "detached"), commit: COMMIT });
      put("main/.git/worktrees/wt/HEAD", "ref: refs/heads/pages\n");
      put("main/.git/worktrees/wt/commondir", "../..\n");
      put("main/.git/refs/heads/pages", `${COMMIT}\n`);
      put("wt/.git", `gitdir: ${join(base, "main/.git/worktrees/wt")}\n`);
      assert.deepEqual(headOf(join(base, "wt"), base), { root: join(base, "wt"), commit: COMMIT, branch: "pages" });
      put("fresh/.git/HEAD", "ref: refs/heads/main\n");
      assert.deepEqual(headOf(join(base, "fresh"), base), { root: join(base, "fresh"), commit: null, branch: "main" });
      put("evil/.git/HEAD", "ref: refs/../../../etc/passwd\n");
      assert.throws(() => headOf(join(base, "evil"), base), /names neither a commit nor a branch/);
      put("plain/readme.md", "x");
      assert.equal(headOf(join(base, "plain"), base), null, "not a repository: the home folder (here, base) is never walked past");
      const page = decisionsPage({ project: "fresh", commit: null, date: "2026-10-20", rows: [] });
      assert.ok(page.includes("generated on 2026-10-20, before the first commit"));
      assert.ok(page.includes("0 current · 0 replaced, by their own text"));
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("[rl:readers/off-honoured] [rl:local-search/person-off-wins] [rl:local-search/repo-config-narrows] [rl:decisions-page/explicit-only] a file the person switched off, or the project leaves out, is never read for the page", () => {
    const box = repo({ ...ACME, "genter.json": JSON.stringify({ exclude: ["RUNBOOK.md"] }) });
    try {
      mkdirSync(box.genter, { recursive: true });
      writeFileSync(join(box.genter, "config.json"), JSON.stringify({ secret: "s", off: [join(box.dir, "docs/adr/0011-run-jobs-on-redis.md")] }));
      const rows = rowsOf(box);
      assert.deepEqual(rows.map((r) => r.path).sort(), ["docs/adr/0001-record-architecture-decisions.md", "docs/adr/0003-run-jobs-on-postgres.md"]);
      const old = rows.find((r) => r.path === "docs/adr/0003-run-jobs-on-postgres.md");
      assert.deepEqual(old.by, { name: "11. Run background jobs on Redis" }, "what replaces it is named, not read");
    } finally {
      box.done();
    }
  });
});
