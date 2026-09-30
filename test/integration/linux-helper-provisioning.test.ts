import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { provisionLinuxHelper } from "../../scripts/verify-packaged-app.mjs";
import { cleanupInstallerProcess } from "../fixtures/cleanup-installer-process";

describe.skipIf(process.platform !== "linux")(
  "Linux helper provisioning outer deadline",
  () => {
    it.each([
      "TERM during helper",
      "TERM during cleanup",
      "deadline during cleanup",
    ])(
      "preserves %s while finishing owned cleanup",
      async (mode) => {
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
const pidFile = path.join(process.env.HOME, 'pid');
if (process.argv[2] === 'cleanup') {
  require('node:child_process').spawn(process.execPath, [__filename, 'descendant'], {stdio: 'ignore'});
  const timer = setInterval(() => { if (fs.existsSync(pidFile)) { clearInterval(timer); process.exit(0); } }, 10);
} else {
  process.on('SIGTERM', () => {
    if (process.argv[2] === 'descendant') {
      fs.writeFileSync(path.join(process.env.HOME, 'cleanup-ready'), 'ready');
      setTimeout(() => process.exit(0), 1000);
    }
  });
  fs.writeFileSync(pidFile, String(process.pid));
  setInterval(() => {}, 1000);
}
`,
        );
        await writeFile(
          helper,
          `#!/bin/sh\nexec '${process.execPath}' '${runtime}' "$@"\n`,
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
try { await provisionLinuxHelper(process.argv[1], [process.argv[3]], process.argv[2], { timeoutMs: Number(process.argv[4]) }); }
catch (error) { console.error(error.message); process.exitCode = 1; }
`,
            helper,
            root,
            mode === "TERM during helper" ? "helper" : "cleanup",
            mode === "deadline during cleanup" ? "500" : "60000",
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
          if (mode === "TERM during cleanup") {
            while (true) {
              try {
                await readFile(path.join(root, "cleanup-ready"));
                break;
              } catch {
                /* Wait for actual group cleanup to start. */
              }
              if (Date.now() > readyDeadline)
                throw new Error("group cleanup did not start");
              await new Promise((resolve) => setTimeout(resolve, 20));
            }
          }
          if (mode !== "deadline during cleanup") driver.kill("SIGTERM");
          const result = await Promise.race([
            outcome,
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () =>
                  reject(new Error("interrupted verifier did not complete")),
                6000,
              );
            }),
          ]);
          expect(result[0]).toBe(1);
          const failure =
            mode === "deadline during cleanup"
              ? "outer deadline exceeded"
              : "interrupted by SIGTERM";
          expect(stderr).toContain(failure);
          expect(stderr).toContain("recovery state retained");
          expect(() => process.kill(pid, 0)).toThrow();
          expect(
            await readFile(
              path.join(root, "helper-provisioning-result.json"),
              "utf8",
            ),
          ).toContain(failure);
        } finally {
          clearTimeout(timer);
          if (driver.exitCode === null && driver.signalCode === null) {
            driver.kill("SIGKILL");
            await outcome;
          }
          await cleanupInstallerProcess(root, path.join(root, "pid"), runtime);
        }
      },
      10_000,
    );
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
          await cleanupInstallerProcess(root, path.join(home, "pid"), runtime);
        }
      },
      10_000,
    );
  },
);
