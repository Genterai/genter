import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocal, findText } from "./local.js";

// `genter demo`: what Genter is for, in a second, on nothing of the person's. A runbook says deploys go out on Fridays;
// the question is asked; a newer doc says no and the runbook is marked as replaced at its top, with nobody telling
// Genter; the question is asked again: the new rule first, dated, and the runbook's line after it, quoting its own
// notice. The same engine as `genter ask`, in a temp folder with a store of its own, removed after. No key, no model,
// no network, and no colors to switch off. The folder is a project of its own (a genter.json), so a temp folder that
// sits inside the person's repository never makes the demo search that repository.

const QUESTION = "Can we deploy on Friday?";
const DAY = "2026-10-03"; // the day the new doc gives itself, in its front matter
const DECIDED = "2026-03-12"; // the day the runbook gives itself: the rule was written in March
const NOTICE = "Superseded by [Release process v2](docs/release-process-v2.md)"; // as the runbook gets it, at its top

// The Friday line is in the middle of the file: whoever reads that passage never sees the top. The notice goes under
// the front matter, which is where the top of a file with one starts.
const FRONT = `---
date: ${DECIDED}
---

`;
const RUNBOOK = `# Runbook

## On call

Page the primary first. The secondary takes over after 15 minutes.
Hand over on Monday at 10:00 in #ops.

## Restarting the probes

Restart the probes one region at a time with \`beacon restart --region eu\`.

## Rolling back

Roll back with \`beacon rollback --last\`, then post in #ops.

## Database

The pooler listens on port 6432.
Migrations run by hand, one at a time, and never during a rollback.

## Alerts

A page that fires twice in an hour gets a ticket.

## Deploys

Yes, deploys go out on Fridays from the release branch.

## Access

Ask in #ops for a VPN seat. Seats are reviewed every quarter.
`;

const RELEASE_V2 = `---
date: ${DAY}
---

# Release process v2

## Who releases

The release manager cuts the release branch on Monday.
Every change is reviewed before it is tagged.

## Deploy windows

No deploys on Fridays. Deploys go out Monday to Thursday, before 15:00.
`;

export async function runDemo({ print = console.log } = {}) {
  const base = mkdtempSync(join(tmpdir(), "genter-demo-"));
  const dir = join(base, "acme");
  mkdirSync(join(dir, "docs"), { recursive: true });
  const write = (path, text) => writeFileSync(join(dir, path), text);
  write("genter.json", "{}\n"); // before createLocal: the project is found once, and this folder is its own, never a repository around it
  const g = createLocal({ home: join(base, ".genter"), secret: "demo", cwd: dir });
  const ask = async () => {
    print(`\n$ genter ask "${QUESTION}"`);
    print(findText(await g.find(QUESTION)).replace(/^(?=.)/gm, "  "));
  };
  try {
    write("RUNBOOK.md", FRONT + RUNBOOK);
    print("Genter, on a temp folder with one runbook: offline, no key, no model, nothing of yours read.");
    await ask();

    write("docs/release-process-v2.md", RELEASE_V2);
    write("RUNBOOK.md", `${FRONT}> ${NOTICE}\n\n${RUNBOOK}`);
    print(`\nThen someone adds docs/release-process-v2.md ("No deploys on Fridays", dated ${DAY}) and puts\n"Superseded by Release process v2" at the top of RUNBOOK.md. Nobody tells Genter.`);
    await ask();

    print("\nNext: npx genter-cli install   # adds Genter to your AI tools; shows each change and asks first");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}
