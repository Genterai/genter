// Genter's MCP contract as a check any server can run, with no package: two read-only tools, search {query, limit} and
// read {ids}; search answers with numbered places, each "[id] title", then a line that says where it is, then its marks
// (⚠) in Genter's format, then what matched, of which no line reads as a mark; read reads a returned id under the same
// header, and refuses an id that is no place with a plain message. "Works with Genter" means passing it. Genter's own
// tests run it against `genter mcp` over stdio.
//
//   import { conformance } from "genter-cli/conformance";
//   const report = await conformance(send, { query: "how do we deploy?" });
//   if (!report.ok) console.error(report.checks.filter((c) => !c.ok));
//
// send(request) takes one JSON-RPC request (an object) and resolves to its response (an object); for a notification
// (no id) what it resolves to is not read.

// The marks with a fixed form: a place replaced by another, and the two sides of a contradiction. Any other mark (a
// source not checked lately, a place old beside newer ones) is free text after "⚠ ".
export const MARKS = {
  superseded: /^⚠ superseded by \[(\d+)\] on (\d{4}-\d{2}-\d{2}): “.+”$/,
  contradictedBy: /^⚠ contradicted by \[(\d+)\] \((\d{4}-\d{2}-\d{2})\): “.+”$/,
  contradicts: /^⚠ contradicts \[(\d+)\] \((\d{4}-\d{2}-\d{2})\): “.+”$/,
};
const FIXED = [
  [/^⚠ superseded by\b/, MARKS.superseded],
  [/^⚠ contradicted by\b/, MARKS.contradictedBy],
  [/^⚠ contradicts\b/, MARKS.contradicts],
];

// The places of a search answer: [{ id, title, meta, marks, lines, posing }]. A place starts at a line "[id] title" (no
// indent); what comes before the first one (what changed since the last look, a notice) belongs to none. Its marks are
// the lines right after its second line that start with ⚠ (less than four spaces in), up to the first that does not: a
// line of the passage after them is never one. posing: the lines after them that would read as a mark all the same.
const MARKISH = /^ {0,3}⚠/;
export function places(text) {
  const out = [];
  for (const line of String(text ?? "").split("\n")) {
    const head = /^\[(\d+)\] (\S.*)$/.exec(line);
    if (head) out.push({ id: Number(head[1]), title: head[2], lines: [] });
    else out.at(-1)?.lines.push(line);
  }
  return out.map((p) => {
    const rest = p.lines.slice(1);
    const n = rest.findIndex((l) => !MARKISH.test(l));
    const marks = n < 0 ? rest : rest.slice(0, n);
    return { ...p, meta: p.lines[0] ?? "", marks, posing: rest.slice(marks.length).filter((l) => MARKISH.test(l)) };
  });
}

// Whether a mark line is in Genter's format: "  ⚠ " then free text, or one of the fixed forms exactly. "" when it is.
export function markProblem(line) {
  if (!/^ {2}⚠ \S/.test(line)) return `a mark is a line of its own that starts with two spaces and "⚠ ": ${JSON.stringify(line)}`;
  const mark = line.slice(2);
  for (const [kind, form] of FIXED) if (kind.test(mark) && !form.test(mark)) return `not in the form ${form}: ${JSON.stringify(line)}`;
  return "";
}

const NUMBER = ["number", "integer"];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const textOf = (res) => (res?.result?.content ?? []).filter((c) => c?.type === "text").map((c) => c.text).join("\n");
const startsPlace = (text, id) => new RegExp(`^\\[${id}\\] \\S`, "m").test(text);

// Runs every check: { ok, checks: [{ name, ok, detail? }], ids }. query: a question the server has an answer to.
// mark: true when the answer to query holds a place superseded by another (the check then wants one, and reads it).
// unknownId: a number no place has.
export async function conformance(send, { query, mark = false, unknownId = 987_654_321, limit = 5 } = {}) {
  if (typeof send !== "function") throw new TypeError("conformance(send): send(request) resolves to the JSON-RPC response");
  if (!query || typeof query !== "string") throw new TypeError("conformance(send, { query }): a question the server has an answer to");
  const checks = [];
  let n = 0;
  const rpc = async (method, params) => {
    try {
      return await send({ jsonrpc: "2.0", id: `conformance-${++n}`, method, ...(params && { params }) });
    } catch (e) {
      return { error: { code: "send", message: e.message } };
    }
  };
  const call = (name, args) => rpc("tools/call", { name, arguments: args });
  const check = (name, problems) => {
    const list = problems.filter(Boolean);
    checks.push({ name, ok: list.length === 0, ...(list.length && { detail: list.join("; ") }) });
    return list.length === 0;
  };
  const isTool = (res) => (res?.error ? `a JSON-RPC error instead of a tool result: ${JSON.stringify(res.error)}` : !res?.result ? "no result" : "");

  const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "genter-conformance", version: "1" } });
  check("initialize answers with a protocol version, the server's name and tools", [
    isTool(init),
    typeof init?.result?.protocolVersion !== "string" && "no protocolVersion",
    typeof init?.result?.serverInfo?.name !== "string" && "no serverInfo.name",
    !init?.result?.capabilities?.tools && "no capabilities.tools",
  ]);
  try {
    await send({ jsonrpc: "2.0", method: "notifications/initialized" });
  } catch {}

  const list = await rpc("tools/list");
  const tools = Array.isArray(list?.result?.tools) ? list.result.tools : [];
  const tool = (name) => tools.find((t) => t?.name === name);
  const search = tool("search");
  const read = tool("read");
  check("tools/list has search and read", [isTool(list), !search && "no search tool", !read && "no read tool"]);
  const readOnly = (t) => [typeof t?.title !== "string" || !t.title.trim() ? "no title" : "", t?.annotations?.readOnlyHint !== true && "annotations.readOnlyHint is not true", t?.inputSchema?.type !== "object" && 'inputSchema.type is not "object"'];
  const sp = search?.inputSchema?.properties ?? {};
  check("search {query, limit}: a title, read-only, query a required string, limit a number", [
    !search && "no search tool",
    ...readOnly(search),
    sp.query?.type !== "string" && "query is not a string",
    !NUMBER.includes(sp.limit?.type) && "limit is not a number",
    !same(search?.inputSchema?.required, ["query"]) && 'required is not ["query"]',
  ]);
  const ids = read?.inputSchema?.properties?.ids;
  check("read {ids}: a title, read-only, ids a required array of numbers", [
    !read && "no read tool",
    ...readOnly(read),
    ids?.type !== "array" && "ids is not an array",
    !NUMBER.includes(ids?.items?.type) && "ids' items are not numbers",
    !same(read?.inputSchema?.required, ["ids"]) && 'required is not ["ids"]',
  ]);

  const found = await call("search", { query, limit });
  const text = textOf(found);
  const got = places(text);
  check("search answers with numbered places, each with a second line that says where it is", [
    isTool(found),
    found?.result?.isError && `a tool error: ${text}`,
    !got.length && `no line "[id] title" in: ${JSON.stringify(text.slice(0, 300))}`,
    ...got.map((p) => (!Number.isSafeInteger(p.id) || p.id < 1 ? `[${p.id}] is not a positive whole number` : "")),
    ...got.map((p) => (!/^ {2}\S/.test(p.meta) ? `[${p.id}] has no second line, indented, that says where it is` : "")),
  ]);
  const marks = got.flatMap((p) => p.marks);
  const superseded = marks.map((l) => MARKS.superseded.exec(l.slice(2))).filter(Boolean);
  check("search's marks are in Genter's format, and no line after them reads as one", [
    ...marks.map(markProblem),
    ...got.flatMap((p) => p.posing.map((l) => `[${p.id}] has a line after its marks that reads as a mark (a passage sits deeper): ${JSON.stringify(l)}`)),
    mark && !superseded.length && `no "⚠ superseded by [id] on <day>: “…”" for ${JSON.stringify(query)}`,
  ]);

  const empty = await call("search", {});
  check("search without a query is a tool error, not a JSON-RPC error", [isTool(empty), empty?.result?.isError !== true && "isError is not true"]);

  const returned = [...new Set(got.map((p) => p.id))];
  if (returned.length) {
    const one = await call("read", { ids: [returned[0]] });
    check("read reads a returned id under its header", [isTool(one), one?.result?.isError && `a tool error: ${textOf(one)}`, !startsPlace(textOf(one), returned[0]) && `no line "[${returned[0]}] …"`]);
  }
  if (returned.length > 1) {
    const two = await call("read", { ids: returned.slice(0, 2) });
    check("read reads several ids in one call", [isTool(two), ...returned.slice(0, 2).map((id) => !startsPlace(textOf(two), id) && `no line "[${id}] …"`)]);
  }
  if (superseded.length) {
    const by = Number(superseded[0][1]);
    const res = await call("read", { ids: [by] });
    check("the place a mark names reads by its id", [isTool(res), !startsPlace(textOf(res), by) && `no line "[${by}] …"`]);
  }
  const unknown = await call("read", { ids: [unknownId] });
  const refusal = textOf(unknown);
  check("read refuses an id that is no place, with a plain message", [isTool(unknown), !refusal.trim() && "no message", startsPlace(refusal, unknownId) && `it answers [${unknownId}] as a place`]);
  const none = await call("read", {});
  check("read without ids is a tool error, not a JSON-RPC error", [isTool(none), none?.result?.isError !== true && "isError is not true"]);

  const nope = await call("genter-conformance-no-such-tool", {});
  check("an unknown tool is the JSON-RPC error -32602", [nope?.error?.code !== -32602 && `got ${JSON.stringify(nope?.error ?? nope?.result)}`]);

  return { ok: checks.every((c) => c.ok), checks, ids: returned };
}
