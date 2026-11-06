import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe.each(["cold", "warm"] as const)(
  "Snippets evidence helpers (%s Electron runtime)",
  (runtime) => {
    it("captures and retains PTY evidence without loading Electron or requesting its installer", () => {
      const scenario = new URL(
        "../fixtures/snippets-scenario.cjs",
        import.meta.url,
      ).href;
      const result = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
const require = createRequire(${JSON.stringify(scenario)});
const fs = require("node:fs");
const childProcess = require("node:child_process");
// Resolve, but do not evaluate, the pinned real Node entry point.
const index = require.resolve("electron");
const marker = path.join(path.dirname(index), "path.txt");
const executable = path.join(path.dirname(index), "dist", "controlled-electron");
let available = ${runtime === "warm"};
let installerRequests = 0;
const exists = fs.existsSync;
const read = fs.readFileSync;
fs.existsSync = (file) => file === marker || file === executable ? available : exists(file);
fs.readFileSync = (file, ...options) => {
  if (file !== marker) return read(file, ...options);
  assert.ok(available, "Controlled runtime marker is absent");
  return "controlled-electron";
};
delete process.env.ELECTRON_OVERRIDE_DIST_PATH;
// Never execute an installer or runtime, even if the fixture import regresses.
for (const method of ["spawn", "fork", "exec", "execSync", "execFile", "execFileSync"])
  childProcess[method] = () => { throw Error("Unexpected process request: " + method); };
childProcess.spawnSync = (file, args) => {
  assert.equal(file, process.execPath);
  assert.deepEqual(args, [path.join(path.dirname(index), "install.js")]);
  installerRequests++;
  available = true;
  return { status: 0 };
};
const root = fs.mkdtempSync(path.join(tmpdir(), "snippets-headless-"));
try {
  const { snapshotWindowsPtyOutput, retainWindowsPtyEvidence } = require("./snippets-scenario.cjs");
  const session = {
    pid: 123, writes: ["exact input"], output: "probe output",
    outputTruncated: false, outputLimitCodeUnits: 65536,
  };
  const snapshot = snapshotWindowsPtyOutput(session);
  session.output = "later cleanup output";
  await retainWindowsPtyEvidence(root, session, [], snapshot);
  assert.deepEqual(JSON.parse(read(path.join(root, "pty-writes.json"), "utf8")), {
    classification: "synthetic-pty-writes-not-qualification",
    pid: 123, writes: ["exact input"], checks: [],
    childOutput: {
      observation: "selected-pty-output-before-input-cleanup",
      text: "probe output", truncated: false, limitCodeUnits: 65536,
    },
  });
  console.log(JSON.stringify({ installerRequests, electronLoaded: !!require.cache[index] }));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
`,
        ],
        { encoding: "utf8", timeout: 10_000 },
      );
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      expect(result.stdout).toBe(
        `${JSON.stringify({ installerRequests: 0, electronLoaded: false })}\n`,
      );
    });
  },
);
