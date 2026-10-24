import * as childProcess from "node:child_process";
import * as filesystem from "node:fs/promises";
import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  completedFixtureOutcome,
  createNativeFixtureUnitScope,
} from "../fixtures/native-fixture-unit-scope";

vi.mock("node:child_process", { spy: true });
vi.mock("node:fs/promises", { spy: true });
vi.mock("esbuild", () => ({ build: vi.fn(async () => ({})) }));

const actual = await vi.importActual<typeof filesystem>("node:fs/promises");
const outcome = { ...completedFixtureOutcome, cleanupErrors: [] };
let root: string;
let scope: ReturnType<typeof createNativeFixtureUnitScope>;

beforeEach(async () => {
  root = await actual.mkdtemp(path.join(tmpdir(), "omxterm-unit-scope-"));
  scope = createNativeFixtureUnitScope(root);
  Object.defineProperty(process, "platform", { value: "win32" });
  vi.mocked(childProcess.execFileSync).mockImplementation((_file, args) =>
    String(args?.at(-1)).includes("Invoke-CimMethod")
      ? "987654\n"
      : JSON.stringify([{ pid: process.pid, parent: 1, identity: "123" }]),
  );
  vi.spyOn(process, "kill").mockImplementation(() => {
    throw Object.assign(new Error("Supervisor exited"), { code: "ESRCH" });
  });
});

afterEach(() => scope.teardown());

it.each(["completed", "rejected"])(
  "joins a held %s operation after test failure before restoring mocks or removing its profile",
  async (status) => {
    const evidencePath = path.join(root, "outcome.json");
    const liveness = process.kill;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let start!: () => void;
    const started = new Promise<void>((resolve) => {
      start = resolve;
    });
    let observed:
      { profile: boolean; mocks: boolean; platform: string } | undefined;
    let firstRead = true;
    vi.mocked(filesystem.readFile).mockImplementation(async (...args) => {
      if (args[0] === evidencePath && firstRead) {
        firstRead = false;
        start();
        await held;
        observed = {
          profile: existsSync(root),
          mocks: process.kill === liveness,
          platform: process.platform,
        };
        writeFileSync(
          evidencePath,
          JSON.stringify(status === "completed" ? outcome : null),
        );
      }
      return actual.readFile(...args);
    });
    const operation = scope.run({
      executable: process.execPath,
      args: [],
      root,
      evidencePath,
      timeout: 1_000,
    });
    let cleanup: Promise<void> | undefined;
    try {
      const failure = new Error("synthetic test assertion failure");
      await expect(
        (async () => {
          await started;
          throw failure;
        })(),
      ).rejects.toBe(failure);
      cleanup = scope.teardown();
      await Promise.resolve();
      expect(process.kill).toBe(liveness);
      expect(existsSync(root)).toBe(true);
    } finally {
      release();
      await Promise.allSettled([operation, cleanup]);
    }
    if (status === "completed")
      await expect(operation).resolves.toEqual(outcome);
    else
      await expect(operation).rejects.toThrow(
        "Invalid native fixture supervisor outcome",
      );
    expect(observed).toEqual({ profile: true, mocks: true, platform: "win32" });
    expect(existsSync(root)).toBe(false);
  },
);
