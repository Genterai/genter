import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { classifyFailure } from "./anchor.js";
import { publicFetch, textOf } from "./net.js";
import { cipher } from "./seal.js";

// Vendors' MCP servers (Notion, Linear, Atlassian, ...) added by address as a source of a project (local.js). Genter is
// their client over Streamable HTTP and signs in as MCP's authorization spec says: the server's protected resource
// metadata names its authorization server, whose metadata says where to register, sign in and get tokens; Genter
// registers itself there (dynamic client registration) as a public client, and the person signs in in their browser,
// with PKCE, coming back to http://127.0.0.1:<port>/callback. Every address is fetched as a website's is (net.js):
// public addresses only, at every hop, connecting to the address checked, and https only.
// The tokens are kept sealed with the store's secret in remote.json beside the store: never in a config, never
// printed, never in an answer. They are refreshed when they expire and dropped when the server is forgotten.
// Only read-only tools are called (readOnly): what a server lists, finds and reads becomes Anchors in local.js, one
// read with fixed arguments called again at every question; nothing of what it returns is kept.

export const REMOTE = { requestMs: 20_000, serverMs: 45_000, signInMs: 300_000, answerBytes: 5_000_000, textChars: 1_000_000, toolPages: 5, lists: 6, items: 100, searches: 3, hits: 5, readers: 4 };
export const MCP_READ = "MCP_READ";
const VERSION = "2025-06-18";
const CLIENT = { name: "genter", title: "Genter", version: "1" };

// ---- which tools Genter calls ----

// A tool name as words: "getConfluencePage" -> GET CONFLUENCE PAGE, "notion-search" -> NOTION SEARCH.
const wordsOf = (name) =>
  String(name ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toUpperCase());
const READS = new Set(["GET", "LIST", "SEARCH", "FETCH", "READ", "FIND", "QUERY", "RETRIEVE", "SHOW", "VIEW", "DESCRIBE", "LOOKUP", "BROWSE"]);
// Verbs that change something when a name starts with them (some are nouns elsewhere: get_comment reads a comment).
// OPEN is one: an issue, a pull request, a ticket or a conversation is opened by creating it.
const WRITES = new Set(
  "OPEN CREATE DELETE UPDATE SEND REMOVE ADD POST MODIFY PATCH PUT MOVE ARCHIVE UNARCHIVE INVITE REPLY STAR UNSTAR WATCH UNWATCH UPLOAD SET START STOP CANCEL MERGE CLOSE LOCK UNLOCK MARK TRASH EXECUTE EXEC RUN TRIGGER IMPORT EXPORT COPY SHARE FORWARD APPEND INSERT UPSERT TRANSITION TRANSFER EDIT RENAME ASSIGN UNASSIGN SUBMIT DISMISS REQUEST FORK BLOCK UNBLOCK ENABLE DISABLE REPLACE ACCEPT DECLINE JOIN LEAVE APPROVE REJECT PIN UNPIN PUBLISH UNPUBLISH SCHEDULE SNOOZE RERUN RESTORE DUPLICATE CONVERT REACT FOLLOW UNFOLLOW SUBSCRIBE UNSUBSCRIBE LABEL TAG COMMENT RESOLVE REOPEN DRAFT BAN KICK MUTE INVOKE CALL DEPLOY PROVISION REVOKE GRANT RESET CLEAR EMPTY PURGE WRITE SAVE APPLY COMPLETE CHECKOUT PAY REFUND CHARGE DESTROY DROP PUSH NOTIFY TOGGLE SYNC GENERATE INSTALL UNINSTALL KILL TERMINATE RESTART ROLLBACK REVERT LINK UNLINK ATTACH DETACH VOTE LIKE UNLIKE BOOKMARK CONNECT DISCONNECT LOGIN LOGOUT REGISTER AUTHORIZE ERASE WIPE OVERWRITE".split(" "),
);
// Words that change something wherever they stand in a name (never a thing a tool reads): get_or_create, find_replace.
const CHANGES = new Set("CREATE DELETE UPDATE REMOVE MODIFY EDIT WRITE PATCH INSERT UPSERT DESTROY PURGE TRASH APPEND REPLACE RENAME EXECUTE EXEC INVOKE SEND ERASE WIPE OVERWRITE".split(" "));

// A tool name Genter calls (MCP's tool name characters, and / and :): one line, nothing a terminal would act on, so a
// name it prints (the tools it calls, what failed) writes no line of an answer.
const TOOL_NAME = /^[A-Za-z0-9_./:-]{1,128}$/;

// Whether Genter may call a tool: never one the server says is not read-only or is destructive, never one whose name
// says it changes something (it starts with a verb that writes, holds a word that always does, or joins one with
// and/or/then) or is not a plain name (TOOL_NAME); then one the server marks readOnlyHint, or whose name starts with a
// verb that reads. Anything else is never called.
export function readOnly(tool) {
  const hints = tool?.annotations ?? {};
  if (typeof tool?.name !== "string" || !TOOL_NAME.test(tool.name) || hints.readOnlyHint === false || hints.destructiveHint === true) return false;
  const words = wordsOf(tool.name);
  const first = words.findIndex((w) => READS.has(w) || WRITES.has(w));
  if (first >= 0 && WRITES.has(words[first])) return false;
  if (words.some((w) => CHANGES.has(w))) return false;
  if (words.some((w, i) => (w === "AND" || w === "OR" || w === "THEN") && WRITES.has(words[i + 1]))) return false;
  return hints.readOnlyHint === true || (first >= 0 && READS.has(words[first]));
}

// What a read-only tool is for, from its name and its inputs: list (no input needed: the things it lists become
// Anchors), search (one text input, the question), read (one input naming a thing: an Anchor's call). noun: what it
// lists or reads, so a list pairs with the read of the same thing ("list_documents" with "get_document").
const LIST = new Set(["LIST", "SEARCH", "QUERY", "FIND", "BROWSE"]);
const READ = new Set(["GET", "READ", "FETCH", "RETRIEVE", "VIEW", "SHOW", "DESCRIBE", "LOOKUP"]);
const QUERY_ARG = /^(query|q|search|search_?query|search_?term|search_?text|term|terms|text|keywords?)$/i;
const ID_ARG = /^(id|uri|url|key|identifier|uuid|slug)$|(_id|Id|_uri|Uri|_url|Url|_key|Key)$/;
const LIMIT_ARG = /^(limit|first|max_?results|page_?size|per_?page|count|top)$/i;
const STOP = new Set(["BY", "USING", "WITH", "FOR", "IN", "FROM", "OF"]);
// Things that are no documents to search (people, settings, the workspace itself): never listed as Anchors.
const NOT_DOCS = /^(USER|MEMBER|PEOPLE|PERSON|TEAM|GROUP|LABEL|STATUS|STATE|TAG|WORKSPACE|ORG|ORGANIZATION|ACCOUNT|ROLE|PERMISSION|SETTING|PREFERENCE|WEBHOOK|TOKEN|KEY|INTEGRATION|TYPE|FIELD|TEMPLATE|EMOJI|ICON|AVATAR|SELF|ME|RESOURCE|TOOL)S?$/;
const singular = (noun) => noun.replace(/IES$/, "Y").replace(/S$/, "");

function roleOf(tool) {
  const words = wordsOf(tool.name);
  const at = words.findIndex((w) => READS.has(w));
  const verb = words[at];
  const rest = words.slice(at + 1);
  const stop = rest.findIndex((w) => STOP.has(w));
  const noun = singular((stop < 0 ? rest : rest.slice(0, stop)).join("_"));
  const props = tool.inputSchema?.properties && typeof tool.inputSchema.properties === "object" ? tool.inputSchema.properties : {};
  const required = Array.isArray(tool.inputSchema?.required) ? tool.inputSchema.required : [];
  const limit = Object.keys(props).find((k) => LIMIT_ARG.test(k) && ["number", "integer"].includes(props[k]?.type));
  const query = Object.keys(props).find((k) => QUERY_ARG.test(k) && (props[k]?.type ?? "string") === "string");
  return { tool: tool.name, verb, noun, props, required, limit, query };
}

// How Genter reads a server, from the tools it lists now: { reads (the names Genter may call), lists, searches, others
// (how many tools it never calls) }. A list or a search is taken only with a read of the same thing (or a read of
// anything, such as "fetch") to call for each thing it gives; lists of things that are no documents are left out. A
// bare "query" (or "sql_query") is never a search: its input may be a query language, never given the question.
export function planOf(tools) {
  const readable = tools.filter(readOnly);
  const roles = readable.map(roleOf);
  const readers = roles.filter((r) => READ.has(r.verb) && r.required.length === 1 && ID_ARG.test(r.required[0])).map((r) => ({ tool: r.tool, noun: r.noun, arg: r.required[0] }));
  const readerOf = (noun) => readers.find((r) => r.noun && r.noun === noun) ?? readers.find((r) => !r.noun) ?? null;
  const fit = (r, n) => (r.limit ? { [r.limit]: Math.min(n, Number.isFinite(r.props[r.limit]?.maximum) ? r.props[r.limit].maximum : n) } : {});
  const lists = roles
    .filter((r) => LIST.has(r.verb) && !r.required.length && !NOT_DOCS.test(r.noun) && readerOf(r.noun))
    .sort((a, b) => Number(a.verb !== "LIST") - Number(b.verb !== "LIST") || a.tool.length - b.tool.length)
    .slice(0, REMOTE.lists)
    .map((r) => ({ tool: r.tool, arguments: fit(r, 50), reader: readerOf(r.noun) }));
  const searches = roles
    .filter((r) => LIST.has(r.verb) && !(r.verb === "QUERY" && !r.noun) && r.query && r.required.every((k) => k === r.query) && !NOT_DOCS.test(r.noun) && readerOf(r.noun))
    .sort((a, b) => Number(a.verb !== "SEARCH") - Number(b.verb !== "SEARCH") || a.tool.length - b.tool.length)
    .slice(0, REMOTE.searches)
    .map((r) => ({ tool: r.tool, arg: r.query, arguments: fit(r, REMOTE.hits * 2), reader: readerOf(r.noun) }));
  return { reads: new Set(readable.map((t) => t.name)), lists, searches, others: tools.length - readable.length };
}

// ---- what a server answers ----

const isObject = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
// Text a server gives for one line (a name, a title, a link): no control, bidi or zero-width characters and no line
// breaks, so no line of an answer is ever written by a server.
export const oneLine = (s, max = 120) =>
  String(s ?? "")
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
const jsonOf = (text) => {
  const t = String(text ?? "").trim();
  if (!/^[[{]/.test(t)) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
};
// The text blocks of a tool's or a resource's answer.
function blocksOf(result) {
  if (Array.isArray(result?.contents)) return result.contents.map((c) => (typeof c?.text === "string" ? c.text : "")).filter(Boolean);
  return (Array.isArray(result?.content) ? result.content : []).map((c) => (c?.type === "text" && typeof c.text === "string" ? c.text : c?.type === "resource" && typeof c.resource?.text === "string" ? c.resource.text : "")).filter(Boolean);
}
// What an answer holds as data: its structured content, else the JSON its text is (one block, or one object a block).
function dataOf(result) {
  if (result?.structuredContent !== undefined && result.structuredContent !== null) return result.structuredContent;
  const blocks = blocksOf(result);
  if (blocks.length === 1) return jsonOf(blocks[0]);
  const each = blocks.map(jsonOf);
  return each.length && each.every(isObject) ? each : null;
}

const TITLE_KEYS = ["title", "name", "subject", "summary", "identifier", "displayName", "display_name"];
const DATE_KEYS = ["updatedAt", "updated_at", "updated", "last_edited_time", "lastEditedTime", "lastModified", "last_modified", "modifiedAt", "modified_at", "modified", "editedAt", "edited_at", "timestamp", "createdAt", "created_at", "created", "date"];
const LINK_KEYS = ["url", "link", "href", "webUrl", "web_url", "html_url", "permalink"];
const ID_KEYS = ["id", "uuid", "key", "identifier", "uri", "slug"];
const BODY_KEYS = ["content", "text", "body", "markdown", "description", "plain_text", "plainText"];
const LIST_KEYS = ["results", "items", "data", "nodes", "edges", "documents", "pages", "issues", "records", "entries", "values", "list", "hits", "resources"];

const titleOf = (v) => {
  for (const k of TITLE_KEYS) {
    const x = v?.[k];
    if (typeof x === "string" && x.trim()) return oneLine(x);
    if (Array.isArray(x)) {
      const joined = x.map((p) => (typeof p === "string" ? p : (p?.plain_text ?? p?.text?.content ?? p?.text ?? ""))).join("");
      if (typeof joined === "string" && joined.trim()) return oneLine(joined);
    }
  }
  return undefined;
};
// A date a thing gives itself, as an ISO time; undefined when none can be read (or it is not between 1990 and 2100).
export function dateOf(v) {
  for (const k of DATE_KEYS) {
    const x = v?.[k];
    if (typeof x !== "string" && typeof x !== "number") continue;
    const t = new Date(typeof x === "number" && x < 1e12 ? x * 1000 : x);
    const year = t.getUTCFullYear();
    if (Number.isFinite(t.getTime()) && year >= 1990 && year <= 2100) return t.toISOString();
  }
  return undefined;
}
const linkOf = (v) => {
  for (const k of LINK_KEYS) {
    const x = v?.[k];
    if (typeof x === "string" && /^https?:\/\/[^\s<>"]{1,500}$/i.test(x) && !/[\p{Cc}\p{Cf}]/u.test(x)) return x;
  }
  return undefined;
};
const idOf = (v) => {
  for (const k of ID_KEYS) if ((typeof v?.[k] === "string" && v[k].trim()) || Number.isFinite(v?.[k])) return v[k];
  return undefined;
};

// The things a list or a search answered: the first array of objects in its data (at the top, or under results, items,
// nodes...), a GraphQL edge's node unwrapped.
export function itemsOf(result) {
  const find = (v, depth) => {
    if (Array.isArray(v)) return v.map((x) => (isObject(x?.node) ? x.node : x)).filter(isObject);
    if (!isObject(v) || depth > 2) return [];
    for (const k of LIST_KEYS) {
      const a = k in v ? find(v[k], depth + 1) : [];
      if (a.length) return a;
    }
    for (const x of Object.values(v)) {
      const a = Array.isArray(x) || isObject(x) ? find(x, depth + 1) : [];
      if (a.length) return a;
    }
    return [];
  };
  return find(dataOf(result), 0);
}

// JSON as text a person reads: short fields as "key: value" lines, then long texts as paragraphs; ids, icons and the like
// left out.
const SKIP_KEY = /^(id|uuid|_.*|icon|cover|avatar\w*|image\w*|thumbnail\w*|color|colour)$|(_id|Id|_ids|Ids)$/;
function plainOf(v, depth = 0) {
  if (v == null) return "";
  if (typeof v !== "object") return String(v);
  if (Array.isArray(v)) {
    const parts = v.map((x) => (typeof x === "object" ? (depth ? (titleOf(x) ?? "") : plainOf(x, depth + 1)) : String(x))).filter(Boolean);
    return parts.join(depth ? ", " : "\n\n");
  }
  const short = [];
  const long = [];
  for (const [k, x] of Object.entries(v)) {
    if (x == null || x === "" || SKIP_KEY.test(k)) continue;
    if (typeof x === "string" && (x.length > 200 || x.includes("\n"))) long.push(x.trim());
    else if (typeof x !== "object") short.push(`${k}: ${x}`);
    else if (depth < 2) {
      const inner = Array.isArray(x) ? plainOf(x, depth + 1) : (titleOf(x) ?? plainOf(x, depth + 1));
      if (inner && inner.length <= 200 && !inner.includes("\n")) short.push(`${k}: ${inner}`);
      else if (inner) long.push(inner);
    }
  }
  return [short.join("\n"), ...long].filter(Boolean).join("\n\n");
}

// What a read answered, as a document: { title?, text, date?, link?, data? } (data: the object it answered, for the
// marks a thing carries as a flag, such as archived), or null when it holds no text. JSON is written as text (plainOf),
// its body last; the text starts with its title as a heading when it has none of its own.
export function docOf(result) {
  const raw = blocksOf(result).join("\n\n");
  const data = dataOf(result);
  const one = isObject(data) ? data : Array.isArray(data) && data.length === 1 && isObject(data[0]) ? data[0] : null;
  let text = raw;
  if (one) {
    const body = BODY_KEYS.map((k) => one[k]).find((x) => typeof x === "string" && x.trim());
    const rest = Object.fromEntries(Object.entries(one).filter(([k, x]) => x !== body && !TITLE_KEYS.slice(0, 2).includes(k)));
    text = [plainOf(rest), body?.trim()].filter(Boolean).join("\n\n");
  } else if (Array.isArray(data)) text = plainOf(data);
  // Nothing in it acts on a terminal or turns text around: control characters (but tab and line break), bidi
  // embeddings, overrides and isolates are left out.
  text = text
    .slice(0, REMOTE.textChars)
    .replace(/\r\n?/g, "\n")
    .replace(/(?![\t\n])\p{Cc}|[\u202a-\u202e\u2066-\u2069]/gu, "")
    .trim();
  if (!text) return null;
  const title = (one && titleOf(one)) || undefined;
  if (title && !/^\s*#{1,3}\s/.test(text)) text = `# ${title}\n\n${text}`;
  return { ...(title && { title }), text, ...(one && dateOf(one) && { date: dateOf(one) }), ...(one && linkOf(one) && { link: linkOf(one) }), ...(one && { data: one }) };
}

// A thing a list or a search gave, as the call that reads it: { tool, arguments: { <reader's input>: <its id> } }, or
// null when it names nothing the reader takes; with what the listing says of it (title, date, link).
function readCall(reader, item) {
  const value = /ur[il]$/i.test(reader.arg) ? (item[reader.arg] ?? item.uri ?? item.url ?? idOf(item)) : (item[reader.arg] ?? idOf(item));
  if (!((typeof value === "string" && value.trim() && value.length <= 500) || Number.isFinite(value))) return null;
  return { call: { tool: reader.tool, arguments: { [reader.arg]: value } }, title: titleOf(item), date: dateOf(item), link: linkOf(item) };
}

// ---- the protocol ----

// The server's own JSON-RPC error answering a request (code: its code): what it says about what was asked, such as a
// resource it does not have (-32002). Any other failure (a status with no answer to this request, a session the server
// ended, a timeout) is a plain Error and says nothing about what was asked.
class Answered extends Error {
  constructor(method, error) {
    super(`${method}: ${oneLine(error?.message, 300) || "failed"}`);
    this.code = error?.code;
  }
}

// A server that asks to sign in (again): its message says how, for an answer that names the server.
export class SignInNeeded extends Error {
  constructor(header, url, again) {
    super(again ? `its sign-in expired or was revoked: run genter add ${url} in a terminal to sign in again` : `it asks to sign in: run genter add ${url} in a terminal to sign in`);
    this.header = header ?? "";
  }
}

const hostOf = (url) => new URL(url).host;
const cancel = (res) => res.body?.cancel().catch(() => {});
// A failed request in plain words: an address that is not public says so, a timeout says how long it waited.
function failure(e) {
  if (/is not a public address/.test(e.message)) return new Error(`${e.message}: Genter reaches MCP servers at public addresses only`);
  if (e.name === "TimeoutError" || e.name === "AbortError") return new Error(`it did not answer within ${REMOTE.requestMs / 1000} s`);
  const why = e.cause?.code ?? e.cause?.message;
  return why && !e.message.includes(why) ? new Error(`${e.message} (${why})`) : e;
}

// A JSON-RPC message among the events of a stream, or as plain JSON, answering this id.
function messageIn(event, id) {
  const data = event
    .split(/\r?\n/)
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).replace(/^ /, ""))
    .join("\n");
  const m = jsonOf(data);
  return m && m.id === id && (m.result !== undefined || m.error) ? m : null;
}
// The answer to a request: plain JSON, or an event stream read until the message with its id comes (the stream may
// stay open after it), REMOTE.answerBytes at most.
async function answerOf(res, id) {
  if (!/event-stream/i.test(res.headers.get("content-type") ?? "")) {
    const m = jsonOf(await textOf(res, REMOTE.answerBytes));
    return Array.isArray(m) ? (m.find((x) => x?.id === id) ?? null) : m;
  }
  if (!res.body) return null;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let size = 0;
  try {
    while (size < REMOTE.answerBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop();
      for (const e of events) {
        const m = messageIn(e, id);
        if (m) return m;
      }
    }
    return messageIn(buffer, id);
  } finally {
    await reader.cancel().catch(() => {});
  }
}

const HEADERS = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
const initialize = (id) => ({ jsonrpc: "2.0", id, method: "initialize", params: { protocolVersion: VERSION, capabilities: {}, clientInfo: CLIENT } });

// Whether an address is an MCP server, asked with MCP's initialize and no credentials: { header } (what it said when it
// asks to sign in, "" when it does not), or null when it does not answer as an MCP server would (a website).
async function probe(url) {
  const { res } = await publicFetch(url, { method: "POST", headers: HEADERS, body: JSON.stringify(initialize(1)), signal: AbortSignal.timeout(REMOTE.requestMs) }).catch((e) => {
    throw failure(e);
  });
  if (res.status === 401) {
    const header = res.headers.get("www-authenticate") ?? "";
    await cancel(res);
    return /^\s*bearer\b/i.test(header) ? { header } : null;
  }
  if (!res.ok) {
    await cancel(res);
    return null;
  }
  const m = await answerOf(res, 1).catch(() => null);
  return m?.result?.protocolVersion ? { header: "" } : null;
}

// One session with a server: { info, name, tools, plan, call(method, params), close() }. auth: the tokens it signs its
// requests with (authOf), refreshed before they expire and once again when the server says they no longer work. A
// session the server ended (a 404 to a request that carried its id, as Streamable HTTP says) is started again once.
async function session(url, auth) {
  let sid = null;
  let version = null;
  let next = 1;
  let restart = null;
  // One request, signed with the access token at hand: { res, used, sent } (used: that token; sent: the session id).
  const post = async (msg) => {
    if (auth.expiring() && !(await auth.refresh())) throw new SignInNeeded("", url, true);
    const used = auth.current?.access;
    const sent = sid;
    const headers = { ...HEADERS, ...(used && { Authorization: `Bearer ${used}` }), ...(sent && { "Mcp-Session-Id": sent }), ...(version && { "MCP-Protocol-Version": version }) };
    try {
      return { res: (await publicFetch(url, { method: "POST", headers, body: JSON.stringify(msg), signal: AbortSignal.timeout(REMOTE.requestMs) })).res, used, sent };
    } catch (e) {
      throw failure(e);
    }
  };
  const call = async (method, params = {}, again = true) => {
    const id = next++;
    const { res, used, sent } = await post({ jsonrpc: "2.0", id, method, params });
    if (res.status === 401) {
      const header = res.headers.get("www-authenticate") ?? "";
      await cancel(res);
      if (again && used && (await auth.refresh(used))) return call(method, params, false);
      throw new SignInNeeded(header, url, Boolean(used));
    }
    if (res.status === 404 && sent && again) {
      await cancel(res);
      if (sid === sent) restart ??= begin().finally(() => (restart = null));
      await restart;
      return call(method, params, false);
    }
    sid = res.headers.get("mcp-session-id") ?? sid;
    const m = await answerOf(res, id);
    // Only a message answering this request, with a status that is not a failure, is the server's answer to it.
    if (!m || res.status >= 400 || m.id !== id) throw new Error(`${method}: the server answered ${res.status}${m?.error?.message ? ` (${oneLine(m.error.message, 200)})` : " without an MCP message"}`);
    if (m.error) throw new Answered(method, m.error);
    return m.result;
  };
  const begin = async () => {
    sid = null;
    version = null;
    const info = await call("initialize", initialize(0).params);
    if (!info?.protocolVersion) throw new Error("it did not answer as an MCP server");
    version = String(info.protocolVersion);
    await cancel((await post({ jsonrpc: "2.0", method: "notifications/initialized" })).res);
    return info;
  };
  const info = await begin();
  const tools = [];
  if (info.capabilities?.tools) {
    let cursor;
    for (let page = 0; page < REMOTE.toolPages; page++) {
      const r = await call("tools/list", cursor ? { cursor } : {});
      tools.push(...(Array.isArray(r?.tools) ? r.tools.filter((t) => typeof t?.name === "string") : []));
      cursor = r?.nextCursor;
      if (!cursor) break;
    }
  }
  const named = oneLine(info.serverInfo?.title || info.serverInfo?.name, 60);
  const host = hostOf(url);
  const close = async () => {
    if (!sid) return;
    const headers = { ...(auth.current?.access && { Authorization: `Bearer ${auth.current.access}` }), "Mcp-Session-Id": sid, ...(version && { "MCP-Protocol-Version": version }) };
    await publicFetch(url, { method: "DELETE", headers, signal: AbortSignal.timeout(5000) }).then(({ res }) => cancel(res), () => {});
  };
  return { info, name: named && !named.includes(host) ? `${named} (${host})` : named || host, tools, plan: planOf(tools), call, close };
}

// A read of one Anchor's call: { doc } | { gone: true } | { error }. A tool is called only when it is one Genter may
// call on this server now (its plan's reads, from the tools it lists in this session). Gone only when the server says
// so of this read (the tool's own error, or its answer to resources/read); a failure on the way is an error.
async function readWith(s, call) {
  try {
    let result;
    if (call.resource !== undefined) result = await s.call("resources/read", { uri: call.resource });
    else if (!s.plan.reads.has(call.tool)) return { error: `${oneLine(call.tool, 80)} is not a read-only tool of this server now: Genter does not call it` };
    else result = await s.call("tools/call", { name: call.tool, arguments: call.arguments ?? {} });
    if (result?.isError) {
      const why = oneLine(blocksOf(result).join(" "), 300) || "the tool failed";
      return classifyFailure(why) === "gone" ? { gone: true } : { error: why };
    }
    const doc = docOf(result);
    return doc ? { doc } : { error: "it answered no text" };
  } catch (e) {
    if (e instanceof SignInNeeded) throw e;
    return e instanceof Answered && (e.code === -32002 || classifyFailure(e.message) === "gone") ? { gone: true } : { error: e.message };
  }
}

// ---- signing in ----

const json = async (url, init = {}) => {
  const { res } = await publicFetch(url, { ...init, headers: { Accept: "application/json", ...init.headers }, signal: AbortSignal.timeout(REMOTE.requestMs) }).catch((e) => {
    throw failure(e);
  });
  return { ok: res.ok, status: res.status, data: jsonOf(await textOf(res, 1_000_000)) };
};
const https = (url, what) => {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`its ${what} is not an address`);
  }
  if (u.protocol !== "https:") throw new Error(`its ${what} is not https (${oneLine(url, 200)}): Genter signs in over https only`);
  return u.toString();
};
const wellKnown = (base, name) => {
  const u = new URL(base);
  const path = u.pathname.replace(/\/+$/, "");
  return [`${u.origin}/.well-known/${name}${path}`, ...(path ? [`${u.origin}/.well-known/${name}`] : [])];
};
// Whether a resource identifier names this server: the same origin, and its path the server's or above it.
const covers = (resource, url) => {
  try {
    const r = new URL(resource);
    const u = new URL(url);
    const path = r.pathname.replace(/\/+$/, "");
    return r.origin === u.origin && (u.pathname.replace(/\/+$/, "") === path || u.pathname.startsWith(`${path}/`));
  } catch {
    return false;
  }
};
// Scopes that let a client change things: Genter only reads, so it never asks for them.
const WRITE_SCOPE = /(^|[:._/-])(write|manage|admin|delete|edit|create|update)([:._/-]|$)/i;

// Where a server's sign-in is (MCP authorization: RFC 9728's protected resource metadata, then RFC 8414's or OpenID's
// authorization server metadata): { resource, as, scope }. A server whose metadata is for another address, an issuer
// that is not the one named, an endpoint that is not https, or no PKCE with S256 is refused.
export async function discover(url, header = "") {
  const named = /resource_metadata="([^"]+)"/i.exec(header)?.[1];
  let meta = null;
  for (const at of named ? [https(named, "resource metadata")] : wellKnown(url, "oauth-protected-resource")) {
    const r = await json(at);
    if (r.ok && isObject(r.data)) {
      meta = r.data;
      break;
    }
  }
  if (meta && !covers(meta.resource, url)) throw new Error(`its sign-in metadata is for another address (${oneLine(meta.resource, 200)}): Genter signs in only where the server is`);
  const issuer = https(Array.isArray(meta?.authorization_servers) && meta.authorization_servers[0] ? meta.authorization_servers[0] : new URL(url).origin, "authorization server");
  const u = new URL(issuer);
  const path = u.pathname.replace(/\/+$/, "");
  const tries = path ? [`${u.origin}/.well-known/oauth-authorization-server${path}`, `${u.origin}/.well-known/openid-configuration${path}`, `${u.origin}${path}/.well-known/openid-configuration`] : [`${u.origin}/.well-known/oauth-authorization-server`, `${u.origin}/.well-known/openid-configuration`];
  let as = null;
  for (const at of tries) {
    const r = await json(at);
    if (r.ok && isObject(r.data) && r.data.authorization_endpoint && r.data.token_endpoint) {
      as = r.data;
      break;
    }
  }
  if (!as) throw new Error("it asks to sign in but publishes no OAuth sign-in Genter can use");
  const same = (a, b) => String(a).replace(/\/+$/, "") === String(b).replace(/\/+$/, "");
  if (as.issuer && !same(as.issuer, issuer)) throw new Error(`its authorization server says it is ${oneLine(as.issuer, 200)}, not ${issuer}`);
  for (const k of ["authorization_endpoint", "token_endpoint", ...(as.registration_endpoint ? ["registration_endpoint"] : [])]) https(as[k], k.replace(/_/g, " "));
  if (!Array.isArray(as.code_challenge_methods_supported) || !as.code_challenge_methods_supported.includes("S256")) throw new Error("its sign-in does not say it takes PKCE with S256, which MCP requires: Genter does not sign in without it");
  const asked = /scope="([^"]*)"/i.exec(header)?.[1] ?? (Array.isArray(meta?.scopes_supported) ? meta.scopes_supported.join(" ") : "");
  const scope = asked.split(/\s+/).filter((s) => s && !WRITE_SCOPE.test(s)).join(" ");
  return { resource: typeof meta?.resource === "string" ? meta.resource : url, issuer, as, ...(scope && { scope }) };
}

const b64url = (buf) => buf.toString("base64url");
const html = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Where the person's browser comes back: http://127.0.0.1:<a free port>/callback, for ms at most. { redirect, back
// (resolves to { code, iss } once it comes back with this state), close() }. A request with another state is not this
// sign-in and changes nothing.
function loopback(state, host, ms) {
  return new Promise((ready, fail) => {
    let settle;
    const back = new Promise((resolve, reject) => (settle = { resolve, reject }));
    back.catch(() => {});
    const page = (res, status, text) => res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }).end(`<!doctype html><meta charset="utf-8"><title>Genter</title><p>${html(text)}</p>`);
    const server = createServer((req, res) => {
      const u = new URL(req.url ?? "/", "http://127.0.0.1");
      if (req.method !== "GET" || u.pathname !== "/callback") return res.writeHead(404).end();
      if (u.searchParams.get("state") !== state) return page(res, 400, "This is not the sign-in Genter is waiting for.");
      const error = u.searchParams.get("error");
      const code = u.searchParams.get("code");
      if (error || !code) {
        page(res, 400, `The sign-in to ${host} did not go through. Go back to the terminal.`);
        return settle.reject(new Error(`the sign-in was refused: ${oneLine(u.searchParams.get("error_description") || error || "no code came back", 200)}`));
      }
      page(res, 200, `Signed in to ${host}. You can close this tab and go back to the terminal.`);
      settle.resolve({ code, iss: u.searchParams.get("iss") });
    });
    server.on("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const timer = setTimeout(() => settle.reject(new Error(`no sign-in came back within ${Math.round(ms / 60000) || 1} minutes`)), ms);
      ready({
        redirect: `http://127.0.0.1:${server.address().port}/callback`,
        back,
        close() {
          clearTimeout(timer);
          server.close();
          server.closeAllConnections?.();
        },
      });
    });
  });
}

// Tokens from a token endpoint, as kept (sealed): { access, refresh, expires_at, client_id, client_secret?,
// token_endpoint, resource, scope? }. A refusal is an error with refused: true (the person signs in again); anything
// else (the endpoint down) is an error as it is.
async function token(p, grant) {
  const form = new URLSearchParams({ ...grant, client_id: p.client_id, resource: p.resource });
  if (p.client_secret) form.set("client_secret", p.client_secret);
  const r = await json(p.token_endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString() });
  if (!r.ok || typeof r.data?.access_token !== "string" || (r.data.token_type && !/^bearer$/i.test(r.data.token_type))) {
    throw Object.assign(new Error(`its sign-in refused Genter: ${oneLine(r.data?.error_description ?? r.data?.error ?? r.status, 200)}`), { refused: r.status >= 400 && r.status < 500 });
  }
  const expires = Number(r.data.expires_in);
  return {
    at: Date.now(),
    access: r.data.access_token,
    refresh: typeof r.data.refresh_token === "string" ? r.data.refresh_token : (grant.refresh_token ?? null),
    expires_at: Number.isFinite(expires) && expires > 0 ? Date.now() + expires * 1000 : null,
    client_id: p.client_id,
    ...(p.client_secret && { client_secret: p.client_secret }),
    token_endpoint: p.token_endpoint,
    resource: p.resource,
    ...(p.scope && { scope: p.scope }),
  };
}

// Signs the person in to a server: Genter registers itself (dynamic client registration, a public client), makes the
// address of the server's own sign-in with PKCE (S256), a state and the server as the resource, hands it to show(url)
// (the command prints it: Genter opens no browser) and waits for the browser to come back, then trades the code for
// tokens. A server that takes no new clients is refused saying so: a client metadata document needs an address of
// Genter's own, which it does not have yet.
async function authorize(url, header, show, ms) {
  const host = hostOf(url);
  const d = await discover(url, header);
  if (!d.as.registration_endpoint) {
    const cimd = d.as.client_id_metadata_document_supported === true ? " (it takes a client metadata document, for which Genter has no address of its own yet)" : "";
    throw new Error(`its sign-in takes no new clients: Genter registers itself as a client (dynamic client registration), which ${host} does not offer${cimd}`);
  }
  const state = b64url(randomBytes(24));
  const callback = await loopback(state, host, ms);
  try {
    const reg = await json(d.as.registration_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_name: "Genter", client_uri: "https://github.com/Genterai/genter", redirect_uris: [callback.redirect], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none", ...(d.scope && { scope: d.scope }) }),
    });
    if (!reg.ok || typeof reg.data?.client_id !== "string") throw new Error(`its sign-in did not register Genter (${reg.status}${reg.data?.error ? `: ${oneLine(reg.data.error_description ?? reg.data.error, 200)}` : ""})`);
    const verifier = b64url(randomBytes(32));
    const address = new URL(d.as.authorization_endpoint);
    const params = { response_type: "code", client_id: reg.data.client_id, redirect_uri: callback.redirect, code_challenge: b64url(createHash("sha256").update(verifier).digest()), code_challenge_method: "S256", state, resource: d.resource, ...(d.scope && { scope: d.scope }) };
    for (const [k, v] of Object.entries(params)) address.searchParams.set(k, v);
    show(address.toString(), { server: url });
    const { code, iss } = await callback.back;
    if (d.as.authorization_response_iss_parameter_supported === true && (iss ?? "").replace(/\/+$/, "") !== String(d.as.issuer ?? d.issuer).replace(/\/+$/, "")) throw new Error("the sign-in came back from another server (its iss is not the authorization server's)");
    const secret = typeof reg.data.client_secret === "string" ? reg.data.client_secret : undefined;
    return await token({ client_id: reg.data.client_id, client_secret: secret, token_endpoint: d.as.token_endpoint, resource: d.resource, scope: d.scope }, { grant_type: "authorization_code", code, redirect_uri: callback.redirect, code_verifier: verifier });
  } finally {
    callback.close();
  }
}

// ---- the tokens, sealed ----

// remote.json beside the store: { v, blob } where blob is every server's tokens, sealed with the store's secret (a key of
// their own: `${secret}:${userId}:remote`), readable by its owner only, read again at every use (another process may
// have refreshed them), written whole through a temp file. Gone once it holds no server.
function keyring({ home, secret, userId }) {
  const file = join(home, "remote.json");
  const { seal, open } = cipher(`${secret}:${userId}:remote`);
  const all = () => {
    let raw;
    try {
      raw = readFileSync(file, "utf8");
    } catch {
      return {};
    }
    try {
      const opened = open(JSON.parse(raw).blob);
      return isObject(opened) ? opened : {};
    } catch {
      throw new Error(`${file} was sealed with another secret: move it away, then sign in again with genter add <address>`);
    }
  };
  const write = (data) => {
    if (!Object.keys(data).length) {
      try {
        unlinkSync(file);
      } catch {}
      return;
    }
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ v: 1, blob: seal(data) }), { mode: 0o600 });
    renameSync(tmp, file);
  };
  return {
    get: (url) => all()[url] ?? null,
    set: (url, tokens) => write({ ...all(), [url]: tokens }),
    drop(url) {
      const data = all();
      if (!(url in data)) return false;
      delete data[url];
      write(data);
      return true;
    },
  };
}

// ---- the client ----

// Genter as the client of the servers a person added: { probe(url), open(url, { signIn }), read(session, call),
// listing(session), search(session, question), forget(url) }. home, secret, userId: the store's, whose secret seals
// the tokens; signInMs: how long a sign-in waits for the browser.
export function createRemote({ home, secret, userId = "default", signInMs = REMOTE.signInMs }) {
  const keys = keyring({ home, secret, userId });

  // A server's tokens as a session signs with them. expiring(): within a minute of their end (half their life, for
  // tokens that live less than two). refresh(): new tokens from the refresh token, kept at once, one refresh at a time
  // (refresh tokens may be good for one use); tokens another process refreshed meanwhile (newer on disk) are taken
  // instead. false when the server refused (the person signs in again); an endpoint that is down is an error as it is.
  function authOf(url) {
    let pending = null;
    const auth = {
      current: keys.get(url),
      expiring() {
        const t = auth.current;
        if (!t?.expires_at) return false;
        const life = t.at ? t.expires_at - t.at : 120_000;
        return t.expires_at - Date.now() < Math.min(60_000, life / 2);
      },
      // used: the access token a request was refused with; when the tokens changed since, they are already new.
      refresh(used = auth.current?.access) {
        if (auth.current?.access !== used) return Promise.resolve(true);
        pending ??= renew().finally(() => (pending = null));
        return pending;
      },
    };
    const renew = async () => {
      const disk = keys.get(url);
      if (disk && disk.access !== auth.current?.access) {
        auth.current = disk;
        if (!auth.expiring()) return true;
      }
      if (!auth.current?.refresh) return false;
      try {
        auth.current = await token(auth.current, { grant_type: "refresh_token", refresh_token: auth.current.refresh });
      } catch (e) {
        const again = keys.get(url);
        if (again && again.access !== auth.current.access) {
          auth.current = again;
          return true;
        }
        if (e.refused) return false;
        throw e;
      }
      keys.set(url, auth.current);
      return true;
    };
    return auth;
  }

  return {
    probe,

    // A session with a server, signed in with its tokens. When it asks to sign in (no tokens, or they expired and could
    // not be refreshed), signIn(url, { server }) shows the person where to sign in; without signIn (an MCP client, a
    // team's server) that is an error that says how to sign in.
    async open(url, { signIn } = {}) {
      const auth = authOf(url);
      try {
        return await session(url, auth);
      } catch (e) {
        if (!(e instanceof SignInNeeded) || !signIn) throw e;
        auth.current = await authorize(url, e.header, signIn, signInMs);
        keys.set(url, auth.current);
        return session(url, auth);
      }
    },

    read: readWith,

    // What a server lists, as calls to read: its resources, then what each list of its plan gives (REMOTE.items at most).
    // { items: [{ call, title?, date?, link? }], problems: [what failed], complete }.
    async listing(s) {
      const items = [];
      const problems = [];
      const seen = new Set();
      const add = (item) => {
        const k = JSON.stringify(item.call);
        if (seen.has(k)) return;
        seen.add(k);
        items.push(item);
      };
      let complete = true;
      if (s.info.capabilities?.resources) {
        try {
          const r = await s.call("resources/list", {});
          for (const x of Array.isArray(r?.resources) ? r.resources : []) if (typeof x?.uri === "string" && x.uri.length <= 500) add({ call: { resource: x.uri }, title: titleOf(x), date: dateOf(x.annotations ?? {}) ?? dateOf(x), link: linkOf(x) ?? (/^https?:\/\//i.test(x.uri) ? x.uri : undefined) });
          if (r?.nextCursor) complete = false;
        } catch (e) {
          if (e instanceof SignInNeeded) throw e;
          problems.push(`resources/list: ${e.message}`);
        }
      }
      for (const l of s.plan.lists) {
        try {
          const result = await s.call("tools/call", { name: l.tool, arguments: l.arguments });
          if (result?.isError) problems.push(`${l.tool}: ${oneLine(blocksOf(result).join(" "), 200) || "failed"}`);
          else
            for (const item of itemsOf(result)) {
              const c = readCall(l.reader, item);
              if (c) add(c);
            }
        } catch (e) {
          if (e instanceof SignInNeeded) throw e;
          problems.push(`${l.tool}: ${e.message}`);
        }
      }
      if (items.length > REMOTE.items) complete = false;
      return { items: items.slice(0, REMOTE.items), problems, complete };
    },

    // The things a server's own search finds for a question, as calls to read (REMOTE.hits from each search at most).
    async search(s, question) {
      const items = [];
      const problems = [];
      for (const q of s.plan.searches) {
        try {
          const result = await s.call("tools/call", { name: q.tool, arguments: { ...q.arguments, [q.arg]: question } });
          if (result?.isError) problems.push(`${q.tool}: ${oneLine(blocksOf(result).join(" "), 200) || "failed"}`);
          else items.push(...itemsOf(result).map((item) => readCall(q.reader, item)).filter(Boolean).slice(0, REMOTE.hits));
        } catch (e) {
          if (e instanceof SignInNeeded) throw e;
          problems.push(`${q.tool}: ${e.message}`);
        }
      }
      return { items, problems };
    },

    // Drops a server's tokens: true when there were some.
    forget: (url) => keys.drop(url),
  };
}

// Whether an address may be an MCP server rather than a website: https, and its path ends in /mcp or its host starts
// with mcp. (https://mcp.linear.app/mcp, https://mcp.atlassian.com/v1/mcp). Whether it is one, its answer says (probe).
export function mcpAddress(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (/(^|\/)mcp\/?$/i.test(u.pathname) || /^mcp\./i.test(u.hostname));
  } catch {
    return false;
  }
}
