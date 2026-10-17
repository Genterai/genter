// The verification stage: one LLM call turns a candidate into structured signals, or into nothing.
// The same verifier is fed three ways, so the gate's own worth shows:
//   gate       candidates of the mathematical gate (neighbourhood-burst, mmd-calibrated, lexical-diff, entity-sources);
//   batch-6h   every update, in batches of 6 hours (an LLM on every update, batched);
//   digest-24h every update, once a day.
// node research/change-gate/verify.mjs [--variant neutral|rubric|subscribed] [--seeds 1,2,3] [--tests A,B]
// reads results/raw-256.json, writes results/verified-<variant>.json
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildStream, TESTS } from "./build.mjs";
import { HERE, chat, dot, embedAll, parseJson, pool, readData, shrink, usage } from "./lib.mjs";
import { score } from "./run.mjs";
import { SUBSCRIBERS } from "./subscribers.mjs";

const MODEL = process.env.VERIFY_MODEL || "openai/gpt-oss-120b";
const GATE = ["neighbourhood-burst", "mmd-calibrated", "lexical-diff", "entity-sources"];
const MAX_ITEMS = 40;
const arg = (k) => process.argv.includes(k) && process.argv[process.argv.indexOf(k) + 1];
const SEEDS = (arg("--seeds") || "1,2,3").split(",").map(Number);
const VARIANT = arg("--variant") || "neutral";

export const SYSTEM = `You are the verification stage of Genter, an infrastructure layer that indexes an organisation's sources (Slack, email, CRM, support tickets, calendar, documents) and hands verifiable context signals to other agents. Genter is not an expert or an advisor: it never recommends, advises, decides, plans or tells anyone what to do. Other agents interpret signals and decide.

You get items that arrived recently (each with an id, source, day and text; a document edit shows the lines removed and added) and, under each, the most similar items known before it. Decide whether they contain a signal that deserves another agent's attention:
- new_direction: a subject that was not discussed before is now discussed;
- change: a stated fact or state changed (a value, a status, an outcome, a rule, a date);
- contradiction: an item conflicts with what is known;
- link: items from different sources about the same entity form a pattern that no single item shows.
Routine traffic, cosmetic or harmless edits, duplicates, bot notifications, the same content in another language and backfilled old pages are not signals.

Reply with JSON only: {"signals": [{"kind": "new_direction|change|contradiction|link", "observed": "one factual sentence: what was observed", "entity": "the entity or topic", "sources": ["..."], "evidence": ["item ids"], "before": "what was known before, if anything", "confidence": 0.0-1.0, "why": "a factual reason it deserves attention: what differs from before or what connects the items"}]}. Use {"signals": []} when there is none. Facts only, quoted from the items; no advice, no next steps.`;

// Variants of the same verifier. neutral: facts only, no view of what matters. rubric: a generic rule of what is
// material, which is a prompt-skill of Genter's own. subscribed: no view of its own; a signal must bear on the declared
// task of a subscriber that may see its sources.
const RUBRIC = `\n\nOnly report what is material: a change or a new subject that alters an obligation, a permission, a commitment to or from a customer or partner, a deadline, money, a security or reliability risk, or the status of a customer relationship or a project. Everyday details (meeting times, wording, tips, tool versions in examples, a single routine request) are not material.`;
const SUBSCRIBED = `\n\nThese agents subscribed to signals, each with its own task and the sources it may see:\n${SUBSCRIBERS.map((a) => `- ${a.id}: ${a.task} Sources: ${a.access.join(", ")}.`).join("\n")}\nDo not judge importance on your own: report a signal only when it bears on at least one subscriber's task, and add "for": ["subscriber ids"]. A subscriber gets a signal only if it may see the sources of its evidence.`;
export const systemFor = (v) => SYSTEM + (v === "rubric" ? RUBRIC : v === "subscribed" ? SUBSCRIBED : "");

const ADVICE = /\b(should|recommend|suggest|consider|advis|need to|needs to|must be|next step|action item|we propose|it is advisable|follow up|reach out)\w*/i;

function diff(a, b) {
  const A = a.split("\n");
  const B = b.split("\n");
  return { removed: A.filter((l) => !B.includes(l)), added: B.filter((l) => !A.includes(l)) };
}
const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);
const day = (t) => (t < 0 ? "before" : `day ${Math.floor(t / 24)} ${String(Math.floor(t % 24)).padStart(2, "0")}:00`);

function render(stream, vectors, evidenceIds, at) {
  const byId = new Map(stream.items.map((x) => [x.id, x]));
  let ev = evidenceIds.map((id) => byId.get(id)).filter(Boolean);
  if (ev.length > MAX_ITEMS) ev = ev.filter((_, i) => i % Math.ceil(ev.length / MAX_ITEMS) === 0);
  const before = [...stream.initial.map((s) => ({ id: s.id, t: -1, source: "docs", text: s.text })), ...stream.items.filter((x) => x.t < at)];
  const lines = ev.map((x) => {
    const v = vectors.get(x.text);
    const ctx = before
      .filter((y) => y.t < x.t && y.id !== x.id && y.section !== x.section && y.id !== x.section)
      .map((y) => [y, dot(v, vectors.get(y.text))])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    const body = x.kind === "edit" ? (({ removed, added }) => `edit of ${x.section}\n  removed: ${clip(removed.join(" / "), 400)}\n  added: ${clip(added.join(" / "), 400)}`)(diff(x.old, x.text)) : clip(x.text, 400);
    return `[${x.id}] (${x.source}, ${day(x.t)}) ${body}\n${ctx.map(([y]) => `    known before: (${y.source ?? "docs"}, ${day(y.t)}) ${clip(y.text.replace(/\n/g, " "), 220)}`).join("\n")}`;
  });
  return { text: lines.join("\n\n"), shown: ev.length };
}

async function verifyOne(stream, vectors, c) {
  const { text, shown } = render(stream, vectors, c.evidence, c.t);
  if (!shown) return { ...c, signals: [], cost: 0, tokens: 0 };
  let out;
  let u;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await chat(MODEL, [{ role: "system", content: systemFor(VARIANT) }, { role: "user", content: text }], { json: true, reasoning: "low", max_tokens: 6000 });
      u = r.usage;
      out = parseJson(r.text);
      break;
    } catch {}
  }
  const known = new Set(c.evidence);
  const byId = new Map(stream.items.map((x) => [x.id, x]));
  let signals = (out?.signals ?? []).map((s) => ({ ...s, evidence: (s.evidence ?? []).filter((id) => known.has(id)) }));
  if (VARIANT === "subscribed") {
    // Access is enforced here, not by the model: a subscriber keeps a signal only if it may see a source of its evidence.
    signals = signals
      .map((s) => ({ ...s, for: (Array.isArray(s.for) ? s.for : []).filter((id) => {
        const a = SUBSCRIBERS.find((x) => x.id === id);
        return a && s.evidence.some((e) => a.access.includes(byId.get(e)?.kind === "edit" ? "docs" : byId.get(e)?.source));
      }) }))
      .filter((s) => s.for.length);
  }
  return { ...c, shown, signals, cost: u?.cost ?? 0, tokens: (u?.prompt_tokens ?? 0) + (u?.completion_tokens ?? 0) };
}

const raw = JSON.parse((await import("node:fs")).readFileSync(join(HERE, "results", "raw-256.json"), "utf8"));
const results = [];
for (const test of (arg("--tests") || TESTS.join(",")).split(",")) for (const seed of SEEDS) {
  const stream = buildStream(test, seed);
  const texts = [...new Set([...stream.initial.map((x) => x.text), ...stream.items.map((x) => x.text)])];
  const vs = await embedAll(texts);
  const vectors = new Map(texts.map((t, i) => [t, shrink(vs[i], 256)]));
  const scored = stream.items.filter((x) => x.t >= stream.scoredFrom);
  const gate = new Map();
  for (const d of GATE) for (const a of raw.find((r) => r.test === test && r.seed === seed && r.detector === d).alarmList) {
    const g = gate.get(a.t) ?? { t: a.t, evidence: [], parts: [] };
    g.evidence = [...new Set([...g.evidence, ...a.evidence])];
    g.parts.push(d);
    gate.set(a.t, g);
  }
  const batches = (hours) => {
    const out = [];
    for (let t = stream.scoredFrom + hours; t <= stream.scoredFrom + 28 * 24; t += hours) {
      const ev = scored.filter((x) => x.t >= t - hours && x.t < t).map((x) => x.id);
      if (ev.length) out.push({ t, evidence: ev });
    }
    return out;
  };
  const arms = { gate: [...gate.values()].sort((a, b) => a.t - b.t), "batch-6h": batches(6), "digest-24h": batches(24) };
  for (const [arm, cands] of Object.entries(arms)) {
    const done = await pool(cands, 16, (c) => verifyOne(stream, vectors, c));
    const accepted = done.filter((d) => d.signals.length).map((d) => ({ t: d.t, evidence: [...new Set(d.signals.flatMap((s) => s.evidence))] }));
    const signals = done.flatMap((d) => d.signals.map((s) => ({ ...s, t: d.t })));
    results.push({
      test, seed, arm,
      calls: done.length,
      cost: done.reduce((s, d) => s + d.cost, 0),
      tokens: done.reduce((s, d) => s + d.tokens, 0),
      truncated: done.filter((d) => d.evidence.length > MAX_ITEMS).length,
      before: score(stream, cands),
      after: score(stream, accepted),
      advice: signals.filter((s) => ADVICE.test(`${s.observed} ${s.why}`)).length,
      signals,
    });
    console.error(test, seed, arm, done.length, "calls", results.at(-1).after.events.map((e) => `${e.id}:${e.strict ? "+" : "-"}`).join(" "), "fp", results.at(-1).after.fp, "$", results.at(-1).cost.toFixed(4));
  }
}
writeFileSync(join(HERE, "results", `verified-${VARIANT}.json`), JSON.stringify(results));
console.error("usage", usage);
