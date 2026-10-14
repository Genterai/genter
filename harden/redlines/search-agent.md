# Genter's agent

Intent: Genter's own model loop finds what a task needs in the person's apps, from saved anchors first — success: a
task with a strong fit answers on the fast model from that anchor.
Sources: the search-agent spec on the legacy branch of Genterai/specs (archive); `src/agent.js`, `src/loop.js`.

## Red lines

* **[handed-before]** Anchors this chat already got (asked again) are briefed apart as "asked again, may not hold
  what is asked", never as a strong fit, and candidate tools are searched too.
* **[handed-before-strong]** Without anchors handed before, the same strong fit runs on the fast model and the
  briefing has no asked-again line.
