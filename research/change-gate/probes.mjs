// What embeddings can and cannot see: node research/change-gate/probes.mjs
// 1. Pairs that differ in meaning (polarity, negation, a number, a date, who replaced whom, a contradiction) against
//    a rewording of the same sentence: is the opposite closer than the rewording?
// 2. How far a document section's vector moves on a critical edit and on harmless ones (genter's local engine embeds
//    sections).
// 3. The same for the vector genter's app engine keeps: the embedding of the model-written description of a result
//    (describe() in src/genter.js, the same prompt and model), so what an Anchor's own vector sees of an edit.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { CRITICAL } from "./scenario.mjs";
import { HERE, chat, dot, embedAll, parseJson, pool, readData, sections, shrink, usage } from "./lib.mjs";

// [base, rewording, opposite]
const PAIRS = {
  polarity: [
    ["Acme Logistics has renewed its contract for 24 months.", "Acme Logistics extended the agreement by another two years.", "Acme Logistics has terminated its contract."],
    ["Globex signed the renewal of the Beacon subscription.", "The Beacon subscription renewal was signed by Globex.", "Globex cancelled the Beacon subscription."],
    ["The deal with Initech is closed won.", "We won the Initech deal.", "The deal with Initech is closed lost."],
    ["The customer accepted our proposal.", "Our proposal was accepted by the customer.", "The customer rejected our proposal."],
    ["The candidate accepted the offer.", "The offer was accepted by the candidate.", "The candidate declined the offer."],
    ["The release passed all checks and was approved.", "All checks passed and the release got approval.", "The release failed its checks and was rejected."],
  ],
  negation: [
    ["Copying production data to laptops is allowed.", "It is permitted to copy production data onto laptops.", "Copying production data to laptops is not allowed."],
    ["Umbrella Retail will renew the contract.", "Umbrella Retail is going to renew the contract.", "Umbrella Retail will not renew the contract."],
    ["The rollout to the EU is safe to proceed.", "It is safe to go ahead with the EU rollout.", "The rollout to the EU is not safe to proceed."],
    ["Customer data is shared with third parties.", "We share customers' data with third parties.", "Customer data is never shared with third parties."],
    ["Rolling back needs an approval.", "An approval is required to roll back.", "Rolling back never needs an approval."],
    ["The backup restore drill succeeded.", "The restore drill of the backups was successful.", "The backup restore drill did not succeed."],
  ],
  number: [
    ["Postgres backups are kept for 35 days.", "We retain Postgres backups for 35 days.", "Postgres backups are kept for 3 days."],
    ["Price changes need 60 days' notice.", "We must give 60 days of notice before changing prices.", "Price changes need 6 days' notice."],
    ["The SLA guarantees 99.9% uptime.", "Uptime of 99.9% is guaranteed by the SLA.", "The SLA guarantees 99.5% uptime."],
    ["The Business plan costs $790 per year.", "A year of the Business plan is $790.", "The Business plan costs $7,900 per year."],
    ["The canary takes 10% of traffic.", "10% of the traffic goes to the canary.", "The canary takes 100% of traffic."],
    ["Security answers deletion requests within ten days.", "Deletion requests get an answer from Security in ten days.", "Security answers deletion requests within ninety days."],
  ],
  date: [
    ["The SOC 2 evidence deadline is Dec 15.", "Evidence for SOC 2 is due on December 15.", "The SOC 2 evidence deadline is Nov 1."],
    ["The contract ends on 31 March 2027.", "The agreement expires on March 31, 2027.", "The contract ends on 31 March 2026."],
    ["The migration is planned for Q3.", "We plan the migration in the third quarter.", "The migration is planned for Q1."],
    ["The offsite is on Friday.", "We have the offsite on Friday.", "The offsite is on Monday."],
  ],
  order: [
    ["Pingdom was replaced by Beacon at Fabrikam.", "At Fabrikam, Beacon took the place of Pingdom.", "Beacon was replaced by Pingdom at Fabrikam."],
    ["The EU rotation hands over to the US rotation.", "The US rotation takes over from the EU rotation.", "The US rotation hands over to the EU rotation."],
    ["Staging is deployed before production.", "Production is deployed after staging.", "Production is deployed before staging."],
    ["Sven reports to Daniel.", "Daniel is Sven's manager.", "Daniel reports to Sven."],
  ],
  contradiction: [
    ["The database migration is finished.", "We have completed the database migration.", "The database migration has not started yet."],
    ["All customers' API keys were rotated.", "Every customer API key has been rotated.", "No customer API keys have been rotated."],
    ["The incident affected only the staging environment.", "Only staging was hit by the incident.", "The incident took down production for all customers."],
    ["Contoso Health is happy with Beacon and expanding.", "Contoso Health is satisfied and growing its use of Beacon.", "Contoso Health is unhappy with Beacon and leaving."],
  ],
};

async function pairs() {
  const all = Object.values(PAIRS).flat().flat();
  const v = await embedAll(all);
  const vec = new Map(all.map((t, i) => [t, v[i]]));
  const out = {};
  for (const dims of [1536, 256]) {
    for (const [group, list] of Object.entries(PAIRS)) {
      const rows = list.map(([a, para, opp]) => {
        const A = shrink(vec.get(a), dims);
        return { para: dot(A, shrink(vec.get(para), dims)), opp: dot(A, shrink(vec.get(opp), dims)) };
      });
      (out[dims] ??= {})[group] = {
        rewording: +(rows.reduce((s, r) => s + r.para, 0) / rows.length).toFixed(3),
        opposite: +(rows.reduce((s, r) => s + r.opp, 0) / rows.length).toFixed(3),
        oppositeCloser: `${rows.filter((r) => r.opp > r.para).length}/${rows.length}`,
      };
    }
  }
  return out;
}

function edits() {
  const secs = sections();
  const { harmless, cosmetic } = readData("doc-edits.json");
  const crit = CRITICAL.filter((c) => c.file).map((c) => {
    const s = secs.find((x) => x.file === c.file && x.text.includes(c.find));
    return { id: c.id, kind: "critical", section: s.id, old: s.text, text: s.text.replace(c.find, c.replace) };
  });
  return [...crit, ...harmless.map((e, i) => ({ id: `h${i}`, ...e })), ...cosmetic.map((e, i) => ({ id: `c${i}`, ...e, kind: "cosmetic" }))];
}

async function sectionDeltas(list) {
  const texts = list.flatMap((e) => [e.old, e.text]);
  const v = await embedAll(texts);
  const m = new Map(texts.map((t, i) => [t, v[i]]));
  const out = {};
  for (const dims of [1536, 256]) {
    const d = list.map((e) => ({ id: e.id, kind: e.kind, delta: 1 - dot(shrink(m.get(e.old), dims), shrink(m.get(e.text), dims)) }));
    out[dims] = summarizeDeltas(d);
  }
  return out;
}

function summarizeDeltas(d) {
  const kinds = [...new Set(d.map((x) => x.kind))];
  const crit = d.filter((x) => x.kind === "critical");
  const other = d.filter((x) => x.kind !== "critical").map((x) => x.delta).sort((a, b) => a - b);
  return {
    byKind: Object.fromEntries(kinds.map((k) => {
      const xs = d.filter((x) => x.kind === k).map((x) => x.delta).sort((a, b) => a - b);
      return [k, { n: xs.length, median: +xs[Math.floor(xs.length / 2)].toFixed(4), max: +xs.at(-1).toFixed(4) }];
    })),
    critical: crit.map((c) => ({ id: c.id, delta: +c.delta.toFixed(4), shareOfHarmlessMovingMore: +(other.filter((x) => x > c.delta).length / other.length).toFixed(2) })),
  };
}

// describe() of src/genter.js, verbatim prompt, for a document read by a file tool.
async function describe(data) {
  const tool = "GOOGLEDRIVE_DOWNLOAD_FILE";
  const args = { file_id: "doc" };
  const { text } = await chat(process.env.SUMMARY_MODEL || "openai/gpt-oss-120b", [{
    role: "user",
    content:
      `A call of ${tool} with args ${JSON.stringify(args).slice(0, 600)} returned the data below. ` +
      'Reply with JSON only: {"title": "...", "short": "...", "summary": "...", "items": ["..."], "keywords": ["..."]}.\n' +
      'title: what this result is, as a name of up to 8 words for these exact args, in English, e.g. "Open pull requests of Genterai/genter-cli".\n' +
      "short: ONE sentence of up to 140 characters saying what this result is about and can answer (the content, not the call or its args). Not a repeat of the title.\n" +
      "summary: 2-4 sentences retelling what the result MEANS and contains, so it can be found later by topic: the app and the kind of things it holds, " +
      "subjects, people, companies, projects, dates, decisions, and the ids or URLs needed to open it again. Use the plain words people search with " +
      "(email, meeting, invoice, pull request, task). Write in English, but quote subjects, titles and names exactly as they are.\n" +
      "items: up to 15 things the result holds, one short line each, the way someone would look for it: what it is, its " +
      'title or subject exactly as written, its date, e.g. "Calendar event «Уборка» on 2026-10-03 13:00". [] when it is empty.\n' +
      "keywords: 10-25 search keywords and short phrases (1-3 words each) someone would type to find this result later: the app, the kind " +
      "of thing (email, inbox, calendar event, pull request, invoice), synonyms and related words (meeting, call, appointment), the topics, and " +
      "the people, companies, projects and places named in it. In English, and the same words again in the language of the data when it is not " +
      'English (e.g. "email", "inbox", "unread", "почта", "письма", "входящие"). Lowercase, no repeats.\n' +
      "Only say what is in the data, do not guess. No passwords, tokens or keys." +
      `\n\n${JSON.stringify({ name: "doc.md", content: data })}`,
  }], { json: true, reasoning: "low", max_tokens: 4000 });
  const out = parseJson(text);
  return { summaryText: out.keywords?.length ? `${out.summary}\nKeywords: ${out.keywords.join(", ")}` : out.summary, items: out.items ?? [] };
}

async function anchorDeltas(list) {
  const pick = [...list.filter((e) => e.kind === "critical"), ...list.filter((e) => e.kind === "harmless").slice(0, 8), ...list.filter((e) => e.kind === "harmless-number").slice(0, 6), ...list.filter((e) => e.kind === "cosmetic").slice(0, 6)];
  const described = await pool(pick, 6, async (e) => ({ ...e, before: await describe(e.old), after: await describe(e.text) }));
  const texts = described.flatMap((e) => [e.before.summaryText, e.after.summaryText]);
  const v = await embedAll(texts);
  const m = new Map(texts.map((t, i) => [t, v[i]]));
  const d = described.map((e) => ({ id: e.id, kind: e.kind, delta: 1 - dot(m.get(e.before.summaryText), m.get(e.after.summaryText)) }));
  // Does the description after a critical edit say what changed? The words the edit added or removed, as tokens.
  const tok = (x) => new Set(x.toLowerCase().match(/[a-z]+|\d+/g) ?? []);
  const said = described.filter((e) => e.kind === "critical").map((e) => {
    const c = CRITICAL.find((x) => x.id === e.id);
    const [f, r] = [tok(c.find), tok(c.replace)];
    const added = [...r].filter((w) => !f.has(w));
    const removed = [...f].filter((w) => !r.has(w));
    const before = tok(`${e.before.summaryText}\n${e.before.items.join("\n")}`);
    const after = tok(`${e.after.summaryText}\n${e.after.items.join("\n")}`);
    return { id: e.id, added, removed, addedInDescriptionAfter: added.filter((w) => after.has(w)), removedInDescriptionBefore: removed.filter((w) => before.has(w)), before: e.before.summaryText.split("\nKeywords")[0], after: e.after.summaryText.split("\nKeywords")[0] };
  });
  return { ...summarizeDeltas(d), said };
}

const list = edits();
const result = { pairs: await pairs(), sectionDeltas: await sectionDeltas(list), anchorDeltas: await anchorDeltas(list), usage };
writeFileSync(join(HERE, "results", "probes.json"), `${JSON.stringify(result, null, 1)}\n`);
console.log(JSON.stringify(result, null, 1));
