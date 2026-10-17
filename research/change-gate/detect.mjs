// The detectors, and the replay that feeds them hour by hour. Every detector sees only what has arrived so far.
// Parameters are fixed here, before the first run, from textbook defaults; run.mjs --sweep varies them afterwards.
import { ACCOUNTS } from "./scenario.mjs";
import { dot, rng } from "./lib.mjs";

export const PARAMS = {
  k: 5, // neighbours of the kNN nonconformity score
  alphaItem: 0.002, // knn-novelty: conformal p-value of one item
  alphaCandidate: 0.05, // an item this unusual is a candidate for a new cluster, and counts as a local anomaly
  clusterMin: 3, // candidates that make a new cluster
  clusterHours: 72,
  alphaWindow: 0.02, // window statistics (centroid, mmd-calibrated) against their own history
  martingaleEps: 0.5,
  martingaleFire: 100, // Ville: under no change, P(ever >= 100) <= 1/100 per run of the martingale
  windowHours: 24,
  refDays: 14,
  everyHours: 6,
  entityDays: 7,
};

const NEGATION = new Set(["not", "no", "never", "none", "cannot", "can't", "without", "allowed", "forbidden", "must", "may", "always", "only", "except", "unless", "nobody"]);
const tokens = (s) => s.toLowerCase().match(/[a-z]+(?:'[a-z]+)?|\d+(?:[.,]\d+)*/g) ?? [];

function multisetDiff(a, b) {
  const m = new Map();
  for (const t of a) m.set(t, (m.get(t) ?? 0) + 1);
  for (const t of b) m.set(t, (m.get(t) ?? 0) - 1);
  return [...m].filter(([, n]) => n !== 0).map(([t]) => t);
}

const ALIASES = ACCOUNTS.map((a) => [a, new RegExp(`\\b(${[a, a.split(" ")[0]].map((x) => x.replace(/ /g, "\\s+")).join("|")})\\b`, "i")]);
export const accountsOf = (text) => ALIASES.filter(([, re]) => re.test(text)).map(([a]) => a);

const conformalP = (history, s) => {
  let ge = 0;
  for (const x of history) if (x >= s) ge++;
  return (ge + 1) / (history.length + 1);
};

function mean(vs) {
  const m = new Float32Array(vs[0].length);
  for (const v of vs) for (let i = 0; i < m.length; i++) m[i] += v[i];
  let n = 0;
  for (const x of m) n += x * x;
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < m.length; i++) m[i] /= n;
  return m;
}

function binomTail(n, k, p) {
  // P(X >= k), X ~ Bin(n, p)
  let s = 0;
  let c = 1;
  for (let i = 0; i <= n; i++) {
    if (i > 0) c = (c * (n - i + 1)) / i;
    if (i >= k) s += c * p ** i * (1 - p) ** (n - i);
  }
  return Math.min(1, s);
}

// Unbiased MMD^2 with an RBF kernel on unit vectors; bandwidth by the median heuristic; permutation p-value.
function mmd(X, Y, rand, perms = 100) {
  const Z = [...X, ...Y];
  const n = Z.length;
  const D = new Float64Array(n * n);
  const all = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const d = Math.max(0, 2 - 2 * dot(Z[i], Z[j]));
    D[i * n + j] = D[j * n + i] = d;
    all.push(d);
  }
  all.sort((a, b) => a - b);
  const sigma2 = all[Math.floor(all.length / 2)] || 1;
  const K = D.map((d) => Math.exp(-d / sigma2));
  const stat = (idx) => {
    const m = X.length;
    let xx = 0;
    let yy = 0;
    let xy = 0;
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      if (a === b) continue;
      const k = K[idx[a] * n + idx[b]];
      if (a < m && b < m) xx += k;
      else if (a >= m && b >= m) yy += k;
      else xy += k;
    }
    const q = n - m;
    return xx / (m * (m - 1)) + yy / (q * (q - 1)) - xy / (m * q);
  };
  const base = [...Array(n).keys()];
  const s0 = stat(base);
  let ge = 0;
  for (let p = 0; p < perms; p++) {
    const idx = [...base];
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    if (stat(idx) >= s0) ge++;
  }
  // Witness of each recent item: mean kernel to the recent window minus mean kernel to the reference.
  const witness = X.map((_, a) => {
    let wx = 0;
    let wy = 0;
    for (let b = 0; b < n; b++) if (b !== a) (b < X.length ? (wx += K[a * n + b]) : (wy += K[a * n + b]));
    return wx / (X.length - 1) - wy / Y.length;
  });
  return { stat: s0, p: (ge + 1) / (perms + 1), witness };
}

// The detectors. Each: { name, onItem?(item, ctx), onHour?(h, ctx) } returning alarms { evidence: [ids], score? }.
export function makeDetectors(P = PARAMS) {
  const D = [];

  D.push({ name: "every-batch", onHour: (h, c) => (c.batch.length ? [{ evidence: c.batch.map((x) => x.id) }] : []) });

  D.push({ name: "daily-digest", onHour: (h, c) => {
    if (h % 24 !== 18) return [];
    const day = c.since(h - 24);
    return day.length ? [{ evidence: day.map((x) => x.id) }] : [];
  } });

  D.push({ name: "knn-novelty", onItem: (x) => (x.p <= P.alphaItem ? [{ evidence: [x.id], score: x.ncm }] : []) });

  {
    const candidates = [];
    const clusters = []; // { centroid, size, firedAt }
    D.push({ name: "novel-cluster", onItem: (x, c) => {
      if (x.p > P.alphaCandidate) return [];
      const tau = c.tau();
      const known = clusters.find((k) => dot(k.centroid, x.vec) >= tau);
      if (known) {
        known.members.push(x);
        known.centroid = mean(known.members.map((m) => m.vec));
        if (known.members.length >= known.firedAt * 2) {
          known.firedAt = known.members.length;
          return [{ evidence: known.members.slice(-known.firedAt / 2).map((m) => m.id) }];
        }
        return [];
      }
      while (candidates.length && candidates[0].t < x.t - P.clusterHours) candidates.shift();
      const group = [...candidates.filter((y) => dot(y.vec, x.vec) >= tau), x];
      candidates.push(x);
      if (group.length < P.clusterMin) return [];
      for (const g of group) candidates.splice(candidates.indexOf(g), 1);
      clusters.push({ members: group, centroid: mean(group.map((g) => g.vec)), firedAt: group.length });
      return [{ evidence: group.map((g) => g.id) }];
    } });
  }

  {
    let logS = 0;
    let since = [];
    D.push({ name: "martingale", onItem: (x) => {
      logS = Math.max(0, logS + Math.log(P.martingaleEps) + (P.martingaleEps - 1) * Math.log(x.p));
      if (logS === 0) since = [];
      else since.push(x);
      if (logS < Math.log(P.martingaleFire)) return [];
      const ev = since.filter((y) => y.p <= P.alphaCandidate).sort((a, b) => a.p - b.p).slice(0, 10);
      logS = 0;
      since = [];
      return [{ evidence: ev.map((y) => y.id) }];
    } });
  }

  D.push({ name: "anomaly-rate", onHour: (h, c) => {
    if (h % P.everyHours !== 0) return [];
    const recent = c.since(h - P.windowHours);
    const odd = recent.filter((x) => x.p <= P.alphaCandidate);
    if (recent.length < 5 || binomTail(recent.length, odd.length, P.alphaCandidate) > 0.001) return [];
    return [{ evidence: odd.map((x) => x.id) }];
  } });

  {
    const history = [];
    D.push({ name: "centroid-shift", onHour: (h, c) => {
      if (h % P.everyHours !== 0) return [];
      const recent = c.since(h - P.windowHours);
      const ref = c.between(h - 24 * (P.refDays + 1), h - P.windowHours);
      if (recent.length < 5 || ref.length < 20) return [];
      const mr = mean(recent.map((x) => x.vec));
      const mf = mean(ref.map((x) => x.vec));
      const s = 1 - dot(mr, mf);
      const p = history.length >= 49 ? conformalP(history, s) : 1;
      history.push(s);
      if (p > P.alphaWindow) return [];
      const dir = mr.map((v, i) => v - mf[i]);
      return [{ evidence: [...recent].sort((a, b) => dot(b.vec, dir) - dot(a.vec, dir)).slice(0, 8).map((x) => x.id), score: s }];
    } });
  }

  for (const calibrated of [false, true]) {
    const history = [];
    const rand = rng(99);
    D.push({ name: calibrated ? "mmd-calibrated" : "mmd-perm", onHour: (h, c) => {
      if (h % P.everyHours !== 0) return [];
      const recent = c.since(h - P.windowHours).slice(-60);
      const refAll = c.between(h - 24 * (P.refDays + 1), h - P.windowHours);
      if (recent.length < 5 || refAll.length < 20) return [];
      const ref = refAll.length > 150 ? refAll.filter((_, i) => i % Math.ceil(refAll.length / 150) === 0) : refAll;
      const r = mmd(recent.map((x) => x.vec), ref.map((x) => x.vec), rand, calibrated ? 0 : 100);
      let fire;
      if (calibrated) {
        fire = history.length >= 49 && conformalP(history, r.stat) <= P.alphaWindow;
        history.push(r.stat);
      } else fire = r.p <= 0.01;
      if (!fire) return [];
      const order = recent.map((x, i) => [x, r.witness[i]]).sort((a, b) => b[1] - a[1]);
      return [{ evidence: order.slice(0, 8).map(([x]) => x.id), score: r.stat }];
    } });
  }

  {
    const history = [];
    D.push({ name: "anchor-delta", onItem: (x) => {
      if (x.kind !== "edit") return [];
      const d = 1 - dot(x.oldVec, x.vec);
      const fire = history.length >= 10 && d > Math.max(...history);
      history.push(d);
      return fire ? [{ evidence: [x.id], score: d }] : [];
    } });
  }

  D.push({ name: "lexical-diff", onItem: (x) => {
    if (x.kind !== "edit") return [];
    const changed = multisetDiff(tokens(x.old), tokens(x.text));
    return changed.some((t) => NEGATION.has(t) || /\d/.test(t)) ? [{ evidence: [x.id] }] : [];
  } });

  {
    const maxSeen = new Map();
    D.push({ name: "entity-sources", onItem: (x, c) => {
      const out = [];
      for (const a of accountsOf(x.text)) {
        const recent = [...c.since(x.t - 24 * P.entityDays), x].filter((y) => y.accounts?.includes(a));
        const n = new Set(recent.map((y) => y.source)).size;
        const prev = maxSeen.get(a) ?? 0;
        maxSeen.set(a, Math.max(prev, n));
        if (n >= 3 && n > prev) out.push({ evidence: [...new Set(recent.map((y) => y.id))] });
      }
      return out;
    } });
  }

  // Added after the first run (post hoc), when the declared detectors above turned out to need a novel item first:
  // a cluster forming among items that are each unremarkable. For a new item, the share of recent items (48 h) in
  // its neighbourhood against the share of the reference (14 days before), Poisson tail, volume-normalised.
  {
    const bursts = [];
    D.push({ name: "neighbourhood-burst", posthoc: true, onItem: (x, c) => {
      const tau = c.tau();
      const recent = c.since(x.t - 48);
      const ref = c.between(x.t - 48 - 24 * P.refDays, x.t - 48);
      if (ref.length < 50 || recent.length < 5) return [];
      const near = recent.filter((y) => dot(y.vec, x.vec) >= tau);
      if (near.length < P.clusterMin - 1) return [];
      const refNear = ref.filter((y) => dot(y.vec, x.vec) >= tau).length;
      const lambda = ((refNear + 0.5) / ref.length) * (recent.length + 1);
      const k = near.length + 1;
      if (poissonTail(k, lambda) > 1e-4) return [];
      const known = bursts.find((b) => b.t > x.t - 72 && dot(b.centroid, x.vec) >= tau);
      if (known && k < known.k * 2) return [];
      const members = [...near, x];
      bursts.push({ t: x.t, k, centroid: mean(members.map((m) => m.vec)) });
      return [{ evidence: members.map((m) => m.id) }];
    } });
  }

  // Also post hoc: kNN novelty against the item's own source only (the literature's advice for mixed streams).
  D.push({ name: "knn-novelty-source", posthoc: true, onItem: (x) => (x.pSource <= P.alphaItem ? [{ evidence: [x.id], score: x.ncmSource }] : []) });

  return D;
}

function poissonTail(k, lambda) {
  // P(X >= k), X ~ Poisson(lambda)
  let term = Math.exp(-lambda);
  let cdf = term;
  for (let i = 1; i < k; i++) {
    term *= lambda / i;
    cdf += term;
  }
  return Math.max(0, 1 - cdf);
}

// A hybrid declared before the first run: one per hour when any of its parts fires, the evidence of all of them.
export const HYBRID = { name: "hybrid", parts: ["novel-cluster", "martingale", "lexical-diff", "entity-sources"] };

// Replays a stream: hour by hour, each item scored against everything known before it, then added to what is known.
// vectors: Map text -> Float32Array (already cut to the dims under test).
export function replay(stream, vectors, P = PARAMS) {
  const detectors = makeDetectors(P);
  const known = new Map(); // id (section id for documents) -> { vec, t, ... }
  for (const s of stream.initial) known.set(s.id, { id: s.id, vec: vectors.get(s.text), t: -1, kind: "doc" });
  const seen = []; // arrived items with features, in order
  const ncmHistory = [];
  const ncmBySource = {};
  const nn1History = [];
  let tauCache = null;
  const ctx = {
    batch: [],
    since: (t) => {
      const out = [];
      for (let i = seen.length - 1; i >= 0 && seen[i].t > t; i--) out.push(seen[i]);
      return out.reverse();
    },
    between: (a, b) => seen.filter((x) => x.t > a && x.t <= b),
    tau: () => {
      if (tauCache) return tauCache;
      const s = [...nn1History].sort((a, b) => a - b);
      tauCache = s[Math.floor(s.length / 2)] ?? 0.9;
      return tauCache;
    },
  };
  const alarms = Object.fromEntries(detectors.map((d) => [d.name, []]));
  const ms = Object.fromEntries(detectors.map((d) => [d.name, 0]));
  let featureMs = 0;
  const end = Math.ceil(Math.max(...stream.items.map((x) => x.t))) + 1;
  let i = 0;
  for (let h = 0; h <= end; h++) {
    const batch = [];
    while (i < stream.items.length && stream.items[i].t < h + 1) {
      const it = stream.items[i++];
      const t0 = performance.now();
      const vec = vectors.get(it.text);
      const sims = [];
      for (const [id, k] of known) if (id !== it.section) sims.push(dot(vec, k.vec));
      sims.sort((a, b) => b - a);
      const top = sims.slice(0, P.k);
      const ncm = 1 - top.reduce((a, b) => a + b, 0) / top.length;
      const src = it.kind === "edit" ? "docs" : it.source;
      const own = [];
      for (const [id, k] of known) if (id !== it.section && (k.source ?? "docs") === src) own.push(dot(vec, k.vec));
      own.sort((a, b) => b - a);
      const ownTop = own.slice(0, P.k);
      const ncmSource = ownTop.length ? 1 - ownTop.reduce((a, b) => a + b, 0) / ownTop.length : 1;
      const hist = (ncmBySource[src] ??= []);
      const x = { ...it, vec, oldVec: it.old ? vectors.get(it.old) : null, ncm, p: conformalP(ncmHistory, ncm), ncmSource, pSource: conformalP(hist, ncmSource), accounts: accountsOf(it.text) };
      hist.push(ncmSource);
      ncmHistory.push(ncm);
      nn1History.push(top[0]);
      tauCache = null;
      featureMs += performance.now() - t0;
      for (const d of detectors) {
        if (!d.onItem) continue;
        const t1 = performance.now();
        for (const a of d.onItem(x, ctx)) alarms[d.name].push({ ...a, t: h + 1 });
        ms[d.name] += performance.now() - t1;
      }
      known.set(it.kind === "edit" ? it.section : it.id, { id: it.id, vec, t: it.t, source: src });
      seen.push(x);
      batch.push(x);
    }
    ctx.batch = batch;
    for (const d of detectors) {
      if (!d.onHour) continue;
      const t1 = performance.now();
      for (const a of d.onHour(h + 1, ctx)) alarms[d.name].push({ ...a, t: h + 1 });
      ms[d.name] += performance.now() - t1;
    }
  }
  // One activation per hour per detector: alarms of the same hour are merged.
  const merged = {};
  for (const [name, list] of Object.entries(alarms)) {
    const byHour = new Map();
    for (const a of list) {
      const m = byHour.get(a.t) ?? { t: a.t, evidence: [] };
      m.evidence = [...new Set([...m.evidence, ...a.evidence])];
      byHour.set(a.t, m);
    }
    merged[name] = [...byHour.values()];
  }
  const hy = new Map();
  for (const part of HYBRID.parts) for (const a of merged[part]) {
    const m = hy.get(a.t) ?? { t: a.t, evidence: [], parts: [] };
    m.evidence = [...new Set([...m.evidence, ...a.evidence])];
    m.parts.push(part);
    hy.set(a.t, m);
  }
  merged[HYBRID.name] = [...hy.values()].sort((a, b) => a.t - b.t);
  ms[HYBRID.name] = HYBRID.parts.reduce((s, p) => s + ms[p], 0);
  return { alarms: merged, ms, featureMs, items: seen };
}
