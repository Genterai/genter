# Area listing

Intent: an area is listed and reconciled within the room a plan gives, with no model — success: a repository of 80
files read with room for 60 reads 60, plainly, and says 20 were not read.
Sources: the area-listing spec on the legacy branch of Genterai/specs (archive); `src/area.js`, `src/plain.js`.

## Red lines

### Reading

* **[run-reads]** A run reads no more items than its `reads`; the rest are counted as not read.
* **[plain-reads]** An area's item reads are plain; the list call is an ordinary one.
* **[listing-handed-early]** The listing is handed over as the run goes, not only at its end.
* **[reconcile-room]** A reconcile makes at most `room` new anchors; the new items beyond it are limited, not pending.

### Plain text

* **[plain-text]** A file's base64 content is its text; a record's fields are written as Markdown.
* **[plain-sections]** Markdown is cut by heading, code into blocks at blank lines, at most 100 sections.
* **[plain-description]** The title is the first heading, else the name; the summary names the place, its app and its
  headings.
