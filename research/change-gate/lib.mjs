import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const DATA = join(HERE, "data");
export const CACHE = join(HERE, ".cache");
export const CORPUS = join(HERE, "../../bench/drift/corpus");

// The provider genter itself uses first (src/models.js): AI Gateway, else OpenRouter.
const API = process.env.AI_GATEWAY_TOKEN
  ? { url: "https://ai-gateway.vercel.sh/v1", key: process.env.AI_GATEWAY_TOKEN }
  : { url: "https://openrouter.ai/api/v1", key: process.env.OPENROUTER_API_KEY };
export const EMBEDDING_MODEL = "openai/text-embedding-3-small";

export const usage = { calls: 0, prompt_tokens: 0, completion_tokens: 0, cost: 0, embed_tokens: 0, embed_cost: 0 };

async function post(path, body) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API.url}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API.key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180000),
    }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
    if (res.ok) return res.json();
    if (attempt >= 6 || (res.status && res.status !== 429 && res.status < 500)) throw new Error(`${path} ${res.status} ${(await res.text()).slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
  }
}

// One chat call. Returns { text, usage }.
export async function chat(model, messages, { json = false, temperature = 0, max_tokens = 8000, reasoning } = {}) {
  const data = await post("/chat/completions", {
    model,
    messages,
    temperature,
    max_tokens,
    ...(json && { response_format: { type: "json_object" } }),
    ...(reasoning && { reasoning: { effort: reasoning } }),
  });
  const u = data.usage ?? {};
  usage.calls++;
  usage.prompt_tokens += u.prompt_tokens ?? 0;
  usage.completion_tokens += u.completion_tokens ?? 0;
  usage.cost += u.cost ?? 0;
  return { text: data.choices?.[0]?.message?.content ?? "", usage: u };
}

export const parseJson = (s) => JSON.parse(s.replace(/^```(json)?\s*|\s*```$/g, ""));

// Embeddings with a disk cache keyed by the text: every text is embedded once, in batches of 128.
let cache;
const cacheFile = join(CACHE, "vectors.json");
function loadCache() {
  if (cache) return cache;
  cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, "utf8")) : {};
  return cache;
}
const keyOf = (t) => createHash("sha256").update(`${EMBEDDING_MODEL}\n${t}`).digest("hex").slice(0, 32);
const toB64 = (v) => Buffer.from(new Float32Array(v).buffer).toString("base64");
const fromB64 = (s) => {
  const b = Buffer.from(s, "base64");
  return new Float32Array(b.buffer, b.byteOffset, b.length / 4);
};

export async function embedAll(texts) {
  const c = loadCache();
  const missing = [...new Set(texts.filter((t) => !c[keyOf(t)]))];
  for (let i = 0; i < missing.length; i += 128) {
    const batch = missing.slice(i, i + 128);
    const data = await post("/embeddings", { model: EMBEDDING_MODEL, input: batch });
    usage.embed_tokens += data.usage?.prompt_tokens ?? 0;
    usage.embed_cost += data.usage?.cost ?? 0;
    for (const d of data.data) c[keyOf(batch[d.index])] = toB64(d.embedding);
  }
  if (missing.length) {
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(cacheFile, JSON.stringify(c));
  }
  return texts.map((t) => fromB64(c[keyOf(t)]));
}

// A vector cut to its first dims and normalised again, the way genter keeps them (src/local.js shrink: 256).
export function shrink(v, dims) {
  if (!dims || dims >= v.length) return v;
  const out = v.slice(0, dims);
  let n = 0;
  for (const x of out) n += x * x;
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < out.length; i++) out[i] /= n;
  return out;
}

export function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// Deterministic randomness per seed.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// The corpus as sections: one per "## " heading, each with the page title, the way a reader would quote it.
export function sections() {
  const files = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith(".md") && f !== "README.md") files.push(p);
    }
  };
  walk(CORPUS);
  const out = [];
  for (const p of files.sort()) {
    const file = relative(CORPUS, p);
    const lines = readFileSync(p, "utf8").split("\n");
    const title = lines[0].replace(/^#\s*/, "");
    let cur = { heading: "", body: [] };
    const flush = () => {
      const body = cur.body.join("\n").trim();
      if (body) out.push({ id: `${file}#${cur.heading || "intro"}`, file, heading: cur.heading, text: `# ${title}\n${cur.heading ? `## ${cur.heading}\n` : ""}${body}` });
    };
    for (const line of lines.slice(1)) {
      if (line.startsWith("## ")) {
        flush();
        cur = { heading: line.slice(3).trim(), body: [] };
      } else cur.body.push(line);
    }
    flush();
  }
  return out;
}

export const readData = (name) => JSON.parse(readFileSync(join(DATA, name), "utf8"));
export const writeData = (name, v) => {
  mkdirSync(DATA, { recursive: true });
  writeFileSync(join(DATA, name), `${JSON.stringify(v, null, 1)}\n`);
};

export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k], k);
    }
  }));
  return out;
}
