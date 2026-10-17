// External agents that consume Genter's signals: what each is working on (its own words, not Genter's) and which
// sources it may see. Fixed before the verification and delivery runs, with the gold routing of every event.
export const SUBSCRIBERS = [
  { id: "accounts", task: "Tracks the state of customer accounts and their contracts: renewals, terminations, churn risk, payment problems, changes in a customer's usage.", access: ["email", "crm", "tickets", "calendar", "slack"] },
  { id: "security", task: "Watches security and compliance: incidents, leaked credentials, access-control rules, how customer data may be handled, audit deadlines.", access: ["slack", "email", "tickets", "docs", "calendar"] },
  { id: "reliability", task: "Watches the reliability of the Beacon service: alert delivery quality, probe regions, deploy and rollback procedures, backups.", access: ["slack", "tickets", "docs"] },
  { id: "partnerships", task: "Tracks partnerships and integrations with other vendors and marketplaces.", access: ["email", "slack", "crm", "calendar"] },
  { id: "pricing", task: "Tracks prices, plans and the rules for changing them.", access: ["docs", "email", "crm"] },
];

// Which subscriber each gold event is for. A signal of the event delivered to another one is noise for that one.
export const ROUTES = {
  A1: ["accounts"], A2: ["accounts"], A3: ["accounts"],
  B1: ["security"], B2: ["partnerships"],
  C1: ["reliability"],
  D1: ["accounts"], D2: ["accounts"],
  F1: ["reliability"], F2: ["security"], F3: ["reliability"], F4: ["pricing"], F5: ["security"],
};
