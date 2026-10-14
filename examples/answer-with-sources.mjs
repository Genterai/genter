// A docs assistant in 40 lines: Genter finds the passages that answer, read now, and a model answers from them,
// citing [1], [2] with the file and lines each one came from. No package besides genter-cli.
//
//   npm i genter-cli
//   export OPENAI_API_KEY=sk-...        # embeddings and the answer; any OpenAI-compatible API works (below)
//   node answer-with-sources.mjs ./docs "how do we deploy to staging?"
//
// Other providers: OPENAI_BASE_URL and MODEL for the answer; OPENROUTER_API_KEY, AI_GATEWAY_API_KEY, Ollama or
// GENTER_EMBED_URL for the embeddings (genter-cli's README, "Ranking by meaning").
import { createLocal, embedderFor, embeddingProvider } from "genter-cli/local";

const [folder = ".", ...words] = process.argv.slice(2);
const question = words.join(" ") || "how do we deploy?";

// Rank by meaning too: questions in other words or another language still find the passage.
const genter = createLocal({ embed: embedderFor(embeddingProvider()) });
await genter.add(folder);
const { results, changes, semantic } = await genter.find(question, { limit: 5 });
if (semantic !== true) console.error(`(ranking by words only: ${semantic || "no embeddings"})`);
if (!results.length) {
  console.log(`Nothing in ${folder} answers "${question}".`);
  process.exit(0);
}

// The passages go to the model with where each is written; what changed since the last look is said too.
const context = results.map((r) => `[${r.ref}] ${r.place}${r.facts.length ? ` (${r.facts.join("; ")})` : ""}\n${r.text}`).join("\n\n");
const res = await fetch(`${process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"}/chat/completions`, {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model: process.env.MODEL ?? "gpt-5-mini",
    messages: [
      { role: "system", content: "Answer only from the passages. Cite each fact as [n]. If they do not answer, say so." },
      { role: "user", content: `Passages, read just now:\n\n${context}\n\nQuestion: ${question}` },
    ],
  }),
});
if (!res.ok) throw new Error(`The model answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
const { choices } = await res.json();

console.log(choices[0].message.content.trim());
console.log(`\n${results.map((r) => `[${r.ref}] ${r.place}`).join("\n")}`);
if (changes.length) console.log(`\nChanged since the last look: ${changes.map((c) => `${c.place} (${c.event})`).join(", ")}`);
