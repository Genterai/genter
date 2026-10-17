// Generates the texts of the streams once and freezes them in data/ (run: node research/change-gate/gen.mjs).
// The generator model is not the model that later verifies signals, so the verifier does not grade its own writing.
import { ACCOUNTS, BUCKETS, DRIFT_TOPIC, NEW_TOPICS } from "./scenario.mjs";
import { chat, parseJson, pool, rng, sections, shuffle, usage, writeData } from "./lib.mjs";

const MODEL = process.env.GEN_MODEL || "openai/gpt-4.1-mini";
const COMPANY = "Northwind Labs, a 40-person company in Rotterdam that sells Beacon, a hosted uptime-monitoring service. Its customers include " + ACCOUNTS.join(", ") + ".";

async function list(prompt, n, key = "items") {
  const out = [];
  while (out.length < n) {
    const want = Math.min(40, n - out.length);
    const { text } = await chat(MODEL, [{ role: "user", content: `${prompt}\n\nWrite ${want} items. Return JSON: {"${key}": ["...", ...]} with plain strings only.` }], { json: true, temperature: 1 });
    out.push(...(parseJson(text)[key] ?? []).filter((s) => typeof s === "string" && s.trim()));
  }
  return out.slice(0, n);
}

const style = (source) =>
  ({
    slack: "Slack messages (one message each, 1-3 sentences, casual, some with emoji or lowercase)",
    email: "emails (each: a short subject line, then 2-5 sentences of body, signed with a first name)",
    crm: "CRM activity entries (system-generated or short notes, 1-2 sentences)",
    tickets: "support tickets (each: 'Ticket #<5 digits> from <account>: ' then 1-4 sentences)",
    calendar: "calendar events (each: title, day/time, attendees in one line)",
  })[source];

const prompts = {};
for (const [source, bucket, what, n] of BUCKETS) prompts[bucket] = { source, n, prompt: `Company: ${COMPANY}\nWrite realistic, varied ${style(source)} about: ${what}.\nThey are routine: nothing alarming, nothing decided that matters. Vary length, tone, names and details; include a few unusual but unimportant ones.` };

const background = (
  await pool(Object.entries(prompts), 6, async ([bucket, { source, n, prompt }]) => (await list(prompt, n)).map((text, i) => ({ id: `${bucket}-${i}`, source, bucket, text })))
).flat();
writeData("pool.json", background);
console.log("pool", background.length);

const [dsource, dbucket, dwhat, dn] = DRIFT_TOPIC;
const drift = (await list(`Company: ${COMPANY}\nWrite realistic, varied items, mostly ${style("tickets")} and some ${style("slack")}, about: ${dwhat}. Each one is a single report or remark; no one has yet connected them into a pattern.`, dn)).map((text, i) => ({ id: `${dbucket}-${i}`, source: /^Ticket/.test(text) ? dsource : "slack", bucket: dbucket, text }));
writeData("drift.json", drift);
console.log("drift", drift.length);

const fresh = (
  await pool(NEW_TOPICS, 2, async (t) => (await list(`Company: ${COMPANY}\nWrite the messages of this situation, in order, each tagged with its source: ${t.prompt}\nEach item: "<source>: <text>" where source is one of slack, email, tickets, calendar, crm.`, t.n)).map((s, i) => {
    const m = /^(slack|email|tickets|calendar|crm)\s*(\([^)]*\))?\s*:\s*/i.exec(s);
    return { id: `${t.id}-${i}`, event: t.id, source: m ? m[1].toLowerCase() : "slack", text: m ? s.slice(m[0].length) : s };
  }))
).flat();
writeData("newtopics.json", fresh);
console.log("newtopics", fresh.length);

// Harmless edits of document sections: wording, a non-critical line, a harmless number (a meeting time, a room).
const secs = sections();
const rand = rng(7);
const picks = shuffle(secs, rand);
async function edits(targets, instruction, kind) {
  const groups = [];
  for (let i = 0; i < targets.length; i += 6) groups.push(targets.slice(i, i + 6));
  return (
    await pool(groups, 6, async (g) => {
      const { text } = await chat(MODEL, [{ role: "user", content: `${instruction}\n\nReturn JSON {"edits": [{"id": "<section id>", "text": "<the whole new section text>"}]}, one per section, same order.\n\n${g.map((s) => `=== id: ${s.id}\n${s.text}`).join("\n\n")}` }], { json: true, temperature: 0.7, max_tokens: 16000 });
      const byId = new Map((parseJson(text).edits ?? []).map((e) => [e.id, e.text]));
      return g.filter((s) => byId.get(s.id) && byId.get(s.id) !== s.text).map((s) => ({ section: s.id, file: s.file, kind, old: s.text, text: byId.get(s.id) }));
    })
  ).flat();
}
const harmless = await edits(
  picks.slice(0, 90),
  "Make ONE small, harmless edit to each section, as a colleague would in a normal week: fix a typo, reword one sentence, add one unimportant sentence (a tip, a link, a contact), or change a harmless detail such as a meeting time, a room name, a Slack channel's emoji, an example value. It MUST NOT change any policy, limit, deadline, price, retention period, permission, approval rule or obligation. Keep everything else byte-identical.",
  "harmless",
);
const cosmetic = await edits(
  picks.slice(90, 130),
  "Re-save each section after a cosmetic pass: rewrap or reorder sentences, change list markers, adjust wording slightly, but keep every fact, number and rule exactly the same in meaning.",
  "cosmetic",
);
// Harmless changes of a number, so that "a number changed" is not by itself the mark of a critical edit.
const numbers = await edits(
  picks.slice(130, 160),
  "Make ONE harmless change of a number or time in each section, the kind nobody needs to be told about: a meeting or standup time, a room or floor number, a version in an example command, a sample value in a code block, an example count, a page number of a reference, a phone extension. If the section has no such harmless number, add one short harmless sentence that contains one (e.g. 'The team sync is at 10:30 on Tuesdays.'). It MUST NOT change any policy, limit, deadline, price, retention period, permission, approval rule, SLA or obligation. Keep everything else byte-identical.",
  "harmless-number",
);
harmless.push(...numbers);
writeData("doc-edits.json", { harmless, cosmetic });
console.log("doc edits", harmless.length, cosmetic.length);

// The same routine traffic in Russian (test E-lang).
const ruSource = shuffle(background, rng(11)).slice(0, 70);
const ru = (
  await pool(Array.from({ length: 7 }, (_, i) => ruSource.slice(i * 10, i * 10 + 10)), 6, async (g) => {
    const { text } = await chat(MODEL, [{ role: "user", content: `Translate each item into natural Russian as a Russian-speaking colleague would write it (keep names, products, numbers). Return JSON {"items": ["...", ...]} in the same order.\n\n${g.map((x, i) => `${i + 1}. ${x.text}`).join("\n")}` }], { json: true });
    return (parseJson(text).items ?? []).map((t, i) => ({ id: `ru-${g[i]?.id}`, source: g[i]?.source, bucket: g[i]?.bucket, text: t }));
  })
).flat().filter((x) => x.source);
writeData("ru.json", ru);
console.log("ru", ru.length);

const backfill = (await list(`Company: ${COMPANY}\nWrite short pages (3-6 sentences each, starting with a page title line) of an old Notion wiki, from 2023-2024: old meeting notes, past retros, a past offsite agenda, outdated how-tos, a lunch rota, old onboarding checklists. Routine, historical content.`, 120)).map((text, i) => ({ id: `notion-${i}`, source: "notion", bucket: "backfill", text }));
writeData("backfill.json", backfill);
console.log("backfill", backfill.length);
console.log("usage", usage);
