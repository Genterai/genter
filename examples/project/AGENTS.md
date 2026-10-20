<!-- Paste into your AGENTS.md or CLAUDE.md. -->

## Finding things

Before answering a question about this project, or changing code you have not read, ask Genter (its `search` tool;
`genter_find` in genter-cli 0.3) in plain words, in any language: it returns the passages that answer, read just now,
with `path:lines`, and marks a place that says it was replaced. Cite those places; `read` reads one whole by its id.
Use `grep` for an exact name you already know. When the person decides something worth keeping (a convention, a
preference, why we did it this way), keep it in their notes with `npx genter-cli remember "<the decision>"`.
