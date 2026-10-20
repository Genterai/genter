import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CLONE_GAP_MS, CLONE_MIN_FILES, cloneWindow, driftFacts, noticeWords, supersededOf } from "../src/drift.js";

const NOW = Date.parse("2026-10-07T12:00:00Z");

describe("Anchor Drift: replaced marks", () => {
  it("[rl:anchor-drift/top-marks] [rl:anchor-drift/mark-link] finds a mark at the top of a document, with its link", () => {
    assert.deepEqual(supersededOf({ title: "Old guide", text: "> This page is deprecated. See https://docs.example.com/new for the current guide.\n\nSteps..." }), { marker: "deprecated", by: "https://docs.example.com/new" });
    assert.deepEqual(supersededOf({ title: "[DEPRECATED] Old API", text: "x" }), { marker: "deprecated" });
    assert.equal(supersededOf({ text: "Superseded by https://x.io/v2\nbody" }).by, "https://x.io/v2");
    assert.equal(supersededOf({ text: "Этот документ устарел, актуальный: https://wiki/new" }).marker, "устарел");
    assert.equal(supersededOf({ text: "Moved to https://new.example.com/page" }).marker, "moved to");
    assert.equal(supersededOf({ text: "This project is no longer maintained.\n" }).marker, "no longer maintained");
  });
  it("[rl:anchor-drift/top-marks] an archived flag counts", () => {
    assert.deepEqual(supersededOf({ name: "repo", archived: true }), { marker: "archived" });
  });
  it("[rl:anchor-drift/top-marks] does not fire on a word deep in a long document, in a function, or in a list", () => {
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
  it("[rl:anchor-drift/facts-on-deviation] an old source next to fresh ones in the same answer", () => {
    assert.deepEqual(driftFacts(old, [old, fresh], { now: NOW }), ["source last changed 2019-03; another source in this answer changed within the last 30 days"]);
  });
  it("[rl:anchor-drift/facts-on-deviation] says nothing when nothing deviates", () => {
    assert.deepEqual(driftFacts(fresh, [old, fresh], { now: NOW }), []); // fresh itself
    assert.deepEqual(driftFacts(old, [old], { now: NOW }), []); // old, but nothing around it is fresh
    assert.deepEqual(driftFacts(old, [old, { source_at: "2019-05-01T00:00:00Z" }], { now: NOW }), []); // everything is old
    assert.deepEqual(driftFacts({ updated_at: "2026-09-01T00:00:00Z" }, [fresh], { now: NOW }), []);
    assert.deepEqual(driftFacts(undefined, [], { now: NOW }), []);
  });
  it("[rl:anchor-drift/facts-on-deviation] [rl:anchor-drift/quote-not-verdict] a replaced mark is shown even when the date is fine, as what the place says, quoted", () => {
    assert.deepEqual(driftFacts({ ...fresh, superseded: { marker: "deprecated", by: "https://x.io/new", place: "https://x.io/old", quote: "This page is deprecated. See the new guide." } }, [], { now: NOW }), ['https://x.io/old says at its top: "This page is deprecated. See the new guide."']);
    assert.deepEqual(driftFacts({ superseded: { marker: "superseded", place: "docs/adr/0003.md", quote: "Superseded by 11. Run jobs on Redis", line: 9 } }, [], { now: NOW }), ['docs/adr/0003.md says at line 9: "Superseded by 11. Run jobs on Redis"']);
    assert.deepEqual(driftFacts({ superseded: { marker: "redirect", by: "https://x.io/b" } }, [], { now: NOW }), ["address now redirects to https://x.io/b"]);
  });
  it("[rl:anchor-drift/fresh-clone] an age is said only from a date the source gives: a file written in a fresh clone gives none", () => {
    // A file of a fresh clone has no source_at (local-search leaves it out): no age fact for it, and it counts as no
    // recent sibling for an old file beside it.
    assert.deepEqual(driftFacts({}, [old, {}], { now: NOW }), []);
    assert.deepEqual(driftFacts(old, [old, {}, {}], { now: NOW }), []);
    assert.equal(driftFacts(old, [old, fresh], { now: NOW }).length, 1);
  });
});

describe("Anchor Drift: plain words and clone times", () => {
  it("[rl:anchor-drift/quote-not-verdict] a notice is quoted in its own words, without Markdown's signs", () => {
    assert.equal(noticeWords("> **Deprecated:** replaced by [Release process v2](release-process-v2.md)"), "Deprecated: replaced by Release process v2");
    assert.equal(noticeWords("Superseded by [11. Run background jobs on Redis](0011-run-jobs-on-redis.md)"), "Superseded by 11. Run background jobs on Redis");
    assert.equal(noticeWords("- **Status:** Superseded by ADR-11"), "Status: Superseded by ADR-11");
    assert.equal(noticeWords("> [!WARNING] *Deprecated*: use `v2` instead"), "Deprecated: use v2 instead");
    assert.equal(noticeWords('superseded_by: "[[Release process v2]]"'), 'superseded_by: "Release process v2"');
    assert.equal(noticeWords("snake_case_name is deprecated"), "snake_case_name is deprecated", "a word's own signs stay");
    assert.equal(noticeWords('<div class="deprecated">'), '<div class="deprecated">', "a line that is all signs stays as it is");
    // A code span is quoted word for word, only its ticks gone; a type's angle brackets are no HTML tag.
    assert.equal(noticeWords("> **Deprecated:** use `Map<string, Job>` instead"), "Deprecated: use Map<string, Job> instead");
    assert.equal(noticeWords("Deprecated: replaced by `useQuery<T>()`"), "Deprecated: replaced by useQuery<T>()");
    assert.equal(noticeWords("> Superseded by `__init__.py`, see `a*b*c`"), "Superseded by __init__.py, see a*b*c");
    assert.equal(noticeWords("Deprecated: replaced by List<Item> now"), "Deprecated: replaced by List<Item> now");
    assert.equal(noticeWords('<p align="center"><b>Deprecated</b>: see v2</p>'), "Deprecated: see v2");
  });
  it("[rl:anchor-drift/fresh-clone] the files of a folder written at one moment: at least five, at least half of them, each within seconds of the one before", () => {
    const at = Date.parse("2026-10-20T10:00:00Z");
    const clone = Array.from({ length: 8 }, (_, i) => at + i * 40);
    assert.deepEqual(cloneWindow(clone), [at, at + 280]);
    // A file changed after the clone has a time of its own, outside the window.
    assert.deepEqual(cloneWindow([...clone, at + 86_400_000]), [at, at + 280]);
    // A slow clone is one run as long as no file waits more than the gap after the one before.
    assert.deepEqual(cloneWindow(Array.from({ length: 6 }, (_, i) => at + i * (CLONE_GAP_MS - 1))), [at, at + 5 * (CLONE_GAP_MS - 1)]);
    // Too few files, files written apart, or a run that is less than half of the folder: no clone.
    assert.equal(cloneWindow(clone.slice(0, CLONE_MIN_FILES - 1)), null);
    assert.equal(cloneWindow(Array.from({ length: 8 }, (_, i) => at + i * 60_000)), null);
    assert.equal(cloneWindow([...clone.slice(0, 5), ...Array.from({ length: 6 }, (_, i) => at + (i + 1) * 3_600_000)]), null);
    // A clone writes every file first: only the run from the oldest time is the clone, and a later run (a pull, a branch
    // switch, a formatter rewriting most of the folder) is edits, whose files keep their own times.
    const later = (n) => Array.from({ length: n }, (_, i) => at + 3_600_000 + i * 100);
    assert.equal(cloneWindow([...clone.slice(0, 4), ...later(6)]), null);
    assert.deepEqual(cloneWindow([...clone, ...later(3)]), [at, at + 280]);
    assert.equal(cloneWindow([]), null);
  });
});
