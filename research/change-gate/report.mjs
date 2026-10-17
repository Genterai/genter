// Tables from results/raw-*.json: node research/change-gate/report.mjs [raw-1536.json]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CALIBRATION_DAYS, DAYS } from "./scenario.mjs";
import { HERE } from "./lib.mjs";

const WEEKS = (DAYS - CALIBRATION_DAYS) / 7;
const median = (xs) => {
  const s = xs.filter((x) => x != null).sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : null;
};
const pct = (x) => (x == null ? "—" : `${Math.round(x * 100)}%`);

export function summarize(rows) {
  const by = new Map();
  for (const r of rows) {
    const k = `${r.detector}|${r.test}`;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(r);
  }
  const res = {};
  for (const [k, rs] of by) {
    const [det, test] = k.split("|");
    const ev = rs.flatMap((r) => r.events);
    const alarms = rs.reduce((s, r) => s + r.alarms, 0);
    const tp = rs.reduce((s, r) => s + r.tp, 0);
    const noise = {};
    for (const r of rs) for (const [n, c] of Object.entries(r.noise)) noise[n] = (noise[n] ?? 0) + c / rs.length;
    (res[det] ??= {})[test] = {
      recall: ev.length ? ev.filter((e) => e.strict).length / ev.length : null,
      recallLenient: ev.length ? ev.filter((e) => e.lenient).length / ev.length : null,
      precision: alarms ? tp / alarms : null,
      alarmsPerWeek: alarms / rs.length / WEEKS,
      fpPerWeek: (alarms - tp) / rs.length / WEEKS,
      delay: median(ev.map((e) => e.delay)),
      perEvent: Object.fromEntries([...new Set(ev.map((e) => e.id))].map((id) => [id, ev.filter((e) => e.id === id && e.strict).length + "/" + ev.filter((e) => e.id === id).length])),
      msPerItem: rs.reduce((s, r) => s + r.ms + (/^(every|daily|lexical|entity)/.test(det) ? 0 : r.featureMs), 0) / rs.reduce((s, r) => s + r.items, 0),
      noise,
    };
  }
  return res;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2] || "raw-1536.json";
  const rows = JSON.parse(readFileSync(join(HERE, "results", file), "utf8"));
  const settings = [...new Set(rows.map((r) => r.setting))];
  for (const setting of settings) {
    const res = summarize(rows.filter((r) => r.setting === setting));
    console.log(`\n### ${file} / ${setting}\n`);
    console.log("| detector | A recall | B | C | D | F | precision (A-D,F) | FP/week (A-D,F) | E alarms/week | median delay h | ms/item |");
    console.log("|--|--|--|--|--|--|--|--|--|--|--|");
    for (const [det, t] of Object.entries(res)) {
      const sig = ["A", "B", "C", "D", "F"];
      const al = sig.reduce((s, x) => s + t[x].alarmsPerWeek, 0);
      const fp = sig.reduce((s, x) => s + t[x].fpPerWeek, 0);
      const prec = al ? (al - fp) / al : null;
      const delays = sig.map((x) => t[x].delay).filter((x) => x != null);
      console.log(`| ${det} | ${sig.map((x) => `${pct(t[x].recall)}${t[x].recallLenient !== t[x].recall ? ` (${pct(t[x].recallLenient)})` : ""}`).join(" | ")} | ${pct(prec)} | ${(fp / 5).toFixed(1)} | ${t.E.alarmsPerWeek.toFixed(1)} | ${median(delays) ?? "—"} | ${t.A.msPerItem.toFixed(2)} |`);
    }
    if (setting === "default") {
      console.log("\nPer event (strict detections / seeds):\n");
      for (const [det, t] of Object.entries(res)) console.log(det, JSON.stringify(Object.assign({}, ...["A", "B", "C", "D", "F"].map((x) => t[x].perEvent))));
      console.log("\nTest E, alarms per noise kind (mean per stream):\n");
      for (const [det, t] of Object.entries(res)) console.log(det, JSON.stringify(Object.fromEntries(Object.entries(t.E.noise).map(([k, v]) => [k, +v.toFixed(1)]))));
    }
  }
}
