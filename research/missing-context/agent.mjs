// An external agent working on a task, with the company's sources as tools, in one of six arms:
//   base          the apps' own tools: search one source by words, list its recent items, read an item
//   diligent      base, told to check what changed or constrains the task before answering (a prompt, no Genter)
//   search        base + genter_search: every source at once, by words and meaning (genter's own ranking:
//                 src/lexical.js BM25 fused with vectors by src/local.js fuse), with what changed in a document
//   inject-query  search + Genter adds items nobody asked for, chosen by closeness to the agent's question
//   inject-task   search + the same, chosen by closeness to the agent's declared goal (GENTER_FIND's `goal`)
//   inject-global search + Genter adds the newest items of the workspace, whatever the task
//   inject-oracle search + Genter adds exactly the items that carry the missing context (an upper bound, not a
//                 mechanism: how often an agent uses the missing fact once it has it)
// What Genter adds is chosen by retrieval only: no model call, no judgement of importance.
import { fuse } from "../../src/local.js";
import { bm25, prepare } from "../../src/lexical.js";
import { accountsOf } from "../change-gate/detect.mjs";
import { dot, embedAll, shrink } from "../change-gate/lib.mjs";
import { isRelevant } from "./tasks.mjs";
import { NOW, dateOf, world } from "./world.mjs";

export const ARMS = ["base", "diligent", "search", "inject-query", "inject-task", "inject-global", "inject-oracle"];
export const MODEL = process.env.AGENT_MODEL || "openai/gpt-oss-120b";
const SOURCES = ["slack", "email", "crm", "tickets", "calendar", "docs"];
const MAX_STEPS = 12;
const ADDED = 4; // items Genter adds to one response at most

const basis = (arm) => (arm === "inject-task" ? "goal" : arm === "inject-global" ? "workspace's newest activity" : "question");
const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);
const oneLine = (s) => s.replace(/\s+/g, " ").trim();

let index;
async function indexOf() {
  if (index) return index;
  const w = world();
  const items = [...w.docs, ...w.messages];
  const prepared = items.map((x) => prepare({ head: x.source === "docs" ? `${x.file} ${x.heading}` : "", body: x.text }));
  const vecs = await embedAll(items.map((x) => x.text));
  index = { items, prepared, vectors: vecs.map((v) => shrink(v, 256)) };
  return index;
}

// What changed in a document lately, as genter states it next to a result: date, the lines removed and added.
function changedLine(x) {
  const recent = (x.history ?? []).filter((h) => h.t > NOW - 24 * 45);
  return recent.map((h) => `changed ${dateOf(h.t)}: removed «${clip(oneLine(h.removed.join(" ")), 160)}» added «${clip(oneLine(h.added.join(" ")), 160)}»`).join("; ");
}
const line = (x, n = 300, changes = false) =>
  `[${x.id}] ${x.t < 0 ? "" : `${dateOf(x.t)} · `}${x.source} · ${clip(oneLine(x.text), n)}${changes && changedLine(x) ? `\n    ${changedLine(x)}` : ""}`;

export async function ranked(query, pool) {
  const ix = await indexOf();
  const [qv] = await embedAll([query]);
  const q = shrink(qv, 256);
  const idx = pool ?? ix.items.map((_, i) => i);
  const lex = bm25(query, idx.map((i) => ix.prepared[i]));
  const cos = idx.map((i) => dot(q, ix.vectors[i]));
  const fused = fuse(lex, cos);
  return idx.map((i, k) => [ix.items[i], fused[k]]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).map(([x]) => x);
}

// The items Genter adds: closest to the key that the agent has not seen yet, plus the newest items of other sources
// about a customer the key names. Or, for inject-global, the newest items of the workspace.
export async function added(arm, key, seen, task) {
  const ix = await indexOf();
  if (arm === "inject-oracle") return (await ranked(task.task)).filter((x) => isRelevant(task, x) && !seen.has(x.id)).slice(0, 2);
  if (arm === "inject-global") return [...ix.items].filter((x) => x.t > 0 && !seen.has(x.id)).sort((a, b) => b.t - a.t).slice(0, ADDED);
  const close = (await ranked(key)).filter((x) => !seen.has(x.id)).slice(0, ADDED - 2);
  const names = accountsOf(key);
  // About the same customer, in the last 30 days, ranked by closeness to the key too (not by recency alone: most
  // items about a big customer are routine).
  const about = names.length
    ? (await ranked(key)).filter((x) => x.t > NOW - 24 * 30 && !seen.has(x.id) && !close.includes(x) && names.some((a) => accountsOf(x.text).includes(a))).slice(0, 2)
    : [];
  return [...close, ...about].slice(0, ADDED);
}

function tools(arm) {
  const t = [
    { name: "search_source", description: "Search one of the company's sources by words (like the app's own search). Returns the 5 best matches with their dates.", parameters: { type: "object", properties: { source: { type: "string", enum: SOURCES }, query: { type: "string" } }, required: ["source", "query"] } },
    { name: "recent", description: "List the newest items of one source.", parameters: { type: "object", properties: { source: { type: "string", enum: SOURCES }, limit: { type: "integer", minimum: 1, maximum: 20 } }, required: ["source"] } },
    { name: "read", description: "Read one item in full by its id.", parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  ];
  const wrap = (list) => list.map((f) => ({ type: "function", function: f }));
  if (arm === "base" || arm === "diligent") return wrap(t);
  const adds = arm.startsWith("inject")
    ? " Genter may also add, under 'Not asked for', a few items you did not ask about: chosen only by how close they are to your " + basis(arm) + ", never judged by Genter; decide yourself whether they matter."
    : "";
  t.push({
    name: "genter_search",
    description: "Genter: search all the company's sources at once (Slack, email, CRM, tickets, calendar, docs) by meaning and words. Results carry their dates and, for documents, what changed in them recently." + adds,
    parameters: { type: "object", properties: { question: { type: "string", description: "What to find" }, goal: { type: "string", description: arm === "inject-task" ? "The task you are working on now, in full, in your own words: Genter adds what is close to it" : "Optional: the task you are working on now, in your own words" } }, required: arm === "inject-task" ? ["question", "goal"] : ["question"] },
  });
  return wrap(t);
}

const SYSTEM = `You are an AI assistant working for the team at Northwind Labs (Rotterdam), which sells Beacon, a hosted uptime-monitoring service. Today is Monday 12 October 2026, 09:00 CET. You have tools to search and read the company's sources: Slack, email, CRM, support tickets, calendar and the internal docs. Use them as you see fit, then reply with the finished deliverable (the email, plan, agenda, note or answer). Do not ask questions back.`;
const DILIGENT = `\n\nBefore you answer, check whether anything relevant has changed recently or constrains the task: the current policies that apply, and the current state of the customer, system or deadline involved, across all sources.`;

export async function runAgent(task, arm) {
  const ix = await indexOf();
  const byId = new Map(ix.items.map((x) => [x.id, x]));
  const seen = new Set(); // every item id the agent has been shown
  const injected = []; // item ids Genter added
  const calls = [];
  let tokens = 0;
  let cost = 0;
  const messages = [
    { role: "system", content: SYSTEM + (arm === "diligent" ? DILIGENT : "") },
    { role: "user", content: task.task },
  ];
  const run = async (name, args) => {
    if (name === "search_source") {
      // An app's own search: words only, within the one source.
      const pool = ix.items.map((x, i) => [x, i]).filter(([x]) => x.source === args.source);
      const scores = bm25(args.query ?? "", pool.map(([, i]) => ix.prepared[i]));
      const hits = pool.map(([x], k) => [x, scores[k]]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([x]) => x);
      for (const x of hits) seen.add(x.id);
      return hits.length ? hits.map((x) => line(x)).join("\n") : "No results.";
    }
    if (name === "recent") {
      const hits = ix.items.filter((x) => x.source === args.source && x.t > 0).sort((a, b) => b.t - a.t).slice(0, Math.min(20, args.limit ?? 10));
      for (const x of hits) seen.add(x.id);
      return hits.map((x) => line(x, 200)).join("\n");
    }
    if (name === "read") {
      const x = byId.get(args.id);
      if (!x) return "No such item.";
      seen.add(x.id);
      return `[${x.id}] ${x.source}${x.t < 0 ? "" : ` · ${x.source === "docs" ? "last edited " : ""}${dateOf(x.t)}`}\n${x.text}`;
    }
    if (name === "genter_search") {
      const hits = (await ranked(args.question ?? "")).slice(0, 6);
      for (const x of hits) seen.add(x.id);
      let out = hits.map((x) => line(x, 1400, true)).join("\n");
      if (arm.startsWith("inject")) {
        // Genter knows the task only if the agent passed it as goal.
        const key = arm === "inject-task" && args.goal ? `${args.goal}\n${args.question ?? ""}` : (args.question ?? "");
        const extra = await added(arm, key, seen, task);
        extra.forEach((x) => {
          seen.add(x.id);
          injected.push(x.id);
        });
        if (extra.length) out += `\n\nNot asked for (added by Genter by closeness to your ${basis(arm)}, not judged):\n${extra.map((x) => line(x, 700, true)).join("\n")}`;
      }
      return out || "No results.";
    }
    return "Unknown tool.";
  };
  let answer = "";
  for (let step = 0; step < MAX_STEPS; step++) {
    const last = step === MAX_STEPS - 1;
    const { message, usage } = await chatTools(messages, last ? null : tools(arm));
    tokens += (usage?.prompt_tokens ?? 0) + (usage?.completion_tokens ?? 0);
    cost += usage?.cost ?? 0;
    const tc = message.tool_calls ?? [];
    if (!tc.length) {
      answer = message.content ?? "";
      break;
    }
    messages.push({ role: "assistant", content: message.content ?? "", tool_calls: tc });
    for (const c of tc) {
      let args = {};
      try {
        args = JSON.parse(c.function.arguments || "{}");
      } catch {}
      const out = await run(c.function.name, args);
      calls.push({ name: c.function.name, args });
      messages.push({ role: "tool", tool_call_id: c.id, content: out });
    }
  }
  return { answer, calls, seen: [...seen], injected, tokens, cost, steps: calls.length };
}

// A chat call with tools, through the same provider as lib.mjs (AI Gateway, else OpenRouter).
async function chatTools(messages, toolList) {
  const API = process.env.AI_GATEWAY_TOKEN ? { url: "https://ai-gateway.vercel.sh/v1", key: process.env.AI_GATEWAY_TOKEN } : { url: "https://openrouter.ai/api/v1", key: process.env.OPENROUTER_API_KEY };
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API.url}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, messages, temperature: 0, max_tokens: 8000, reasoning: { effort: "low" }, ...(toolList && { tools: toolList, tool_choice: "auto" }) }),
      signal: AbortSignal.timeout(180000),
    }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
    if (res.ok) {
      const data = await res.json();
      return { message: data.choices?.[0]?.message ?? {}, usage: data.usage };
    }
    if (attempt >= 5 || (res.status && res.status !== 429 && res.status < 500)) throw new Error(`agent ${res.status} ${(await res.text()).slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
  }
}

