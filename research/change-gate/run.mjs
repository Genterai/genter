// Replays every stream through every detector and scores the alarms against the gold events of scenario.mjs.
// node research/change-gate/run.mjs [--dims 256] [--sweep]
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { allStreams } from "./build.mjs";
import { PARAMS, replay } from "./detect.mjs";
import { HERE, embedAll, shrink, usage } from "./lib.mjs";

const arg = (k) => process.argv.includes(k) && process.argv[process.argv.indexOf(k) + 1];
const DIMS = Number(arg("--dims")) || 1536;

export function score(stream, alarms) {
  const scored = alarms.filter((a) => a.t >= stream.scoredFrom);
  const events = stream.gold.map((g) => {
    const items = new Set(g.items);
    const inWindow = scored.filter((a) => a.t >= g.onset && a.t <= g.onset + g.window);
    const strict = inWindow.filter((a) => a.evidence.some((e) => items.has(e)));
    return { id: g.id, lenient: inWindow.length > 0, strict: strict.length > 0, delay: strict.length ? strict[0].t - g.onset : null, delayLenient: inWindow.length ? inWindow[0].t - g.onset : null };
  });
  const isTrue = (a) => stream.gold.some((g) => a.t >= g.onset && a.t <= g.onset + g.window && a.evidence.some((e) => g.items.includes(e)));
  const tp = scored.filter(isTrue).length;
  const noise = Object.fromEntries(stream.noise.map((n) => [n.id, scored.filter((a) => a.t >= n.start && a.t < n.end).length]));
  return { events, alarms: scored.length, tp, fp: scored.length - tp, noise };
}

async function main() {
  const streams = allStreams();
  const texts = new Set();
  for (const s of streams) {
    for (const x of s.initial) texts.add(x.text);
    for (const x of s.items) {
      texts.add(x.text);
      if (x.old) texts.add(x.old);
    }
  }
  const list = [...texts];
  const vecs = await embedAll(list);
  const vectors = new Map(list.map((t, i) => [t, shrink(vecs[i], DIMS)]));
  console.error(`texts ${list.length}, embedding usage`, usage);

  const sweep = process.argv.includes("--sweep");
  const settings = sweep
    ? [
        { name: "default", P: PARAMS },
        { name: "strict-alpha", P: { ...PARAMS, alphaItem: 0.0005, alphaWindow: 0.01, martingaleFire: 1000 } },
        { name: "loose-alpha", P: { ...PARAMS, alphaItem: 0.01, alphaWindow: 0.05, martingaleFire: 20 } },
        { name: "k10", P: { ...PARAMS, k: 10 } },
        { name: "k1", P: { ...PARAMS, k: 1 } },
        { name: "window12h", P: { ...PARAMS, windowHours: 12 } },
        { name: "window72h", P: { ...PARAMS, windowHours: 72 } },
        { name: "cluster2", P: { ...PARAMS, clusterMin: 2 } },
        { name: "cluster5", P: { ...PARAMS, clusterMin: 5 } },
      ]
    : [{ name: "default", P: PARAMS }];

  const out = [];
  for (const { name, P } of settings) {
    for (const s of streams) {
      const r = replay(s, vectors, P);
      for (const [det, alarms] of Object.entries(r.alarms)) {
        out.push({ setting: name, test: s.test, seed: s.seed, detector: det, items: r.items.length, ms: r.ms[det], featureMs: r.featureMs, ...score(s, alarms), alarmList: sweep ? undefined : alarms.filter((a) => a.t >= s.scoredFrom) });
      }
    }
  }
  mkdirSync(join(HERE, "results"), { recursive: true });
  const file = join(HERE, "results", `raw-${sweep ? "sweep" : DIMS}.json`);
  writeFileSync(file, JSON.stringify(out));
  console.error("wrote", file);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
