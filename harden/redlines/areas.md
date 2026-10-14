# Areas

Intent: a whole area of an app (a repository, a folder, a label of notes) is read and kept current without a model
per item — success: reading a repository's files makes one anchor per file, described from its text with no chat
call.
Sources: the areas spec on the legacy branch of Genterai/specs (archive); `src/area-recipe.js`, `src/plain.js`.

## Red lines

* **[read-no-model]** A plain read is described from its own text: no chat call, only embeddings, its sections as
  items.
* **[no-trigger-asked]** A plain read asks no model for a trigger.
* **[no-model-stays]** An anchor described from its text stays so when it runs again changed.
* **[list-is-read]** A list whose items mostly carry a long text (up to 100 items) is read once, plainly, as the
  area's one anchor, one section per item; no item is read on its own.
* **[recipe-per-app]** How an area is listed and read is kept per app with no data: the area's own values become
  placeholders, values the tool offers stay, nothing else is kept.
