import { createHash } from "node:crypto";
import { KINDS } from "./readers.js";

// The decisions page (`genter decisions`): which decisions of a project hold now and which their own text says were
// replaced, from what documents say about themselves as the readers read them (readers.js): an ADR's or an RFC's status
// and date, a decision log's headings, front matter, a notice at a document's top. No row is Genter's own verdict, none
// says two documents disagree (that needs a model), and no date is a file time. Pure: documents in, rows out; rows in,
// one HTML file out, every text escaped, no script, nothing loaded, so it opens offline and runs nothing a document
// holds.

// The readers whose every document, or every entry, is a decision record: an ADR, an RFC (a PEP, a KEP), a heading of a
// decision log. Any reader's mark that a document is replaced (a banner at its top, its front matter) makes that
// document a row too. A CHANGELOG's versions are releases, and what they deprecate is a feature, not a decision.
export const DECISION_READERS = ["adr", "decisions", "rfc"];

// The rows of a project's page from its documents, [{ path, title: { text, line? }, read }] as createLocal's
// documents() gives them (read: what readDocument read there, each mark's link resolved to the file it names as `to`;
// null for a file a mark names that the readers read nothing in). A row: { state: "current" | "replaced", title, path,
// line, date?, status?, notice?: { line, quote } | { line, status }, by?: { path } | { name } | { link } }; line is
// where its date is written, else its title; notice: the line that marks it, or the status it gives itself
// ("superseded", "deprecated" and the other kinds of readers.js) when no line names what replaces it; by: the file of
// the project that replaces it, else the name or the link its notice gives.
// Current rows first, then replaced ones, each newest first, undated last.
export function decisionsOf(documents) {
  const rows = [];
  const rowed = new Set();
  for (const d of documents) {
    const read = d.read;
    if (!read) continue;
    const entries = (read.entries ?? []).filter((e) => DECISION_READERS.includes(e.reader));
    for (const e of entries) rows.push(row(d, { title: e.title, line: e.line, date: e.date, status: e.status, marks: e.marks }));
    // A mark under the first entry of a log or a CHANGELOG is that entry's ("### Deprecated" under a version, a status
    // under a decision: a banner reader sees the top lines too), not the whole document's.
    const first = Math.min(Infinity, ...(read.entries ?? []).map((e) => e.line));
    const marks = (read.marks ?? []).filter((m) => m.line < first);
    const record = read.readers.some((r) => DECISION_READERS.includes(r) && !entries.some((e) => e.reader === r));
    if (record || marks.length) rows.push(row(d, { title: d.title?.text ?? d.path, line: d.title?.line, date: read.date, status: read.status, marks }));
    if (entries.length || record || marks.length) rowed.add(d.path);
  }
  // What a replaced row's notice names, when it is a file of the project with no row of its own: current, by that
  // notice's own words.
  const byPath = new Map(documents.map((d) => [d.path, d]));
  for (const r of [...rows]) {
    const to = r.by?.path;
    if (!to || rowed.has(to)) continue;
    rowed.add(to);
    const d = byPath.get(to) ?? { path: to };
    rows.push(row(d, { title: d.title?.text ?? to, line: d.title?.line, date: d.read?.date, status: d.read?.status, marks: [] }));
  }
  const rank = (r) => (r.state === "current" ? 0 : 1);
  return rows.sort((a, b) => rank(a) - rank(b) || (b.date ?? "").localeCompare(a.date ?? "") || a.path.localeCompare(b.path) || a.line - b.line);
}

// One row. Of a decision's marks, the notice shown is the one that names what replaces it (a file of the project, then
// a link or a name), else its first; with no mark, a status of a replaced kind is its notice.
function row(d, { title, line, date, status, marks = [] }) {
  const sorted = [...marks].sort((a, b) => a.line - b.line);
  const mark = sorted.find((m) => m.to) ?? sorted.find((m) => m.by || m.name) ?? sorted[0];
  const replaced = !mark && status && KINDS.includes(status.value) ? status : null;
  const by = mark && (mark.to ? { path: mark.to } : mark.name ? { name: mark.name } : mark.by ? { link: mark.by } : null);
  return {
    state: mark || replaced ? "replaced" : "current",
    title: String(title),
    path: d.path,
    line: date?.line ?? line ?? 1,
    ...(date?.value && { date: date.value }),
    ...(status?.value && !mark && !replaced && { status: status.value }),
    ...(mark && { notice: { line: mark.line, quote: mark.quote } }),
    ...(replaced && { notice: { line: replaced.line, status: replaced.value } }),
    ...(by && { by }),
  };
}

// ---- the page ----

const CSS = `:root{--bg:#fbfbf9;--fg:#1c1c1a;--muted:#686862;--line:#e3e2dd;--code:#f0efeb;--current:#1d6b40;--current-bg:#e4f2ea;--replaced:#8c4a0c;--replaced-bg:#f7ebdc;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#151514;--fg:#ecebe6;--muted:#a3a29b;--line:#2d2c29;--code:#22211f;--current:#86d3a6;--current-bg:#17301f;--replaced:#f2b67c;--replaced-bg:#3a2713}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:1080px;margin:0 auto;padding:32px 16px 48px}
h1{font-size:24px;line-height:1.25;margin:0 0 6px}
p{margin:0}
.stamp,.empty,footer{color:var(--muted)}
.counts{margin:14px 0 20px}
code{font:13px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:var(--code);padding:1px 5px;border-radius:4px;overflow-wrap:anywhere}
table{width:100%;border-collapse:collapse}
th{text-align:left;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);padding:8px 10px;border-bottom:1px solid var(--line)}
td{padding:10px;border-bottom:1px solid var(--line);vertical-align:top;overflow-wrap:anywhere}
tr.with-notice td{border-bottom:0;padding-bottom:4px}
tr.notice td{padding-top:0;color:var(--muted)}
.state{display:inline-block;font-size:12px;font-weight:700;letter-spacing:.04em;padding:2px 8px;border-radius:999px;white-space:nowrap}
.current .state{color:var(--current);background:var(--current-bg)}
.replaced .state{color:var(--replaced);background:var(--replaced-bg)}
.status,.undated{color:var(--muted)}
footer{margin-top:28px;font-size:13px}
footer p+p{margin-top:6px}
@media (max-width:640px){thead{display:none}table,tbody,tr,td{display:block}tr{padding:10px 0;border-bottom:1px solid var(--line)}td,tr.notice td{border:0;padding:2px 0}tr.with-notice{border-bottom:0;padding-bottom:0}}`;
// The page's one style, allowed by its hash: no other style, script, image, font, frame or connection is.
const CSP = `default-src 'none'; style-src 'sha256-${createHash("sha256").update(CSS).digest("base64")}'; base-uri 'none'; form-action 'none'`;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const code = (s) => `<code>${esc(s)}</code>`;

// The page: { project (its name), commit (null before the first commit), date (YYYY-MM-DD), rows (decisionsOf) } in,
// one HTML file out.
export function decisionsPage({ project, commit, date, rows }) {
  const current = rows.filter((r) => r.state === "current").length;
  const replaced = rows.length - current;
  const stamp = commit ? `generated at ${code(commit.slice(0, 7))} on ${esc(date)}` : `generated on ${esc(date)}, before the first commit`;
  const body = rows.length
    ? `<table>
<thead><tr><th>State</th><th>Decision</th><th>Place</th><th>Its own date</th></tr></thead>
<tbody>
${rows.map(rowHtml).join("\n")}
</tbody>
</table>`
    : `<p class="empty">No decision records and no replaced marks in ${esc(project)}: Genter reads ADRs and RFCs (their status and date), the headings of docs/decisions.md, front matter, and a notice at the top of a document.</p>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Decisions in ${esc(project)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
<header>
<h1>Decisions in ${esc(project)}</h1>
<p class="stamp">${stamp} · run <code>genter decisions</code> again to refresh</p>
<p class="counts">${current} current · ${replaced} replaced, by their own text · dates as the documents give them</p>
</header>
${body}
<footer>
<p>Each row is what a document says about itself: an ADR's or an RFC's status and date, a heading of a decision log, front matter, a notice at its top. No row is Genter's own verdict, and none says that two documents disagree: that needs a model.</p>
<p>This page quotes the documents of ${esc(project)}: check it before you share it.</p>
</footer>
</main>
</body>
</html>
`;
}

function rowHtml(r) {
  const place = code(`${r.path}:${r.line}`);
  const date = r.date ? esc(r.date) : `<span class="undated">no date written</span>`;
  const status = r.status ? `<span class="status"> · Status: ${esc(r.status)}</span>` : "";
  const state = r.state === "current" ? "current" : "replaced";
  const label = state.toUpperCase();
  const line = `<tr class="${state}${r.notice ? " with-notice" : ""}"><td><span class="state">${label}</span></td><td>${esc(r.title)}${status}</td><td>${place}</td><td>${date}</td></tr>`;
  if (!r.notice) return line;
  const link = r.by?.link && (/^https?:\/\//i.test(r.by.link) ? `replaced by ${code(r.by.link)}` : `replaced by ${code(r.by.link)}, not a file Genter reads here`);
  const by = r.by?.path ? `replaced by ${code(r.by.path)}` : r.by?.name ? `replaced by “${esc(r.by.name)}”` : (link ?? "it names nothing that replaces it");
  const says = r.notice.quote !== undefined ? `says: “${esc(r.notice.quote)}”` : `gives its status as “${esc(r.notice.status)}”`;
  return `${line}\n<tr class="replaced notice"><td></td><td colspan="3">${code(`${r.path}:${r.notice.line}`)} ${says} · ${by}</td></tr>`;
}
