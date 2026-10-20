import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyFailure, contentHash, recipeId, splitMarkdown } from "../src/anchor.js";

describe("an Anchor's id and digest", () => {
  it("[rl:local-search/ids-stable] are made as in genter-cli 0.3, so an upgrade reads a person's store as it was", () => {
    // Values made by 0.3.0's src/recipe.js: a place keeps its id and digest across versions.
    assert.equal(recipeId({ workspaceId: "me", tool: "FILE_READ", args: { path: "/home/anna/acme/docs/deploy.md" } }), "rcp_0bb333e1a6b3abd4af99d8aa");
    assert.equal(recipeId({ workspaceId: "default", tool: "WEBSITE_READ_PAGE", args: { url: "https://docs.example.com/guide/" } }), "rcp_d4bb9eb54b2ade10c32b2367");
    assert.equal(contentHash("# Deploy\n\nProduction ships on Thursday.\n"), "6ff52274e967756c680fd3179355d213b963f6d5b73d2b4721e9eb212518b7f5");
    assert.equal(contentHash({ url: "https://docs.example.com/guide/", title: "Guide", text: "Install it." }), "dca8bcb47fe1fb652db2bd23032cf8a47dc4395816ddcc7755add6f3805a3b8b");
  });

  it("an id is deterministic: arg order, empty args, outer spaces and sets do not count", () => {
    const base = { workspaceId: "w", scope: "", tool: "FILE_READ", args: { path: "/a/b.md", ids: [2, 1] } };
    const id = recipeId(base);
    assert.match(id, /^rcp_[0-9a-f]{24}$/);
    assert.equal(recipeId({ ...base, args: { ids: [1, 2, 2], path: " /a/b.md ", page: "", gone: null } }), id);
    for (const change of [{ workspaceId: "w2" }, { scope: "s" }, { tool: "WEBSITE_READ_PAGE" }, { args: { path: "/a/c.md" } }]) assert.notEqual(recipeId({ ...base, ...change }), id);
  });

  it("a digest ignores key order, CRLF, outer whitespace and bookkeeping; a real edit changes it", () => {
    assert.equal(contentHash("line1\r\nline2 "), contentHash("line1\nline2"));
    assert.equal(contentHash({ b: "x", a: [1, 2], etag: "W/1" }), contentHash({ a: [1, 2], b: "x", etag: "W/2" }));
    assert.notEqual(contentHash({ items: [1, 2] }), contentHash({ items: [2, 1] }));
    assert.notEqual(contentHash("Production ships on Thursday."), contentHash("Production ships on Friday."));
    assert.equal(contentHash(undefined), contentHash(null));
  });
});

describe("a failed read", () => {
  it("gone when what it points to is missing, null when the failure is transient", () => {
    for (const e of ["ENOENT: no such file or directory", "Not Found (404)", "HTTP 410 Gone", "https://x.io/a: not found (404)"]) assert.equal(classifyFailure(e), "gone", e);
    for (const e of ["403 Forbidden", "EACCES: permission denied"]) assert.equal(classifyFailure(e), "denied", e);
    for (const e of ["request timed out", "429 rate limit exceeded", "Internal Server Error 500", "", null, undefined]) assert.equal(classifyFailure(e), null, String(e));
  });
});

describe("Markdown sections", () => {
  const DOC = "Intro line.\n\n# Deploy\n\n## Staging\n\nStaging deploys on Tuesday.\n\n```bash\n# not a heading\nmake deploy\n```\n\n## Production\n\n### Window\n\nThursday after review.\n";
  const sections = splitMarkdown("docs/deploy.md", DOC);

  it("are cut by headings, deterministically, with the heading path and offsets into the file", () => {
    assert.deepEqual(
      sections.map((s) => [s.id, s.headings]),
      [
        ["docs/deploy.md#intro", ["Introduction"]],
        ["docs/deploy.md#deploy/staging", ["Deploy", "Staging"]],
        ["docs/deploy.md#deploy/production/window", ["Deploy", "Production", "Window"]],
      ],
    );
    assert.deepEqual(splitMarkdown("docs/deploy.md", DOC), sections);
    assert.match(DOC.slice(sections[2].start, sections[2].end), /^### Window\n\nThursday after review\.\n$/);
  });

  it("a # inside a code fence is no heading; a heading with no text of its own gives no section", () => {
    assert.match(DOC.slice(sections[1].start, sections[1].end), /make deploy/);
    assert.ok(!sections.some((s) => s.title === "not a heading" || s.title === "Production"));
  });

  it("repeated headings get unique ids, and a long section is cut into parts at blank lines", () => {
    assert.deepEqual(splitMarkdown("a.md", "## A\none\n## A\ntwo\n").map((s) => s.id), ["a.md#a", "a.md#a~2"]);
    const long = splitMarkdown("a.md", `# Big\n\n${`${"word ".repeat(200)}\n\n`.repeat(20)}`);
    assert.ok(long.length > 1 && long.every((s) => s.end - s.start <= 6200));
    assert.ok(long[0].id.endsWith(".p1") && long[0].title === "Big (part 1)");
  });
});
