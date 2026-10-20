import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chownSync, copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { check, setup } from "./serve-smoke.mjs";

// genter serve as a small team runs it: the image built from the Dockerfile, started by docker-compose.yml, checked by
// test/serve-smoke.mjs. It needs Docker, so it runs when GENTER_COMPOSE=1 (the serve job of .github/workflows/test.yml).
const root = fileURLToPath(new URL("..", import.meta.url));
const IMAGE_TAG = "smoke";

describe("genter serve in docker compose", { skip: process.env.GENTER_COMPOSE !== "1" && "set GENTER_COMPOSE=1 with Docker running" }, () => {
  it("[rl:serve/ac-compose] [rl:serve/image] [rl:serve/tokens] [rl:serve/same-contract] [rl:serve/read-only] [rl:serve/async-reads] [rl:security/public-only] docker compose up: health, 401 without a token, conformance over HTTP, search and read, /health while 20 searches run, the folders unchanged, a private address refused", { timeout: 600_000 }, async () => {
    const dir = mkdtempSync(join(tmpdir(), "genter-compose-"));
    const project = `genter-smoke-${process.pid}`;
    const env = { ...process.env, GENTER_VERSION: IMAGE_TAG };
    const run = (cmd, args, opts = {}) => {
      const r = spawnSync(cmd, args, { cwd: dir, env, encoding: "utf8", timeout: 300_000, ...opts });
      return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
    };
    const compose = (...args) => run("docker", ["compose", "-p", project, ...args]);
    try {
      copyFileSync(join(root, "docker-compose.yml"), join(dir, "docker-compose.yml"));
      const { tokens, repos } = setup(dir);
      // The container runs as uid 1000 (the user node): the secrets are its to read, as docs/team.md says.
      const secrets = [join(dir, "genter_tokens"), join(dir, "genter_seal")];
      if (process.getuid() === 0) for (const f of secrets) chownSync(f, 1000, 1000);
      else if (process.getuid() !== 1000) assert.equal(run("sudo", ["-n", "chown", "1000:1000", ...secrets]).code, 0, "sudo chown the secrets to uid 1000");

      const built = run("docker", ["build", "-t", `ghcr.io/genterai/genter:${IMAGE_TAG}`, root]);
      assert.equal(built.code, 0, built.out.slice(-3000));
      const up = compose("up", "-d");
      assert.equal(up.code, 0, up.out.slice(-3000));

      const checks = await check("http://127.0.0.1:8787", { token: tokens.ana, repos });
      const logs = compose("logs").out;
      assert.deepEqual(checks.filter((c) => !c.ok), [], `${JSON.stringify(checks, null, 2)}\n${logs}`);
      assert.equal(checks.length, 12);
      assert.match(logs, /serving \/repos at http:\/\/0\.0\.0\.0:8787\/mcp/);
      assert.match(logs, /2 tokens in \/run\/secrets\/genter_tokens/);
      assert.match(logs, /plain HTTP: put TLS in front of it/);
      for (const t of Object.values(tokens)) assert.ok(!logs.includes(t), "no token in the logs");
      const user = compose("exec", "-T", "genter", "id", "-u");
      assert.equal(user.out.trim(), "1000", "it runs as the user node");
      const write = compose("exec", "-T", "genter", "sh", "-c", "touch /repos/x || touch /app/x || touch /x");
      assert.notEqual(write.code, 0, "the repositories and the root filesystem are read-only");

      const refused = compose("run", "--rm", "--no-deps", "genter", "serve", "http://169.254.169.254/latest/meta-data/", "--host", "0.0.0.0");
      assert.notEqual(refused.code, 0);
      assert.match(refused.out, /169\.254\.169\.254 is not a public address: Genter reads websites at public addresses only/);
    } finally {
      compose("down", "-v");
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
