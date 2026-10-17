// Builds the replay streams from the frozen texts: one per test and seed, items in time order (hours since day 0).
// An item: { id, t, source, kind: "message" | "edit", section?, old?, text, gold?, noise? }.
// The corpus sections are the starting state (stream.initial), known before day 0.
import { C_ONSET_DAY, CALIBRATION_DAYS, CRITICAL, DAYS, NEW_TOPICS, NOISE, OPPOSITES, PATTERNS, RAMP_MAX, RAMP_START, SEEDS, WINDOW_HOURS } from "./scenario.mjs";
import { readData, rng, sections, shuffle } from "./lib.mjs";

const weekend = (d) => d % 7 === 5 || d % 7 === 6;

export function buildStream(test, seed) {
  const rand = rng(seed * 1000 + test.charCodeAt(0));
  const pool = readData("pool.json");
  const { harmless, cosmetic } = readData("doc-edits.json");
  const initial = sections();
  const critical = new Set(CRITICAL.filter((c) => c.file).map((c) => initial.find((s) => s.file === c.file && s.text.includes(c.find))?.id));
  const items = [];
  const at = (day, hour) => day * 24 + hour;
  const hourIn = (d) => (weekend(d) ? 10 + rand() * 8 : 8 + rand() * 11);

  // Routine messages: about 26 a weekday, 5 a weekend day, sampled without replacement.
  let bag = shuffle(pool, rand);
  const take = () => {
    if (!bag.length) bag = shuffle(pool, rand);
    return bag.pop();
  };
  for (let d = 0; d < DAYS; d++) {
    let n = weekend(d) ? 3 + Math.floor(rand() * 5) : 22 + Math.floor(rand() * 9);
    if (test === "E" && d >= 16 && d < 19) n *= 3;
    for (let i = 0; i < n; i++) {
      const p = take();
      items.push({ id: `${p.id}@${d}.${i}`, t: at(d, hourIn(d)), source: p.source, kind: "message", text: p.text, ...(test === "E" && d >= 16 && d < 19 && { noise: "E-burst" }) });
    }
  }

  // Harmless document edits: about two a weekday, each section at most once, never a section test F changes.
  const docEdits = shuffle(harmless.filter((e) => !critical.has(e.section)), rand);
  for (let d = 0; d < DAYS; d++) {
    if (weekend(d)) continue;
    for (let i = 0; i < 2 && docEdits.length; i++) {
      const e = docEdits.pop();
      items.push({ id: `edit:${e.section}@${d}`, t: at(d, hourIn(d)), source: "docs", kind: "edit", section: e.section, old: e.old, text: e.text });
    }
  }

  const gold = [];
  if (test === "A") {
    for (const o of OPPOSITES) {
      const ids = o.items.map(([source, text], i) => {
        const id = `${o.id}-${i}`;
        items.push({ id, t: at(o.day, o.hour + i * 0.5), source, kind: "message", text, gold: o.id });
        return id;
      });
      gold.push({ id: o.id, onset: at(o.day, o.hour), window: WINDOW_HOURS.A, items: ids });
    }
  }
  if (test === "B") {
    const fresh = readData("newtopics.json");
    for (const t of NEW_TOPICS) {
      const mine = fresh.filter((x) => x.event === t.id);
      const ids = mine.map((x, i) => {
        items.push({ id: x.id, t: at(t.day, 9) + (i / mine.length) * t.hours + rand() * 2, source: x.source, kind: "message", text: x.text, gold: t.id });
        return x.id;
      });
      gold.push({ id: t.id, onset: at(t.day, 9), window: WINDOW_HOURS.B, items: ids });
    }
  }
  if (test === "C") {
    const drift = shuffle(readData("drift.json"), rand);
    const ids = [];
    for (let d = RAMP_START; d < DAYS; d++) {
      let n = Math.round((RAMP_MAX * (d - RAMP_START)) / (DAYS - 1 - RAMP_START));
      if (weekend(d)) n = Math.floor(n / 3);
      for (let i = 0; i < n && drift.length; i++) {
        const x = drift.pop();
        const id = `${x.id}@${d}`;
        items.push({ id, t: at(d, hourIn(d)), source: x.source, kind: "message", text: x.text, gold: "C1" });
        ids.push(id);
      }
    }
    gold.push({ id: "C1", onset: at(C_ONSET_DAY, 8), window: WINDOW_HOURS.C, items: ids });
  }
  if (test === "D") {
    for (const p of PATTERNS) {
      const ids = p.items.map(([day, hour, source, text], i) => {
        const id = `${p.id}-${i}`;
        items.push({ id, t: at(day, hour), source, kind: "message", text, gold: p.id });
        return id;
      });
      gold.push({ id: p.id, onset: at(p.items[2][0], p.items[2][1]), window: WINDOW_HOURS.D, items: ids });
    }
  }
  if (test === "E") {
    const cos = shuffle(cosmetic.filter((e) => !critical.has(e.section)), rand).slice(0, 40);
    // A cosmetic re-save replaces whatever the section held, so a section edited earlier in the stream is skipped.
    const edited = new Set(items.filter((x) => x.kind === "edit").map((x) => x.section));
    for (const [i, e] of cos.filter((x) => !edited.has(x.section)).entries()) items.push({ id: `cosmetic:${e.section}`, t: at(22, 14) + i * 0.02, source: "docs", kind: "edit", section: e.section, old: e.old, text: e.text, noise: "E-reindex" });
    for (let i = 0; i < 60; i++) {
      const v = `2.${41 + Math.floor(i / 6)}.${i % 6}`;
      const svc = ["beacon-api", "probe-runner", "alert-router", "dashboard"][i % 4];
      items.push({ id: `bot-${i}`, t: at(28, 10) + i * 0.03, source: "slack", kind: "message", text: `:rocket: deploybot: ${svc} ${v} deployed to production (build #${8800 + i}), canary healthy`, noise: "E-bot" });
    }
    const ru = shuffle(readData("ru.json"), rand);
    for (let d = 34; d < 37; d++) for (let i = 0; i < 20 && ru.length; i++) {
      const x = ru.pop();
      items.push({ id: `${x.id}@${d}`, t: at(d, hourIn(d)), source: x.source, kind: "message", text: x.text, noise: "E-lang" });
    }
    for (const [i, x] of readData("backfill.json").entries()) items.push({ id: x.id, t: at(39, 11) + i * 0.005, source: "notion", kind: "message", text: x.text, noise: "E-backfill" });
  }
  if (test === "F") {
    const current = new Map(initial.map((s) => [s.id, s.text]));
    for (const c of CRITICAL) {
      if (c.message) {
        items.push({ id: c.id, t: at(c.day, c.hour), source: c.message[0], kind: "message", text: c.message[1], gold: c.id });
      } else {
        const s = initial.find((x) => x.file === c.file && x.text.includes(c.find));
        if (!s) throw new Error(`${c.id}: text not found in ${c.file}`);
        const old = current.get(s.id);
        const text = old.replace(c.find, c.replace);
        current.set(s.id, text);
        items.push({ id: c.id, t: at(c.day, c.hour), source: "docs", kind: "edit", section: s.id, old, text, gold: c.id });
      }
      gold.push({ id: c.id, onset: at(c.day, c.hour), window: WINDOW_HOURS.F, items: [c.id] });
    }
  }
  items.sort((a, b) => a.t - b.t);
  const noise = test === "E" ? NOISE.map((n) => ({ id: n.id, start: at(n.day, 0), end: at(n.day + (n.days ?? 1), 0) + 24 })) : [];
  return { test, seed, initial, items, gold, noise, scoredFrom: at(CALIBRATION_DAYS, 0) };
}

export const TESTS = ["A", "B", "C", "D", "E", "F"];
export const allStreams = () => TESTS.flatMap((t) => SEEDS.map((s) => buildStream(t, s)));
