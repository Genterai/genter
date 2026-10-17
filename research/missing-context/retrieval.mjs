// Where the missing context ranks, without an agent: relevance to the task against relevance to nothing in particular.
// node research/missing-context/retrieval.mjs
// For each task, the rank of its first relevant item among everything in the world when ranked by:
//   task     closeness to the full task text (what a declared goal gives Genter at best)
//   entity   items naming the task's customer, closest first (empty when the task names none)
//   recency  newest first (a global "what's new" feed)
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { accountsOf } from "../change-gate/detect.mjs";
import { ranked } from "./agent.mjs";
import { TASKS, isRelevant } from "./tasks.mjs";
import { world } from "./world.mjs";

const HERE = new URL(".", import.meta.url).pathname;
const w = world();
const all = [...w.docs, ...w.messages];
const firstRank = (list, t) => {
  const i = list.findIndex((x) => isRelevant(t, x));
  return i < 0 ? null : i + 1;
};
const rows = [];
for (const t of TASKS) {
  const byTask = await ranked(t.task);
  const names = accountsOf(t.task);
  const byEntity = names.length ? byTask.filter((x) => names.some((a) => accountsOf(x.text).includes(a))) : [];
  const byRecency = [...all].sort((a, b) => b.t - a.t);
  const top4 = byTask.slice(0, 4);
  rows.push({ id: t.id, kind: t.kind, task: firstRank(byTask, t), entity: names.length ? firstRank(byEntity, t) : null, recency: firstRank(byRecency, t), relevantInTop4: top4.filter((x) => isRelevant(t, x)).length });
}
const kinds = [...new Set(TASKS.map((t) => t.kind))];
const at = (xs, k) => xs.filter((r) => r != null && r <= k).length / xs.length;
const table = kinds.map((k) => {
  const rs = rows.filter((r) => r.kind === k);
  return { kind: k, n: rs.length, "task@4": at(rs.map((r) => r.task), 4), "task@10": at(rs.map((r) => r.task), 10), "entity@4": rs.some((r) => r.entity != null) ? at(rs.map((r) => r.entity), 4) : null, "recency@4": at(rs.map((r) => r.recency), 4), "recency@50": at(rs.map((r) => r.recency), 50), "precision of top 4 by task": rs.reduce((s, r) => s + r.relevantInTop4, 0) / (4 * rs.length) };
});
writeFileSync(join(HERE, "results", "retrieval.json"), `${JSON.stringify({ rows, table }, null, 1)}\n`);
console.table(rows);
console.table(table);
