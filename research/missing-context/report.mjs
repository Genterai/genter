// Tables from results/runs.jsonl: node research/missing-context/report.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ARMS } from "./agent.mjs";
import { TASKS, isRelevant } from "./tasks.mjs";
import { world } from "./world.mjs";

const HERE = new URL(".", import.meta.url).pathname;
const runs = readFileSync(join(HERE, "results", "runs.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const w = world();
const task = (id) => TASKS.find((t) => t.id === id);
const pct = (x) => (x == null || Number.isNaN(x) ? "—" : `${Math.round(x * 100)}%`);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const HIDDEN = ["changed-constraint", "entity-state", "static-policy", "new-situation"];
const KINDS = ["changed-direct", ...HIDDEN, "control"];

for (const r of runs) {
  const t = task(r.task);
  r.success = r.grade.points.every(Boolean) && !r.grade.trap;
  r.pointShare = r.grade.points.filter(Boolean).length / r.grade.points.length;
  r.exposed = r.seen.some((id) => isRelevant(t, w.byId.get(id)));
  r.injectedRelevant = r.injected.filter((id) => isRelevant(t, w.byId.get(id))).length;
  r.injectedChars = r.injected.reduce((s, id) => s + Math.min(700, w.byId.get(id).text.length), 0);
  r.usedGenter = r.calls.some((c) => c.name === "genter_search");
  r.goal = r.calls.filter((c) => c.name === "genter_search" && c.args.goal).length;
}
const arms = ARMS.filter((a) => runs.some((r) => r.arm === a));
const lines = [];
const out = (s = "") => lines.push(s);

out("| Arm | Success, hidden (n) | Success, changed-direct | Success, control | Points met, hidden | Stale-fact errors | Relevant item shown, hidden | Used when shown, hidden | Added items / run | Of them relevant | Added chars / run | Tool calls / run | $ / run |");
out("|--|--|--|--|--|--|--|--|--|--|--|--|--|");
for (const a of arms) {
  const rs = runs.filter((r) => r.arm === a);
  const hid = rs.filter((r) => HIDDEN.includes(r.kind));
  const trapRuns = rs.filter((r) => task(r.task).trap);
  const shown = hid.filter((r) => r.exposed);
  const inj = rs.reduce((s, r) => s + r.injected.length, 0);
  out(`| ${a} | ${pct(mean(hid.map((r) => +r.success)))} (${hid.length}) | ${pct(mean(rs.filter((r) => r.kind === "changed-direct").map((r) => +r.success)))} | ${pct(mean(rs.filter((r) => r.kind === "control").map((r) => +r.success)))} | ${pct(mean(hid.map((r) => r.pointShare)))} | ${pct(mean(trapRuns.map((r) => +r.grade.trap)))} | ${pct(mean(hid.map((r) => +r.exposed)))} | ${pct(mean(shown.map((r) => +r.success)))} | ${(inj / rs.length).toFixed(1)} | ${inj ? pct(rs.reduce((s, r) => s + r.injectedRelevant, 0) / inj) : "—"} | ${Math.round(mean(rs.map((r) => r.injectedChars)))} | ${mean(rs.map((r) => r.steps)).toFixed(1)} | ${mean(rs.map((r) => r.cost)).toFixed(4)} |`);
}

out("\nSuccess by kind of missing context:\n");
out(`| Arm | ${KINDS.join(" | ")} |`);
out(`|--|${KINDS.map(() => "--").join("|")}|`);
for (const a of arms) out(`| ${a} | ${KINDS.map((k) => pct(mean(runs.filter((r) => r.arm === a && r.kind === k).map((r) => +r.success)))).join(" | ")} |`);

out("\nWhere hidden-context tasks fail (share of failed runs):\n");
out("| Arm | Failed runs | Never shown the item | Shown, not used | Stale fact stated |");
out("|--|--|--|--|--|");
for (const a of arms) {
  const f = runs.filter((r) => r.arm === a && HIDDEN.includes(r.kind) && !r.success);
  out(`| ${a} | ${f.length} | ${pct(mean(f.map((r) => +!r.exposed)))} | ${pct(mean(f.map((r) => +(r.exposed && !r.grade.trap))))} | ${pct(mean(f.map((r) => +r.grade.trap)))} |`);
}

out("\nPer task, successes out of runs:\n");
out(`| Task | Kind | ${arms.join(" | ")} |`);
out(`|--|--|${arms.map(() => "--").join("|")}|`);
for (const t of TASKS) out(`| ${t.id} | ${t.kind} | ${arms.map((a) => { const rs = runs.filter((r) => r.arm === a && r.task === t.id); return `${rs.filter((r) => r.success).length}/${rs.length}`; }).join(" | ")} |`);

out("\nHarm: runs that failed where the same task succeeded in every run of `search`:\n");
const okSearch = new Set(TASKS.filter((t) => { const rs = runs.filter((r) => r.arm === "search" && r.task === t.id); return rs.length && rs.every((r) => r.success); }).map((t) => t.id));
for (const a of arms) out(`- ${a}: ${runs.filter((r) => r.arm === a && okSearch.has(r.task) && !r.success).length} of ${runs.filter((r) => r.arm === a && okSearch.has(r.task)).length}`);

out("\nUse of Genter by the agent:\n");
for (const a of arms.filter((x) => !["base", "diligent"].includes(x))) {
  const rs = runs.filter((r) => r.arm === a);
  const gc = rs.flatMap((r) => r.calls.filter((c) => c.name === "genter_search"));
  out(`- ${a}: genter_search in ${pct(mean(rs.map((r) => +r.usedGenter)))} of runs; ${gc.length} calls, ${pct(gc.filter((c) => c.args.goal).length / (gc.length || 1))} with a goal`);
}
// Paired by task: the arm's success rate on a task minus that of `search` (each the mean over its runs), averaged over
// the hidden-context tasks, with a 95% bootstrap interval over tasks.
out("\nAgainst `search`, paired by task (hidden-context tasks): difference in success, 95% bootstrap interval over tasks\n");
const hiddenTasks = TASKS.filter((t) => HIDDEN.includes(t.kind)).map((t) => t.id);
const rate = (a, id) => mean(runs.filter((r) => r.arm === a && r.task === id).map((r) => +r.success));
let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
for (const a of arms.filter((x) => x !== "search")) {
  const d = hiddenTasks.map((id) => [rate(a, id), rate("search", id)]).filter(([x, y]) => x != null && y != null).map(([x, y]) => x - y);
  if (!d.length) continue;
  const boots = Array.from({ length: 4000 }, () => mean(Array.from({ length: d.length }, () => d[Math.floor(rand() * d.length)]))).sort((x, y) => x - y);
  out(`- ${a}: ${mean(d) >= 0 ? "+" : ""}${Math.round(mean(d) * 100)} points [${Math.round(boots[100] * 100)}, ${Math.round(boots[3899] * 100)}] over ${d.length} tasks`);
}
const text = lines.join("\n");
writeFileSync(join(HERE, "results", "report.md"), `${text}\n`);
console.log(text);
