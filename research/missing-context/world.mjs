// One world for the agents: the Northwind Labs of research/change-gate, as it stands on Monday 12 October 2026 09:00.
// Routine traffic and harmless document edits of one replay stream, with the events of every test of that study on
// top: contract outcomes (A), the API key incident and the Datadog talks (B), the eu-west alert drift (C), the two
// accounts that are leaving (D) and the small critical edits (F). No noise stream (E).
import { buildStream } from "../change-gate/build.mjs";
import { accountsOf } from "../change-gate/detect.mjs";
import { sections } from "../change-gate/lib.mjs";

export const DAY0 = Date.UTC(2026, 7, 31); // Monday
export const NOW = 42 * 24 + 9; // Monday 12 October 2026, 09:00
export const dateOf = (t) => new Date(DAY0 + t * 3600e3).toISOString().slice(0, 16).replace("T", " ");

let cached;
export function world() {
  if (cached) return cached;
  const base = buildStream("A", 1);
  const items = new Map(base.items.map((x) => [x.id, x]));
  for (const test of ["B", "C", "D", "F"]) for (const x of buildStream(test, 1).items) if (x.gold) items.set(x.id, x);
  // The routine generator kept writing "renewal still under review" and "QBR on Tuesday" for accounts after their
  // planted outcome. Such routine items are dropped after the outcome, so the world does not contradict itself.
  const outcomes = { "Acme Logistics": "A1-0", Globex: "A2-0", "Umbrella Retail": "A3-0", "Contoso Health": "D1-0", Fabrikam: "D2-0" };
  const conflicting = /^(renewal-routine|customer-meetings|usage-reports|call-notes|sales-chatter|deal-updates)-/;
  for (const [account, id] of Object.entries(outcomes)) {
    const at = items.get(id).t;
    for (const [k, x] of items) if (!x.gold && x.t > at && conflicting.test(x.id) && accountsOf(x.text).includes(account)) items.delete(k);
  }
  const all = [...items.values()].filter((x) => x.t < NOW).sort((a, b) => a.t - b.t);

  // Documents: the corpus sections, then every edit in time order. Each section keeps its history of edits.
  const docs = new Map(sections().map((s) => [s.id, { id: s.id, source: "docs", file: s.file, heading: s.heading, text: s.text, t: -1, history: [] }]));
  const messages = [];
  for (const x of all) {
    if (x.kind === "edit") {
      const d = docs.get(x.section);
      if (d.text !== x.old) throw new Error(`edit of ${x.section} does not apply to its current text`);
      const before = d.text.split("\n");
      const after = x.text.split("\n");
      d.history.push({ t: x.t, id: x.id, removed: before.filter((l) => !after.includes(l)), added: after.filter((l) => !before.includes(l)) });
      d.text = x.text;
      d.t = x.t;
    } else messages.push({ id: x.id, source: x.source, t: x.t, text: x.text, gold: x.gold });
  }
  cached = { docs: [...docs.values()], messages, byId: new Map([...docs.values(), ...messages].map((x) => [x.id, x])) };
  return cached;
}
