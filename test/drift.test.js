import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { areaStats, driftFacts, sourceDates, supersededOf } from "../src/drift.js";

const NOW = Date.parse("2026-10-07T12:00:00Z");

describe("Anchor Drift: source dates", () => {
  it("reads modified and created dates by field name, whatever the connector", () => {
    assert.deepEqual(sourceDates({ modifiedTime: "2019-03-02T10:00:00Z", createdTime: "2018-01-01T00:00:00Z" }, { now: NOW }), { source_at: "2019-03-02T10:00:00.000Z", source_created_at: "2018-01-01T00:00:00.000Z" });
    for (const key of ["modified_time", "updated_at", "updatedAt", "last_edited_time", "lastModified", "last_modified"]) {
      assert.equal(sourceDates({ [key]: "2020-05-05T00:00:00Z" }, { now: NOW }).source_at, "2020-05-05T00:00:00.000Z", key);
    }
  });
  it("a commit's committer date counts; a list takes its freshest item", () => {
    assert.equal(sourceDates([{ commit: { committer: { date: "2021-01-01T00:00:00Z" } } }, { commit: { committer: { date: "2024-06-01T00:00:00Z" } } }], { now: NOW }).source_at, "2024-06-01T00:00:00.000Z");
  });
  it("a site's Last-Modified header is a date; nothing found, nothing returned; bad and future dates are ignored", () => {
    assert.equal(sourceDates({ text: "x" }, { lastModified: "Tue, 05 Mar 2019 10:00:00 GMT", now: NOW }).source_at, "2019-03-05T10:00:00.000Z");
    assert.deepEqual(sourceDates({ title: "x", date_label: "soon" }, { now: NOW }), {});
    assert.deepEqual(sourceDates({ updated_at: "2031-01-01T00:00:00Z", modified: "not a date" }, { now: NOW }), {});
  });
});

describe("Anchor Drift: replaced marks", () => {
  it("finds a mark at the top of a document, with its link", () => {
    assert.deepEqual(supersededOf({ title: "Old guide", text: "> This page is deprecated. See https://docs.example.com/new for the current guide.\n\nSteps..." }), { marker: "deprecated", by: "https://docs.example.com/new" });
    assert.deepEqual(supersededOf({ title: "[DEPRECATED] Old API", text: "x" }), { marker: "deprecated" });
    assert.equal(supersededOf({ text: "Superseded by https://x.io/v2\nbody" }).by, "https://x.io/v2");
    assert.equal(supersededOf({ text: "Этот документ устарел, актуальный: https://wiki/new" }).marker, "устарел");
    assert.equal(supersededOf({ text: "Moved to https://new.example.com/page" }).marker, "moved to");
    assert.equal(supersededOf({ text: "This project is no longer maintained.\n" }).marker, "no longer maintained");
  });
  it("an archived flag counts", () => {
    assert.deepEqual(supersededOf({ name: "repo", archived: true }), { marker: "archived" });
  });
  it("does not fire on a word deep in a long document, in a function, or in a list", () => {
    const body = `# Guide\n\nIntro line.\n\nSecond paragraph.\n\nThird.\n\nFourth.\n\n${"filler text. ".repeat(40)}\n\nThe old helper is deprecated and replaced by newHelper().`;
    assert.equal(supersededOf({ title: "Guide", text: body }), null);
    assert.equal(supersededOf({ title: "API", text: "## deprecate_user()\nRemoves a user." }), null);
    assert.equal(supersededOf({ title: "Notes on deprecated API handling", text: "How we handle them." }), null);
    assert.equal(supersededOf({ text: "Call `deprecated(x)` to mark it." }), null);
    assert.equal(supersededOf({ text: "Moved to Trash is a folder label" }), null);
    assert.equal(supersededOf([{ text: "This is deprecated." }, { text: "fine" }]), null);
    assert.equal(supersededOf({ text: `${"This long paragraph talks about many things and says it is deprecated somewhere. ".repeat(6)}` }), null);
  });
});

describe("Anchor Drift: facts only on deviation", () => {
  const old = { source_at: "2019-03-10T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" };
  const fresh = { source_at: "2026-09-20T00:00:00Z", updated_at: "2026-09-20T00:00:00Z" };
  it("an old source next to fresh ones in the same answer", () => {
    assert.deepEqual(driftFacts(old, [old, fresh], { now: NOW }), ["source last changed 2019-03; another source in this answer changed within the last 30 days"]);
  });
  it("says nothing when nothing deviates", () => {
    assert.deepEqual(driftFacts(fresh, [old, fresh], { now: NOW }), []); // fresh itself
    assert.deepEqual(driftFacts(old, [old], { now: NOW }), []); // old, but nothing around it is fresh
    assert.deepEqual(driftFacts(old, [old, { source_at: "2019-05-01T00:00:00Z" }], { now: NOW }), []); // everything is old
    assert.deepEqual(driftFacts({ updated_at: "2026-09-01T00:00:00Z" }, [fresh], { now: NOW }), []);
    assert.deepEqual(driftFacts(undefined, [], { now: NOW }), []);
  });
  it("area statistics: most of the area changed lately", () => {
    const area = { ...old, area_stats: { items: 16, recent: 14, days: 90 } };
    assert.deepEqual(driftFacts(area, [area], { now: NOW }), ["source last changed 2019-03; 14 of 16 items in this area changed in the last 90 days"]);
    assert.deepEqual(driftFacts({ ...old, area_stats: { items: 16, recent: 2, days: 90 } }, [], { now: NOW }), []);
    assert.deepEqual(driftFacts({ ...old, area_stats: { items: 3, recent: 3, days: 90 } }, [], { now: NOW }), []); // too small an area
  });
  it("a replaced mark is shown even when the date is fine", () => {
    assert.deepEqual(driftFacts({ ...fresh, superseded: { marker: "deprecated", by: "https://x.io/new" } }, [], { now: NOW }), ["marked as replaced: https://x.io/new"]);
    assert.deepEqual(driftFacts({ superseded: { marker: "redirect", by: "https://x.io/b" } }, [], { now: NOW }), ["address now redirects to https://x.io/b"]);
  });
  it("area stats from listed versions", () => {
    const s = areaStats(["2026-09-30T00:00:00Z", "2026-08-01T00:00:00Z", "2019-01-01T00:00:00Z", "", "abc"], { now: NOW });
    assert.equal(s.items, 3);
    assert.equal(s.recent, 2);
    assert.equal(s.median, "2026-08-01T00:00:00.000Z");
    assert.equal(areaStats(["", "v1"], { now: NOW }), null);
  });
});
