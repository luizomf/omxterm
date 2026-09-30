import * as childProcess from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runNativeFixture } from "../fixtures/run-native-fixture";

vi.mock("node:child_process", { spy: true });

const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
const completed = {
  exitCode: 7,
  signal: null,
  reason: "exit",
  stdout: "synthetic stdout\n",
  stderr: "synthetic stderr\n",
  cleanupErrors: ["synthetic cleanup failure"],
  ownedProcesses: [{ pid: 42, parent: 1, identity: "456" }],
};
let root: string;
let evidencePath: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "omxterm-outcome-"));
  evidencePath = path.join(root, "outcome.json");
  // Start the native build service before selecting the Windows caller path.
  await build({ stdin: { contents: "" }, write: false });
  Object.defineProperty(process, "platform", { value: "win32" });
  // Only WMI creation/inventory and process liveness are simulated. Building,
  // the initial ENOENT, publication and final read use the real filesystem.
  vi.mocked(childProcess.execFileSync).mockImplementation((_file, args) =>
    String(args?.at(-1)).includes("Invoke-CimMethod")
      ? "987654\n"
      : JSON.stringify([{ pid: process.pid, parent: 1, identity: "123" }]),
  );
});
afterEach(async () => {
  vi.restoreAllMocks();
  Object.defineProperty(process, "platform", platform);
  await rm(root, { recursive: true, force: true });
});

function run() {
  return runNativeFixture({
    executable: process.execPath,
    args: [],
    root,
    evidencePath,
    timeout: 1_000,
  });
}

function disappear(publish?: string) {
  vi.spyOn(process, "kill").mockImplementation(() => {
    if (publish !== undefined) writeFileSync(evidencePath, publish);
    throw Object.assign(new Error("Supervisor exited"), { code: "ESRCH" });
  });
}

describe("Windows fixture bootstrap ownership", () => {
  it("publishes pending ownership before an interruptible spawn, retaining an unproven synchronous failure", async () => {
    writeFileSync(path.join(root, "supervisor-ready"), "ready\n");
    vi.spyOn(process, "kill").mockReturnValue(true);
    vi.mocked(childProcess.spawn).mockImplementation(() => {
      expect(existsSync(path.join(root, "native-bootstrap-pending"))).toBe(
        true,
      );
      throw new Error("interrupted native spawn");
    });
    await expect(run()).rejects.toThrow("interrupted native spawn");
    expect(existsSync(path.join(root, "native-bootstrap-pending"))).toBe(true);
    expect(existsSync(path.join(root, "native-process.json"))).toBe(false);
    expect(existsSync(path.join(root, "native-exit.json"))).toBe(false);
  });
});

describe("Windows fixture outcome observation", () => {
  it("returns completed failure and cleanup metadata published after the initial missing read", async () => {
    disappear(JSON.stringify(completed));
    await expect(run()).resolves.toEqual(completed);
  });

  it("preserves timeout and signal failure even when cleanup succeeded", async () => {
    const outcome = {
      ...completed,
      exitCode: null,
      signal: "SIGTERM",
      reason: "timeout",
      cleanupErrors: [],
    };
    disappear(JSON.stringify(outcome));
    await expect(run()).resolves.toEqual(outcome);
  });

  it.each(["initial", "final"])(
    "rejects incomplete evidence on the %s read, not inferring success from file presence",
    async (stage) => {
      const invalid = JSON.stringify({ reason: "exit", exitCode: 0 });
      if (stage === "initial") writeFileSync(evidencePath, invalid);
      else disappear(invalid);
      await expect(run()).rejects.toThrow(
        "Invalid native fixture supervisor outcome",
      );
    },
  );

  it.each([
    null,
    { ...completed, exitCode: "0" },
    { ...completed, signal: "not-a-signal" },
    { ...completed, cleanupErrors: [0] },
    { ...completed, stdout: null },
  ])("rejects invalid final outcome %j", async (invalid) => {
    disappear(JSON.stringify(invalid));
    await expect(run()).rejects.toThrow(
      "Invalid native fixture supervisor outcome",
    );
  });

  it("preserves a final supervisor error instead of reporting missing evidence", async () => {
    disappear(
      JSON.stringify({
        reason: "supervisor-error",
        error: "synthetic failure",
      }),
    );
    await expect(run()).rejects.toThrow(
      'Native fixture supervisor failed: {"reason":"supervisor-error","error":"synthetic failure"}',
    );
  });

  it.each([undefined, "{"])(
    "fails when final evidence is missing or partial (%s)",
    async (text) => {
      disappear(text);
      await expect(run()).rejects.toThrow(
        "Native fixture supervisor disappeared without an outcome",
      );
    },
  );

  it("fails at the unchanged deadline while the supervisor is still alive without evidence", async () => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    vi.spyOn(process, "kill").mockImplementation(() => {
      now = 16_000;
      return true;
    });
    await expect(run()).rejects.toThrow(
      "Native fixture supervisor returned no outcome",
    );
  });
});
