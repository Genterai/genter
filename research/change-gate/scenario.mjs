// The tests and their gold events, fixed before any detector was written (git history of this folder shows the order).
// One stream per test: 42 days of a fictional company's sources (Northwind Labs, the company of bench/drift).
// Days 0-13 are calibration: detectors may learn from them, nothing there is scored. Days 14-41 are scored.
// A gold event is significant by construction of the scenario, never by what a detector says. Its window is the time
// after its onset within which an alarm counts as detecting it.

export const DAYS = 42;
export const CALIBRATION_DAYS = 14;
export const SEEDS = [1, 2, 3];

export const ACCOUNTS = ["Acme Logistics", "Globex", "Initech", "Umbrella Retail", "Contoso Health", "Fabrikam", "Wayne Freight", "Stark Media", "Hooli Cloud", "Soylent Foods", "Vandelay Imports", "Tyrell Bio"];

// Routine traffic, generated once (gen.mjs) and sampled per stream. n: items to generate.
export const BUCKETS = [
  ["slack", "eng-deploys", "engineers mention routine deploys of Beacon services (beacon-api, probe-runner, alert-router, dashboard), version numbers, canaries passing", 50],
  ["slack", "eng-code-review", "code review requests and comments on pull requests, small refactors, naming debates", 45],
  ["slack", "eng-ci", "flaky tests, CI queue times, a test retried, cache misses in CI", 40],
  ["slack", "eng-oncall-handoff", "quiet on-call handoffs: nothing major, a few low-priority pages, disk usage warnings resolved", 40],
  ["slack", "eng-bugs", "minor bugs: a tooltip typo, a timezone display issue, a CSV export column order, fixed or triaged", 45],
  ["slack", "eng-infra", "cloud cost tweaks, instance right-sizing, Terraform plan reviews, certificate renewals done automatically", 40],
  ["slack", "general-office", "Rotterdam office life: coffee machine, desks, plants, parking, the fridge, the meeting rooms", 40],
  ["slack", "general-hiring", "interviews scheduled, a candidate's take-home, referral reminders, onboarding a new hire", 40],
  ["slack", "general-social", "birthdays, lunch plans, weekend chat, a team outing, a book club", 40],
  ["slack", "product-chatter", "product managers discuss roadmap items already planned: status page themes, SSO improvements, mobile app polish", 40],
  ["slack", "sales-chatter", "sales team banter about the pipeline, demos booked and won/lost small deals, naming the accounts", 40],
  ["slack", "soc2-chatter", "people collecting SOC 2 evidence; the evidence deadline is Dec 15; screenshots of access reviews, policies signed", 30],
  ["email", "customer-questions", "customers of Beacon ask ordinary questions: how to add a monitor, API rate limits, adding teammates; from the named accounts", 50],
  ["email", "renewal-routine", "routine, still-open contract renewal threads with Acme Logistics, Globex and Umbrella Retail: scheduling a renewal call, sending a quote, asking for usage numbers, 'we are reviewing internally'; nothing is decided", 60],
  ["email", "vendor-invoices", "invoices and receipts from vendors: AWS, Hetzner, Figma, Slack, Google Workspace, 1Password", 40],
  ["email", "scheduling", "meeting scheduling back and forth, rescheduling, time zones", 40],
  ["email", "newsletters", "partner and industry newsletters: SRE weekly, a cloud provider's product update, an event invitation", 40],
  ["email", "export-requests", "a single customer asks how to export historical check data, for an audit or their own reporting; different accounts each time", 25],
  ["crm", "deal-updates", "CRM notifications: deal moved to a stage, a note added, next step set, for new-business deals of other prospects", 50],
  ["crm", "usage-reports", "automatic weekly usage reports per account: active monitors, checks run, change week over week mostly within -8% to +8%, occasionally a single account down 20-40% with no other context", 50],
  ["crm", "call-notes", "account managers' short call notes with customers: happy with alerts, asked about a feature, nothing urgent", 45],
  ["tickets", "sso-login", "support tickets about SSO setup, SAML metadata, a user locked out, password resets", 45],
  ["tickets", "alert-config", "how-to questions about configuring alert rules, escalation policies, quiet hours (configuration help, not alerts misbehaving)", 45],
  ["tickets", "billing", "billing questions: invoice address, VAT number, upgrading seats, card expired", 45],
  ["tickets", "integrations", "questions about the Slack, PagerDuty, Opsgenie, Teams and webhook integrations", 45],
  ["tickets", "feature-requests", "feature requests: dark mode for status pages, more check locations, Terraform provider fields", 45],
  ["tickets", "dashboard-perf", "a single customer reports the dashboard feels slow loading a big monitor list once; different accounts each time", 25],
  ["calendar", "customer-meetings", "calendar events with customers: QBRs scheduled, moved, occasionally one cancelled and rebooked; onboarding calls", 45],
  ["calendar", "internal-meetings", "internal calendar events: sprint planning, retro, 1:1s, all-hands, interviews", 45],
];

// The drifting topic of test C: alerts arriving late or firing falsely from one probe region. Absent from BUCKETS.
export const DRIFT_TOPIC = ["tickets", "late-false-alerts", "customers report Beacon alerts arriving several minutes late or firing falsely, mostly from checks run in the eu-west probe region; slack messages of support engineers noticing more of these", 150];

// Test B: a new subject that never appears before its onset.
export const NEW_TOPICS = [
  { id: "B1", day: 20, hours: 60, n: 14, prompt: "A security incident: a Beacon API key with admin scope was found committed in a public GitHub repository of an engineer's side project. Messages across Slack (#security, #incidents), email to affected customers, support tickets from worried customers, a calendar event for the post-incident review. Keys rotated, audit logs checked, no evidence of misuse yet." },
  { id: "B2", day: 32, hours: 36, n: 6, prompt: "A new partnership: Northwind Labs starts talks to list Beacon on the Datadog marketplace. Emails with Datadog's partner team, Slack discussion in #partnerships, a calendar event for the first call, a CRM note." },
];

// Test A: opposite outcomes of contract threads that run as routine in the background (renewal-routine bucket).
export const OPPOSITES = [
  { id: "A1", day: 18, hour: 10, items: [
    ["email", "Hi team, good news from our side: Acme Logistics has signed the renewal. The contract is extended for another 24 months on the Business plan, same terms. Signed copy attached. - Priya, Procurement, Acme Logistics"],
    ["crm", "Opportunity 'Acme Logistics - Renewal 2027' moved to Closed Won. Contract extended 24 months, Business plan. Owner: Sven de Boer."],
  ] },
  { id: "A2", day: 27, hour: 15, items: [
    ["email", "Hello Sven, after our internal review Globex has decided not to renew. Please treat this as our notice of termination: the contract ends at the end of the current term and we will not continue with Beacon. - Mark, IT Director, Globex"],
    ["crm", "Opportunity 'Globex - Renewal 2027' moved to Closed Lost. Reason: customer terminated the contract at the end of term. Owner: Sven de Boer."],
  ] },
  { id: "A3", day: 36, hour: 11, items: [
    ["email", "Hi Sven, following up on the renewal: Umbrella Retail will not be renewing the Beacon contract. We are not extending it. - Lena, Head of Platform, Umbrella Retail"],
    ["crm", "Opportunity 'Umbrella Retail - Renewal 2027' updated: customer will not renew. Owner: Sven de Boer."],
  ] },
];

// Test D: signals in different sources, each of a kind that also occurs alone in the background (decoy buckets),
// that together say one account is leaving. Onset: the third signal.
export const PATTERNS = [
  { id: "D1", account: "Contoso Health", items: [
    [22, 9, "crm", "Weekly usage report - Contoso Health: active monitors 1,412 (-38% week over week), checks run 2.1M (-35%)."],
    [23, 14, "tickets", "Ticket #48211 from Contoso Health: the dashboard feels slow when loading our monitor list, takes about 10 seconds."],
    [24, 11, "email", "Hi Beacon support, Contoso Health here. How can we export all of our historical check data and alert history? We need a full copy."],
    [25, 16, "slack", "heads up: Maria Lopez, our champion at Contoso Health, has left the company, her email bounces now"],
    [26, 10, "calendar", "Cancelled: Contoso Health QBR (Thu 14:00-15:00). Organizer: Sven de Boer."],
  ] },
  { id: "D2", account: "Fabrikam", items: [
    [31, 9, "email", "Reminder: invoice INV-2026-0912 for Fabrikam is 21 days overdue. Amount: EUR 18,400."],
    [32, 13, "tickets", "Ticket #48770 from Fabrikam: how do we downgrade from Business to Starter at the end of the month?"],
    [33, 10, "slack", "fyi on the Fabrikam call they mentioned they are trialing Pingdom in parallel"],
    [34, 15, "crm", "Weekly usage report - Fabrikam: active monitors 640 (-25% week over week), checks run 0.9M (-27%)."],
  ] },
];

// Test F: small edits that change a fact that matters, in documents of bench/drift/corpus, plus one message.
// Background doc edits (gen.mjs) include harmless number changes, so "a number changed" alone is not the answer.
export const CRITICAL = [
  { id: "F1", day: 17, hour: 10, file: "ops/backups.md", find: "Nightly base backup at 01:00 UTC | 35 days", replace: "Nightly base backup at 01:00 UTC | 3 days" },
  { id: "F2", day: 23, hour: 12, file: "security/access-control.md", find: "staging or third-party tools is not allowed.", replace: "staging or third-party tools is allowed." },
  { id: "F3", day: 29, hour: 16, file: "ops/deploy-production.md", find: "Rolling back is always allowed and never needs an approval.", replace: "Rolling back is not allowed and always needs an approval." },
  { id: "F4", day: 35, hour: 9, file: "product/pricing.md", find: "Price changes for existing customers need 60 days' notice by email.", replace: "Price changes for existing customers need 6 days' notice by email." },
  { id: "F5", day: 39, hour: 14, message: ["slack", "Heads-up from compliance: the SOC 2 evidence deadline moved from Dec 15 to Nov 1."] },
];

// Test E: no gold event at all. Every alarm in the scored days is a false alarm. Each kind is reported on its own.
export const NOISE = [
  { id: "E-burst", day: 16, days: 3, what: "three times the usual routine volume (same buckets)" },
  { id: "E-reindex", day: 22, what: "40 document sections re-saved after cosmetic edits (wording, formatting), meaning unchanged" },
  { id: "E-bot", day: 28, what: "60 near-identical deploy notifications from a bot within two hours" },
  { id: "E-lang", day: 34, days: 3, what: "routine messages written in Russian instead of English (same buckets, same meaning)" },
  { id: "E-backfill", day: 39, what: "a new source (an old Notion wiki) connected: 120 historical routine pages arrive at once" },
];

// Windows, in hours after onset, within which an alarm detects the event.
export const WINDOW_HOURS = { A: 24, B: 48, C: 24 * 18, D: 96, F: 24 };

// Test C: drifting items per weekday from day 14, rising linearly to RAMP_MAX on day 41. The onset is the first day
// with at least 3 drifting items a day (about 10% of a weekday's traffic), fixed here: day 23.
export const RAMP_START = 14;
export const RAMP_MAX = 9;
export const C_ONSET_DAY = 23;
