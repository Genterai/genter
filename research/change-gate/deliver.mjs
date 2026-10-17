// Passive or active delivery of verified signals: node research/change-gate/deliver.mjs [arm]
// Reads results/verified-subscribed.json (signals with "for": the subscribers they bear on, access already enforced).
// Three ways a subscriber can get a signal:
//   passive  it is shown next to search results, so the agent sees it only when one of its own queries reaches an
//            anchor the signal is about (probability HIT per session, an assumption stated in the report);
//   inbox    the agent asks Genter's MCP for its new signals when a session starts (one cheap call per session);
//   push     Genter wakes the agent when the signal is made (a webhook or a new session per signal).
// And three ways a subscriber works: always-on (a session every business hour), daily (09:00 on weekdays),
// on-demand (when a person asks it something: about 3 times a week, at random business hours).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildStream } from "./build.mjs";
import { HERE, rng } from "./lib.mjs";
import { CALIBRATION_DAYS, DAYS } from "./scenario.mjs";
import { ROUTES, SUBSCRIBERS } from "./subscribers.mjs";

const ARM = process.argv[2] || "gate";
const HIT = 0.25;
const WEEKS = (DAYS - CALIBRATION_DAYS) / 7;
const weekend = (d) => d % 7 === 5 || d % 7 === 6;

function sessions(kind, rand) {
  const out = [];
  for (let d = 0; d < DAYS + 14; d++) {
    if (weekend(d)) continue;
    if (kind === "always-on") for (let h = 8; h <= 19; h++) out.push(d * 24 + h);
    if (kind === "daily") out.push(d * 24 + 9);
    if (kind === "on-demand") if (rand() < 3 / 5) out.push(d * 24 + 9 + rand() * 9);
  }
  return out.sort((a, b) => a - b);
}

const rows = JSON.parse(readFileSync(join(HERE, "results", "verified-subscribed.json"), "utf8")).filter((r) => r.arm === ARM);
const result = {};
for (const kind of ["always-on", "daily", "on-demand"]) {
  for (const mode of ["passive", "inbox", "push"]) {
    const ev = [];
    let noise = 0;
    let wakes = 0;
    let sessionsCount = 0;
    for (const r of rows) {
      const stream = buildStream(r.test, r.seed);
      const rand = rng(r.seed * 7 + kind.length);
      const sched = Object.fromEntries(SUBSCRIBERS.map((a) => [a.id, sessions(kind, rand)]));
      for (const a of SUBSCRIBERS) sessionsCount += sched[a.id].filter((t) => t >= stream.scoredFrom && t < DAYS * 24).length;
      // When a subscriber gets each signal.
      const got = [];
      for (const s of r.signals) for (const id of s.for) {
        let at = null;
        if (mode === "push") at = s.t;
        else for (const t of sched[id]) {
          if (t < s.t) continue;
          if (mode === "inbox" || rand() < HIT) {
            at = t;
            break;
          }
        }
        const gold = stream.gold.find((g) => s.t >= g.onset && s.t <= g.onset + g.window && s.evidence.some((e) => g.items.includes(e)));
        const right = gold && ROUTES[gold.id].includes(id);
        if (!right) noise++;
        if (mode === "push") wakes++;
        got.push({ id, at, gold: right ? gold : null });
      }
      for (const g of stream.gold) for (const id of ROUTES[g.id]) {
        const first = got.filter((x) => x.gold === g && x.id === id && x.at != null).sort((a, b) => a.at - b.at)[0];
        ev.push({ event: g.id, subscriber: id, latency: first ? first.at - g.onset : null, inWindow: first ? first.at <= g.onset + g.window : false });
      }
    }
    const lat = ev.map((e) => e.latency).filter((x) => x != null).sort((a, b) => a - b);
    result[`${kind}/${mode}`] = {
      eventsReachedRightAgent: `${ev.filter((e) => e.latency != null).length}/${ev.length}`,
      inEventWindow: +(ev.filter((e) => e.inWindow).length / ev.length).toFixed(2),
      medianLatencyH: lat.length ? +lat[Math.floor((lat.length - 1) / 2)].toFixed(1) : null,
      p90LatencyH: lat.length ? +lat[Math.floor((lat.length - 1) * 0.9)].toFixed(1) : null,
      noiseSignalsPerAgentWeek: +(noise / rows.length / SUBSCRIBERS.length / WEEKS).toFixed(2),
      extraAgentWakesPerAgentWeek: +(wakes / rows.length / SUBSCRIBERS.length / WEEKS).toFixed(2),
      inboxCallsPerAgentWeek: mode === "inbox" ? +(sessionsCount / rows.length / SUBSCRIBERS.length / WEEKS).toFixed(1) : 0,
    };
  }
}
writeFileSync(join(HERE, "results", `delivery-${ARM}.json`), `${JSON.stringify(result, null, 1)}\n`);
console.log(`| subscriber works | delivery | gold events reaching the right agent | within the event's window | median latency, h | p90, h | noise signals / agent / week | extra agent wakes / agent / week |`);
console.log("|--|--|--|--|--|--|--|--|");
for (const [k, v] of Object.entries(result)) console.log(`| ${k.replace("/", " | ")} | ${v.eventsReachedRightAgent} | ${Math.round(v.inEventWindow * 100)}% | ${v.medianLatencyH ?? "—"} | ${v.p90LatencyH ?? "—"} | ${v.noiseSignalsPerAgentWeek} | ${v.extraAgentWakesPerAgentWeek} |`);
