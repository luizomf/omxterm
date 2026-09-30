import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { provisionLinuxHelper } from "../../scripts/verify-packaged-app.mjs";

describe.skipIf(process.platform !== "linux")(
  "Linux helper provisioning outer deadline",
  () => {
    it("handles a real verifier TERM without abandoning its owned helper", async () => {
      const root = await mkdtemp(
        path.join(tmpdir(), "omxterm-provisioning-signal-"),
      );
      const runtime = path.join(root, "runtime.cjs");
      const helper = path.join(root, "helper");
      await writeFile(
        runtime,
        `
const fs = require('node:fs');
const path = require('node:path');
process.on('SIGTERM', () => {});
fs.writeFileSync(path.join(process.env.HOME, 'pid'), String(process.pid));
setInterval(() => {}, 1000);
`,
      );
      await writeFile(
        helper,
        `#!/bin/sh\nexec '${process.execPath}' '${runtime}'\n`,
        { mode: 0o755 },
      );
      const moduleUrl = pathToFileURL(
        path.resolve(
          import.meta.dirname,
          "../../scripts/verify-packaged-app.mjs",
        ),
      ).href;
      const driver = spawn(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `
import { provisionLinuxHelper } from ${JSON.stringify(moduleUrl)};
try { await provisionLinuxHelper(process.argv[1], [], process.argv[2]); }
catch (error) { console.error(error.message); process.exitCode = 1; }
`,
          helper,
          root,
        ],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
      let stderr = "";
      driver.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      const outcome = once(driver, "exit");
      let timer: NodeJS.Timeout | undefined;
      try {
        const readyDeadline = Date.now() + 3000;
        let pid = 0;
        while (!pid) {
          try {
            pid = Number(await readFile(path.join(root, "pid"), "utf8"));
          } catch {
            /* Wait for the owned helper readiness file. */
          }
          if (Date.now() > readyDeadline)
            throw new Error("helper did not start");
          if (!pid) await new Promise((resolve) => setTimeout(resolve, 20));
        }
        driver.kill("SIGTERM");
        const result = await Promise.race([
          outcome,
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error("interrupted verifier did not complete")),
              6000,
            );
          }),
        ]);
        expect(result[0]).toBe(1);
        expect(stderr).toContain("interrupted by SIGTERM");
        expect(stderr).toContain("recovery state retained");
        expect(() => process.kill(pid, 0)).toThrow();
        expect(
          await readFile(
            path.join(root, "helper-provisioning-result.json"),
            "utf8",
          ),
        ).toContain("interrupted by SIGTERM");
      } finally {
        clearTimeout(timer);
        if (driver.exitCode === null && driver.signalCode === null) {
          driver.kill("SIGKILL");
          await outcome;
        }
        await rm(root, { recursive: true, force: true });
      }
    }, 10_000);
    it.each(["timeout", "nonzero", "success"])(
      "preserves the real helper %s outcome without retry",
      async (mode) => {
        const root = await mkdtemp(
          path.join(tmpdir(), "omxterm-provisioning-test-"),
        );
        const home = path.join(root, "home");
        await mkdir(home);
        const runtime = path.join(root, "runtime.cjs");
        const helper = path.join(root, "helper");
        await writeFile(
          helper,
          `#!/bin/sh\nexec '${process.execPath}' '${runtime}' "$@"\n`,
          { mode: 0o755 },
        );
        await writeFile(
          runtime,
          `
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.HOME;
fs.appendFileSync(path.join(root, 'runs'), 'once\\n');
fs.writeFileSync(path.join(root, 'pid'), String(process.pid));
console.log('helper-output');
console.error('helper-diagnostic');
if (process.argv[2] === 'timeout') {
  process.on('SIGTERM', () => fs.writeFileSync(path.join(root, 'term'), 'TERM_OBSERVED'));
  setInterval(() => {}, 1000);
} else process.exit(process.argv[2] === 'nonzero' ? 37 : 0);
`,
        );
        try {
          const started = Date.now();
          const result = provisionLinuxHelper(helper, [mode], home, {
            timeoutMs: 500,
          });
          if (mode === "success") {
            await expect(result).resolves.toEqual({
              stdout: "helper-output\n",
              stderr: "helper-diagnostic\n",
            });
          } else {
            await expect(result).rejects.toThrow(
              mode === "timeout"
                ? "outer deadline exceeded"
                : "Linux helper failed",
            );
            if (mode === "nonzero") {
              await expect(result).rejects.toMatchObject({
                errors: [{ code: 37 }],
              });
            }
            const evidence = JSON.parse(
              await readFile(
                path.join(home, "helper-provisioning-result.json"),
                "utf8",
              ),
            ) as { stdout: string; stderr: string };
            expect(evidence.stdout).toBe("helper-output\n");
            expect(evidence.stderr).toBe("helper-diagnostic\n");
          }
          expect(Date.now() - started).toBeLessThan(6000);
          expect(await readFile(path.join(home, "runs"), "utf8")).toBe(
            "once\n",
          );
          if (mode === "timeout")
            expect(await readFile(path.join(home, "term"), "utf8")).toBe(
              "TERM_OBSERVED",
            );
          const pid = Number(await readFile(path.join(home, "pid"), "utf8"));
          expect(() => process.kill(pid, 0)).toThrow();
        } finally {
          await rm(root, { recursive: true, force: true });
        }
      },
      10_000,
    );
  },
);
