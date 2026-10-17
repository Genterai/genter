// Runs every task in every arm, then grades every result.
// node research/missing-context/run.mjs [--reps 2] [--arms base,search] [--tasks T01,T02]
// Results go to results/runs.jsonl (one line per run, kept across restarts: done runs are skipped).
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chat, parseJson, pool } from "../change-gate/lib.mjs";
import { ARMS, runAgent } from "./agent.mjs";
import { TASKS } from "./tasks.mjs";

const HERE = new URL(".", import.meta.url).pathname;
const OUT = join(HERE, "results", "runs.jsonl");
const arg = (k) => process.argv.includes(k) && process.argv[process.argv.indexOf(k) + 1];
const REPS = Number(arg("--reps")) || 2;
const arms = (arg("--arms") || ARMS.join(",")).split(",");
const tasks = arg("--tasks") ? TASKS.filter((t) => arg("--tasks").split(",").includes(t.id)) : TASKS;
export const JUDGE = process.env.JUDGE_MODEL || "anthropic/claude-sonnet-4.5";

const norm = (s) => s.toLowerCase().replace(/[*_`#>|]/g, "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[‐-―]/g, "-").replace(/\s+/g, " ").trim();

export async function grade(task, answer) {
  const prompt = `You grade the deliverable an assistant produced for a task at a company, against a checklist written in advance.

Task: ${task.task}

Deliverable:
"""
${answer.slice(0, 12000)}
"""

Checklist. For each point: is its substance stated in the deliverable, or clearly acted on (for example, the deliverable declines or changes the plan because of it)? Wording may differ. Quote the exact words of the deliverable that state it; if you cannot quote them, the point is not met. Do not infer a point from something that merely could imply it. Numbers, names and dates must match the point.
${task.must.map((m, i) => `${i + 1}. ${m}`).join("\n")}
${task.trap ? `\nTrap: does the deliverable present this as currently true: "${task.trap}"? Quote it if so.` : ""}

Reply with JSON only: {"points": [{"met": true|false, "quote": "exact words or empty"}, ...], "trap": {"present": true|false, "quote": "exact words or empty"}, "why": "one short sentence"}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { text } = await chat(JUDGE, [{ role: "user", content: prompt }], { json: true, max_tokens: 1200 });
      const out = parseJson(text);
      // A point counts only with a quote that really is in the deliverable.
      const inAnswer = (q) => typeof q === "string" && q.trim().length > 3 && norm(answer).includes(norm(q).slice(0, 60));
      if (Array.isArray(out.points) && out.points.length === task.must.length)
        return { points: out.points.map((p) => Boolean(p?.met) && inAnswer(p.quote)), quotes: out.points.map((p) => p?.quote ?? ""), trap: Boolean(task.trap) && Boolean(out.trap?.present) && inAnswer(out.trap.quote), why: out.why ?? "" };
    } catch {}
  }
  return { points: task.must.map(() => false), trap: false, why: "judge failed", failed: true };
}

async function main() {
  mkdirSync(join(HERE, "results"), { recursive: true });
  const done = new Set(existsSync(OUT) ? readFileSync(OUT, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).map((r) => `${r.task}|${r.arm}|${r.rep}`) : []);
  const jobs = [];
  for (let rep = 0; rep < REPS; rep++) for (const arm of arms) for (const t of tasks) if (!done.has(`${t.id}|${arm}|${rep}`)) jobs.push({ t, arm, rep });
  console.error(`${jobs.length} runs to do`);
  let n = 0;
  await pool(jobs, 8, async ({ t, arm, rep }) => {
    let r;
    try {
      r = await runAgent(t, arm);
    } catch (e) {
      console.error("run failed", t.id, arm, rep, String(e).slice(0, 200));
      return;
    }
    const g = await grade(t, r.answer);
    appendFileSync(OUT, `${JSON.stringify({ task: t.id, kind: t.kind, arm, rep, ...r, grade: g })}\n`);
    if (++n % 20 === 0) console.error(`${n}/${jobs.length}`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
