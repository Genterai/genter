# The MCP contract

Intent: every form of Genter speaks one MCP contract, so an agent, a skill or a client works the same with the local
server and with Genter Cloud — success: a client that searched "can we deploy on Friday?" in either reads the places it
got by their ids, sees a replaced place marked `⚠ superseded by [id] on <day>: “…”`, and `genter-cli/conformance`
passes on both.
Sources: `src/mcp-server.js`, `src/conformance.js`; in `src/local.js`, the places' numbers and `read`.

Most weight: [two-tools] and [place-ids] (what every client and skill is written against), [read-scope] (an id never
reaches a place of another project), and [conformance] ("works with Genter" means passing it).

## Red lines

### Two tools

* **[two-tools]** Every form of Genter serves `search {query, limit}` and `read {ids}`, as Genter Cloud's public MCP
  contract does: tools/list gives each a title and `annotations: { readOnlyHint: true }`; `query` is a required
  string, `limit` a number (locally 5 by default, 20 at most); `ids` a required array of numbers, 10 read per call.
  Other tools a form lists are not part of the contract.
* **[place-ids]** Places are named by number: each place (a file, a page, the notes file) has a positive whole number,
  given once and kept with its anchor in the sealed store, the same across searches, re-reads, edits and restarts, and
  never given to another place (one forgotten and added again is a new place, with a new number). A store made
  before numbers gets them at its first open, oldest place first, its anchor ids and digests unchanged.

### What search and read say

* **[search-shape]** `search` answers with the places that match: each starts `[id] title` (the passage's headings,
  else the place's title) on a line of its own, then an indented line with where it is (`path:lines` or the link),
  what it is (file, page, notes), its date (`updated <day>`) and what Genter saw (`replaces [id]`, changed or new
  since the last look, a note's date), then its marks, then the passage, indented so no line of it reads as a place.
  What changed since the last look comes first (a refused `genter.json` before it), and the answer ends saying that
  read takes the ids. Nothing found is a sentence that names no place.
* **[marks]** A mark is a line of its own, `  ⚠ ` then what it says. A place that says at its top that it was replaced,
  by a place this project reads: `⚠ superseded by [id] on <day>: “<its notice>”`, the day that place's own date; by
  a place this project does not read, or with no place named: `⚠ marked as replaced by <place> at its top: “…”` or
  `⚠ marked as <deprecated, obsolete…> at its top: “…”`, never an id read would refuse; a page whose address now
  redirects: `⚠ address now redirects to <address>`; a place old beside newer ones in the same answer: its age as a
  fact. The notice is quoted from the text read now (160 characters at most) and never stored. A contradiction, when
  an engine finds one, is `⚠ contradicted by [id] (<day>): “…”` on the earlier side and `⚠ contradicts [id] (<day>):
  “…”` on the later.
* **[read-whole]** `read` reads each place now, several in one call: `[id] title · read now`, the same second line and
  marks as search, then its text as it is now (20,000 characters at most, then how many more), places apart by a line
  of `---`; a gone place says it is gone, one that cannot be read says why; ids past the tenth are not read and the
  answer names them; an id may be a number or text holding numbers.
* **[read-scope]** `read` reads only places of the project it runs in (local-search/project-scope) and the person's
  notes: an id of another project's place, of a place switched off or left out by `genter.json`, or one never given
  is refused in one plain line that names the ids and the project, and nothing of it is read; the line is the same
  for each, so it never tells whether another project has the place. A refused id is no JSON-RPC error; no ids at all
  is a tool error.

### Conformance

* **[conformance]** `genter-cli/conformance`, with no dependency, exports `conformance(send, { query, mark })`: given a
  function that sends one JSON-RPC request and resolves to its response, it checks initialize, tools/list (search and
  read, their titles, input schemas and readOnlyHint), that search answers with numbered places whose marks are in
  the format of [marks], a read of a returned id and of two at once, a read of the id a mark names, an unknown id
  refused with a plain message, missing arguments as tool errors and an unknown tool as -32602, and resolves to
  `{ ok, checks, ids }`. Genter's own tests run it against `genter mcp` over stdio.

## Proof

* **[ac-two-tools]** Given a project whose runbook says at its top "Deprecated: replaced by [Release process
  v2](release-process-v2.md)", when an MCP client lists the tools of `genter mcp`, searches "can we deploy on Friday?"
  and reads the ids it got, then it sees search and read, the runbook marked `⚠ superseded by [<v2's id>] on <v2's
  day>: “…”`, and reads v2 by that id; `genter mcp` in another project refuses the same ids.
