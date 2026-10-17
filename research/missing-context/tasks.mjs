// The tasks given to the external agents, with what a correct result must contain, fixed before any agent ran.
// kind: what the agent would have to find out that the task does not say.
//   changed-direct      the task asks for a fact that changed (control for plain search)
//   changed-constraint  the action is governed by a rule that changed recently; the task does not mention the rule
//   entity-state        the state of the task's customer changed in another source; the task presupposes the old state
//   static-policy       a standing policy constrains the action; the task does not mention it
//   new-situation       a recent situation (incident, emerging pattern, new partner) bears on the task
//   control             nothing is hidden; measures what added context costs when nothing is missing
// must: points a correct result states (each judged on its own); trap: a claim that would be wrong now;
// relevant: the items that carry the missing context (for the precision of added context).
const C1 = "drift:C1"; // any of the eu-west late/false alert items

export const TASKS = [
  { id: "T01", kind: "changed-direct", task: "What is the retention period of our production Postgres backups?", must: ["Postgres backups are retained for 3 days"], trap: "35 days", relevant: ["ops/backups.md#What is backed up"] },
  { id: "T02", kind: "changed-direct", task: "How much notice do we have to give existing customers before a price change?", must: ["6 days' notice by email"], trap: "60 days", relevant: ["product/pricing.md#Changing prices"] },
  { id: "T03", kind: "changed-direct", task: "When is the SOC 2 evidence deadline?", must: ["November 1 (moved from December 15)"], trap: "December 15 as the current deadline", relevant: ["F5"] },
  { id: "T04", kind: "changed-direct", task: "Can the on-call engineer roll back a production deploy without asking anyone?", must: ["No: rolling back is not allowed without an approval"], trap: "rolling back is always allowed / needs no approval", relevant: ["ops/deploy-production.md#Rolling back"] },

  { id: "T05", kind: "changed-constraint", task: "Tyrell Bio asked us to restore their monitor configuration as it was ten days ago, from our database backups. Write the step-by-step plan for the on-call engineer.", must: ["Postgres backups are now kept only 3 days, so a state from ten days ago cannot be restored from them (or says it must be checked first)"], trap: "a restore plan that assumes backups from ten days ago exist (35-day retention)", relevant: ["ops/backups.md#What is backed up"] },
  { id: "T06", kind: "changed-constraint", task: "We are raising the Team plan price for existing customers. Draft the announcement email; the new price should apply from October 15.", must: ["Existing customers need 6 days' notice, so October 15 is too early (earliest date after the notice)", "New prices apply from the next renewal after the notice period"], trap: "states a 60-day notice", relevant: ["product/pricing.md#Changing prices"] },
  { id: "T07", kind: "changed-constraint", task: "beacon-api in production returns 500s after this morning's deploy. Write the exact steps for the on-call engineer to roll it back right now.", must: ["Get an approval before rolling back (rolling back now needs an approval)"], trap: "says rollback needs no approval", relevant: ["ops/deploy-production.md#Rolling back"] },
  { id: "T08", kind: "changed-constraint", task: "Plan the SOC 2 evidence collection: propose weekly milestones from now up to the deadline.", must: ["The deadline is November 1 (moved from December 15), and milestones end by it"], trap: "milestones that run up to December 15", relevant: ["F5"] },
  { id: "T09", kind: "changed-constraint", task: "A developer wants a copy of one production customer's monitor data on their laptop to debug a parsing bug. Reply to the developer with what they may do.", must: ["The access-control page currently says copying production data to laptops is allowed", "That rule changed recently (on 23 September it said this was not allowed)"], trap: "", relevant: ["security/access-control.md#Production data"] },

  { id: "T10", kind: "entity-state", task: "Draft the agenda for Thursday's QBR with Contoso Health.", must: ["The Contoso Health QBR was cancelled", "Their champion Maria Lopez has left the company", "Warning signs: usage down about 38% and/or a request to export all their historical data"], trap: "", relevant: ["D1-0", "D1-1", "D1-2", "D1-3", "D1-4"] },
  { id: "T11", kind: "entity-state", task: "Write an upsell email to Fabrikam proposing they add 20 more seats on the Business plan.", must: ["Fabrikam's invoice is 21 days overdue", "Fabrikam asked how to downgrade to Starter", "Fabrikam is trialing Pingdom (and/or usage fell about 25%)"], trap: "", relevant: ["D2-0", "D2-1", "D2-2", "D2-3"] },
  { id: "T12", kind: "entity-state", task: "Send Umbrella Retail a friendly follow-up on the renewal quote we sent them.", must: ["Umbrella Retail already said they will not renew the contract"], trap: "", relevant: ["A3-0", "A3-1"] },
  { id: "T13", kind: "entity-state", task: "Draft a renewal reminder email to Globex for their contract that ends this term.", must: ["Globex already decided not to renew and gave notice of termination (opportunity Closed Lost)"], trap: "", relevant: ["A2-0", "A2-1"] },
  { id: "T14", kind: "entity-state", task: "Prepare a negotiation brief for the upcoming Acme Logistics renewal call.", must: ["Acme Logistics already signed the renewal: extended 24 months on the Business plan (Closed Won)"], trap: "", relevant: ["A1-0", "A1-1"] },

  { id: "T15", kind: "static-policy", task: "Hooli Cloud will sign a one-year Business contract this week if we give them 25% off. Draft the email confirming the 25% discount.", must: ["A discount above 20% needs written approval from the CFO, Ilse Brandt"], trap: "", relevant: ["sales/playbook.md#Discounts"] },
  { id: "T16", kind: "static-policy", task: "Soylent Foods is on a Team trial that we already extended once. They ask for another 30 days. Reply to them.", must: ["A trial can be extended only once, by 14 days, so another extension is not possible"], trap: "", relevant: ["product/pricing.md#Trials"] },
  { id: "T17", kind: "static-policy", task: "Write the plan to ship the dashboard tooltip fix to production this Friday at 17:30 CET.", must: ["Nothing goes to production after 16:00 CET on Friday (until Monday) without approval from the VP Engineering"], trap: "", relevant: ["ops/deploy-production.md#Deploy windows"] },
  { id: "T18", kind: "static-policy", task: "Stark Media lost three hours of checks because of a bug on our side and asks for a refund of three months. Reply to their ticket.", must: ["Support can give service credits of up to one month; a refund goes to the account owner in Sales"], trap: "", relevant: ["support/escalation.md#Refunds and credits"] },
  { id: "T19", kind: "static-policy", task: "Yesterday's SEV2 incident is closed. Write the note to the team saying when its review will be published; we are thinking of the end of the month.", must: ["The PIR must be published within 5 business days of the incident closing"], trap: "", relevant: ["ops/incident-response.md#Post-incident review"] },
  { id: "T20", kind: "static-policy", task: "A customer asked us to delete their data earlier than our retention periods. Reply with when it will be done.", must: ["Security handles such requests within ten days (and confirms)"], trap: "", relevant: ["security/data-retention.md#When a customer leaves"] },

  { id: "T21", kind: "new-situation", task: "Reply to Stark Media's ticket asking for a summary of our security practices for their vendor review.", must: ["Mentions the recent incident: an admin-scope API key was exposed in a public GitHub repository, keys were rotated, no misuse found"], trap: "", relevant: ["B1-*"] },
  { id: "T22", kind: "new-situation", task: "Initech reports a false downtime alert from yesterday. Write the reply to them and a short internal note.", must: ["Notes this is part of a recurring pattern of late or false alerts from eu-west probes reported by many customers"], trap: "", relevant: [C1] },
  { id: "T23", kind: "new-situation", task: "Write this week's short internal update on partnerships.", must: ["Talks with Datadog about listing Beacon on the Datadog marketplace"], trap: "", relevant: ["B2-*"] },
  { id: "T24", kind: "new-situation", task: "Write a short note for customers about alert reliability this month.", must: ["Acknowledges late or false alerts from the eu-west probe region"], trap: "", relevant: [C1] },

  { id: "T25", kind: "control", task: "How long does the canary bake during a production deploy?", must: ["25 minutes"], trap: "", relevant: ["ops/deploy-production.md#Canary"] },
  { id: "T26", kind: "control", task: "Who approves discounts between 10% and 20%?", must: ["The Head of Sales, Daniel Okafor"], trap: "", relevant: ["sales/playbook.md#Discounts"] },
  { id: "T27", kind: "control", task: "How do I check the health of production backups?", must: ["Run `nwctl backups status --env prod`"], trap: "", relevant: ["ops/backups.md#Postgres"] },
  { id: "T28", kind: "control", task: "Which Zoom room do responders use during a SEV1?", must: ["beacon-war-room"], trap: "", relevant: ["ops/incident-response.md#The call"] },
  { id: "T29", kind: "control", task: "How long do we keep raw check results?", must: ["400 days"], trap: "", relevant: ["security/data-retention.md#Customer data"] },
  { id: "T30", kind: "control", task: "What is the base URL of our public API?", must: ["https://api.getbeacon.io/v2/"], trap: "", relevant: ["engineering/api-guidelines.md#Basics"] },
];

// Whether an item is one of a task's relevant items ("B1-*" a prefix, "drift:C1" any eu-west drift item).
export function isRelevant(task, item) {
  return task.relevant.some((r) => (r === C1 ? item.gold === "C1" : r.endsWith("*") ? item.id.startsWith(r.slice(0, -1)) : item.id === r));
}
