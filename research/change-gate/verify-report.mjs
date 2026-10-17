// Tables from results/verified-<variant>.json: node research/change-gate/verify-report.mjs
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CALIBRATION_DAYS, DAYS } from "./scenario.mjs";
import { HERE } from "./lib.mjs";
import { ROUTES } from "./subscribers.mjs";
import { buildStream } from "./build.mjs";

const WEEKS = (DAYS - CALIBRATION_DAYS) / 7;
const pct = (x) => (x == null ? "—" : `${Math.round(x * 100)}%`);
const SIG = ["A", "B", "C", "D", "F"];
const perSignal = [];

console.log("| verifier | fed by | stage | A | B | C | D | F | precision | false alarms / week (A-D,F) | E: alarms / week | LLM calls / week | $ / week | signals with advice |");
console.log("|--|--|--|--|--|--|--|--|--|--|--|--|--|--|");
for (const variant of ["neutral", "rubric", "subscribed"]) {
  const file = join(HERE, "results", `verified-${variant}.json`);
  if (!existsSync(file)) continue;
  const rows = JSON.parse(readFileSync(file, "utf8"));
  for (const arm of ["gate", "batch-6h", "digest-24h"]) {
    const rs = rows.filter((r) => r.arm === arm);
    if (!rs.length) continue;
    const streams = rs.length / 6;
    for (const stage of ["before", "after"]) {
      if (stage === "before" && variant !== "neutral") continue;
      const recall = (t) => {
        const ev = rs.filter((r) => r.test === t).flatMap((r) => r[stage].events);
        return ev.length ? ev.filter((e) => e.strict).length / ev.length : null;
      };
      const sig = rs.filter((r) => SIG.includes(r.test));
      const alarms = sig.reduce((s, r) => s + r[stage].alarms, 0);
      const tp = sig.reduce((s, r) => s + r[stage].tp, 0);
      const e = rs.filter((r) => r.test === "E").reduce((s, r) => s + r[stage].alarms, 0) / streams / WEEKS;
      const calls = rs.reduce((s, r) => s + r.calls, 0) / rs.length / WEEKS;
      const cost = rs.reduce((s, r) => s + r.cost, 0) / rs.length / WEEKS;
      const advice = rs.reduce((s, r) => s + r.advice, 0);
      const nsig = rs.reduce((s, r) => s + r.signals.length, 0);
      console.log(`| ${stage === "before" ? "—" : variant} | ${arm} | ${stage === "before" ? "candidates" : "signals"} | ${SIG.map((t) => pct(recall(t))).join(" | ")} | ${pct(alarms ? tp / alarms : null)} | ${((alarms - tp) / streams / 5 / WEEKS).toFixed(1)} | ${e.toFixed(1)} | ${stage === "before" ? "0" : calls.toFixed(1)} | ${stage === "before" ? "0" : cost.toFixed(3)} | ${stage === "before" ? "—" : `${advice}/${nsig}`} |`);
    }
  }
  // Per signal, as a consumer sees them: how many arrive, and how many are about a gold event (its items, in its window).
  for (const arm of ["gate", "batch-6h", "digest-24h"]) {
    const rs = rows.filter((r) => r.arm === arm);
    if (!rs.length) continue;
    let gold = 0;
    let all = 0;
    let eAll = 0;
    let hi = 0;
    let hiGold = 0;
    for (const r of rs) {
      const stream = buildStream(r.test, r.seed);
      for (const s of r.signals) {
        const g = stream.gold.some((e) => s.t >= e.onset && s.t <= e.onset + e.window && s.evidence.some((id) => e.items.includes(id)));
        if (r.test === "E") eAll++;
        else {
          all++;
          if (g) gold++;
          if ((s.confidence ?? 0) >= 0.9) {
            hi++;
            if (g) hiGold++;
          }
        }
      }
    }
    const streams = rs.length / 6;
    perSignal.push(`| ${variant} | ${arm} | ${(all / (streams * 5) / WEEKS).toFixed(1)} | ${pct(all ? gold / all : null)} | ${pct(hi ? hiGold / hi : null)} | ${(eAll / streams / WEEKS).toFixed(1)} |`);
  }
  if (variant === "subscribed") {
    console.log("\nRouting of detected gold events (subscribed): delivered to the right subscriber / detected\n");
    for (const arm of ["gate", "batch-6h", "digest-24h"]) {
      const rs = rows.filter((r) => r.arm === arm && SIG.includes(r.test));
      let right = 0;
      let detected = 0;
      let wrongTargets = 0;
      for (const r of rs) for (const ev of r.after.events.filter((x) => x.strict)) {
        detected++;
        const sigs = r.signals.filter((s) => s.evidence.some((id) => id === ev.id || id.startsWith(`${ev.id}-`) || (ev.id === "C1" && id.startsWith("late-false-alerts"))));
        const targets = new Set(sigs.flatMap((s) => s.for));
        if (ROUTES[ev.id].some((x) => targets.has(x))) right++;
        wrongTargets += [...targets].filter((x) => !ROUTES[ev.id].includes(x)).length;
      }
      console.log(`${arm}: ${right}/${detected} reached the right subscriber; ${wrongTargets} deliveries of those events to other subscribers`);
    }
  }
}
console.log("\n| verifier | fed by | signals / week (A-D,F) | about a gold event | among confidence >= 0.9 | E: signals / week |");
console.log("|--|--|--|--|--|--|");
for (const l of perSignal) console.log(l);
