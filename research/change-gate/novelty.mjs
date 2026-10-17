// How unusual the gold items are to per-item novelty: their conformal p-values against everything known before them,
// next to the most unusual routine items. node research/change-gate/novelty.mjs
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { allStreams } from "./build.mjs";
import { PARAMS, replay } from "./detect.mjs";
import { HERE, embedAll, shrink } from "./lib.mjs";

const out = {};
for (const s of allStreams()) {
  const texts = [...new Set([...s.initial.map((x) => x.text), ...s.items.flatMap((x) => [x.text, x.old].filter(Boolean))])];
  const v = await embedAll(texts);
  const vectors = new Map(texts.map((t, i) => [t, shrink(v[i], 256)]));
  const r = replay(s, vectors, PARAMS);
  const scored = r.items.filter((x) => x.t >= s.scoredFrom);
  const o = (out[s.test] ??= { gold: [], routine: [] });
  for (const x of scored) (x.gold ? o.gold : x.noise ? (o[x.noise] ??= []) : o.routine).push(x.p);
}
const q = (xs, f) => {
  const s = [...xs].sort((a, b) => a - b);
  return +s[Math.floor(f * (s.length - 1))].toFixed(3);
};
const table = {};
for (const [t, o] of Object.entries(out)) for (const [k, xs] of Object.entries(o)) if (xs.length) table[`${t} ${k}`] = { n: xs.length, min: q(xs, 0), p10: q(xs, 0.1), median: q(xs, 0.5), "share p<=0.05": +(xs.filter((p) => p <= 0.05).length / xs.length).toFixed(3) };
writeFileSync(join(HERE, "results", "novelty.json"), `${JSON.stringify(table, null, 1)}\n`);
console.table(table);
