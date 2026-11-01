import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url);
const executable =
  "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
const script = "C:\\fixture directory\\snippets-windows-input.ps1";

function fixture(
  stuckRelease = false,
  fault?: "foreground" | "owner" | "post-unknown",
) {
  const root = mkdtempSync(path.join(os.tmpdir(), "snippets-input-test-"));
  const marker = path.join(root, "unsettled.json");
  let down = false;
  let released = false;
  const calls: { executable: string; args: string[] }[] = [];
  const execute = (command: string, args: string[]) => {
    calls.push({ executable: command, args });
    const operation = args.at(-1)!;
    if (operation === "down" || operation === "repeat") down = true;
    if (operation === "down" && fault === "post-unknown")
      throw new Error("transport interrupted after send");
    if (operation === "up") {
      released = true;
      if (!stuckRelease) down = false;
    }
    return JSON.stringify({
      operation,
      handle: "123",
      owner: fault === "owner" ? 43 : 42,
      foreground: fault !== "foreground",
      down: stuckRelease && released ? true : down,
      ...(operation === "state" ? {} : { sent: 1 }),
    });
  };
  const { openWindowsInput } =
    require("../fixtures/snippets-windows-input.cjs") as {
      openWindowsInput(
        options: object,
        runtime: { execFileSync: typeof execute },
      ): {
        down(): void;
        repeat(): void;
        up(): void;
        close(options?: { scenarioFailed: boolean }): void;
      };
    };
  return {
    root,
    marker,
    calls,
    input: openWindowsInput(
      { executable, script, marker, handle: "123", owner: 42 },
      { execFileSync: execute },
    ),
  };
}

it("uses literal arguments and independently observes held and released state for each gesture", async () => {
  const f = fixture();
  const { finalizeScenarioInput } =
    require("../fixtures/snippets-scenario.cjs") as {
      finalizeScenarioInput(
        quartz: undefined,
        input: typeof f.input,
        failed: boolean,
        failure: unknown,
      ): Promise<void>;
    };
  try {
    f.input.down();
    expect(existsSync(f.marker)).toBe(true);
    f.input.repeat();
    f.input.up();
    f.input.down();
    f.input.up();
    await finalizeScenarioInput(undefined, f.input, false, undefined);
    expect(existsSync(f.marker)).toBe(false);
    expect(f.calls.map((call) => call.args.at(-1))).toEqual([
      "state",
      "down",
      "state",
      "state",
      "repeat",
      "state",
      "up",
      "state",
      "state",
      "down",
      "state",
      "state",
      "up",
      "state",
      "state",
    ]);
    for (const call of f.calls) {
      expect(call.executable).toBe(executable);
      expect(call.args.slice(0, -1)).toEqual([
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "RemoteSigned",
        "-File",
        script,
        "-Handle",
        "123",
        "-Owner",
        "42",
        "-Operation",
      ]);
    }
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

it("preserves an observed release when the scenario fails after the gesture", async () => {
  const f = fixture();
  const original = new Error("Chromium repeat observation failed");
  let scenarioFailure: unknown;
  try {
    const { withGestureRelease, finalizeScenarioInput } =
      require("../fixtures/snippets-scenario.cjs") as {
        withGestureRelease(
          action: () => Promise<void>,
          release: () => void,
        ): Promise<void>;
        finalizeScenarioInput(
          quartz: undefined,
          input: typeof f.input,
          failed: boolean,
          failure: unknown,
        ): Promise<void>;
      };
    await expect(
      (async () => {
        try {
          f.input.down();
          await withGestureRelease(
            async () => {
              f.input.repeat();
              throw original;
            },
            () => f.input.up(),
          );
        } catch (error) {
          scenarioFailure = error;
          throw error;
        } finally {
          await finalizeScenarioInput(
            undefined,
            f.input,
            scenarioFailure !== undefined,
            scenarioFailure,
          );
        }
      })(),
    ).rejects.toBe(original);
    expect(existsSync(f.marker)).toBe(true);
    const receipt = JSON.parse(readFileSync(f.marker, "utf8")) as {
      scenarioFailed: boolean;
      observations: { operation: string; down: boolean }[];
    };
    expect(receipt.scenarioFailed).toBe(true);
    const up = receipt.observations.findLastIndex(
      (entry) => entry.operation === "up",
    );
    expect(up).toBeGreaterThanOrEqual(0);
    expect(receipt.observations.slice(up + 1)).toContainEqual(
      expect.objectContaining({ operation: "state", down: false }),
    );
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

it("preserves both the scenario and release failures and retries cleanup", async () => {
  const f = fixture(true);
  const primary = new Error("Chromium repeat observation failed");
  const { withGestureRelease, finalizeScenarioInput } =
    require("../fixtures/snippets-scenario.cjs") as {
      withGestureRelease(
        action: () => Promise<void>,
        release: () => void,
      ): Promise<void>;
      finalizeScenarioInput(
        quartz: undefined,
        input: typeof f.input,
        failed: boolean,
        failure: unknown,
      ): Promise<void>;
    };
  try {
    f.input.down();
    const result = await withGestureRelease(
      async () => {
        f.input.repeat();
        throw primary;
      },
      () => f.input.up(),
    ).catch((error: unknown) => error);
    expect(result).toBeInstanceOf(AggregateError);
    expect((result as AggregateError).errors[0]).toBe(primary);
    expect((result as AggregateError).errors[1]).toBeInstanceOf(Error);
    const finalFailure = await finalizeScenarioInput(
      undefined,
      f.input,
      true,
      result,
    ).catch((error: unknown) => error);
    expect(finalFailure).toBeInstanceOf(AggregateError);
    const finalErrors = (finalFailure as AggregateError).errors;
    expect(finalErrors[0]).toBe(result);
    expect(finalErrors[1]).toBeInstanceOf(AggregateError);
    expect((finalErrors[1] as AggregateError).errors[0]).toBe(
      (result as AggregateError).errors[1],
    );
    expect((finalErrors[1] as AggregateError).errors[1]).toBeInstanceOf(Error);
    expect(f.calls.filter((call) => call.args.at(-1) === "up")).toHaveLength(2);
    const receipt = JSON.parse(readFileSync(f.marker, "utf8")) as {
      scenarioFailed: boolean;
      observations: { operation: string; down: boolean }[];
    };
    expect(receipt.scenarioFailed).toBe(true);
    expect(receipt.observations.at(-1)).toMatchObject({
      operation: "state",
      down: true,
    });
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

it("retains an unsettled receipt and refuses success when release is not observed", () => {
  const f = fixture(true);
  try {
    f.input.down();
    expect(() => f.input.up()).toThrow();
    expect(() => f.input.close()).toThrow();
    expect(existsSync(f.marker)).toBe(true);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

it.each(["foreground", "owner"] as const)(
  "refuses an unrelated %s before sending input",
  (fault) => {
    const f = fixture(false, fault);
    try {
      expect(() => f.input.down()).toThrow();
      expect(f.calls.map((call) => call.args.at(-1))).toEqual(["state"]);
      expect(existsSync(f.marker)).toBe(false);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  },
);

it("preserves uncertain input after a post may have succeeded", () => {
  const f = fixture(false, "post-unknown");
  try {
    expect(() => f.input.down()).toThrow("transport interrupted");
    expect(() => f.input.close()).toThrow();
    expect(existsSync(f.marker)).toBe(true);
    expect(f.calls.some((call) => call.args.at(-1) === "up")).toBe(true);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
