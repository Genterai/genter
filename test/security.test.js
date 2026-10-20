import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("nothing run", () => {
  it("[rl:security/never-run] no file of the engine can run code", () => {
    const dir = new URL("../src/", import.meta.url);
    const files = readdirSync(dir).filter((f) => f.endsWith(".js"));
    assert.ok(files.includes("local.js") && files.includes("web.js"), files.join(", "));
    for (const file of files) {
      const code = readFileSync(new URL(file, dir), "utf8");
      assert.ok(!/child_process|node:vm|\bfrom ["']vm["']|\beval\(|new Function\(|worker_threads/.test(code), `src/${file} must not run code`);
    }
  });
});
