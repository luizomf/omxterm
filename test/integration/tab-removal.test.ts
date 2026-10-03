import { buildFixture } from "../fixtures/tab-removal-build";
import { createRequire } from "node:module";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyChromiumSandboxPolicy } from "../../src/main/chromium-sandbox-policy";
import {
  runNativeFixture,
  type NativeFixtureTestContext,
} from "../fixtures/run-native-fixture";
import {
  TAB_REMOVAL_PHASE_PREFIX,
  TAB_REMOVAL_CONTROL_PREFIX,
  type TabRemovalDiagnostic,
} from "../fixtures/tab-removal-readiness";

const executable = createRequire(import.meta.url)("electron") as string;
const prefix = "__OMXTERM_TAB_REMOVAL_RESULT__";
async function runRemoval(
  testContext: NativeFixtureTestContext,
  control?: string,
) {
  testContext.signal.throwIfAborted();
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-tab-removal-"));
  let supervised = false;
  try {
    testContext.signal.throwIfAborted();
    const args: string[] = [];
    applyChromiumSandboxPolicy({
      appendSwitch: (name) => {
        args.push(`--${name}`);
      },
    });
    if (process.platform === "linux") args.push("--ozone-platform=x11");
    supervised = true;
    const execution = await runNativeFixture({
      executable,
      args: [
        ...args,
        root,
        ...(control ? [`--tab-removal-control=${control}`] : []),
      ],
      root,
      timeout: 90_000,
      testContext,
      prepare: () => buildFixture(root, "runner"),
    });
    await expect(stat(root)).rejects.toMatchObject({ code: "ENOENT" });
    const phases = execution.stdout
      .split("\n")
      .filter((l) => l.startsWith(TAB_REMOVAL_PHASE_PREFIX))
      .map(
        (l) =>
          JSON.parse(
            l.slice(TAB_REMOVAL_PHASE_PREFIX.length),
          ) as TabRemovalDiagnostic,
      );
    const controls = execution.stdout
      .split("\n")
      .filter((l) => l.startsWith(TAB_REMOVAL_CONTROL_PREFIX));
    return { execution, phases, controls };
  } finally {
    if (!supervised) await rm(root, { recursive: true, force: true });
  }
}

describe.skipIf(!["darwin", "linux", "win32"].includes(process.platform))(
  "Background tab removal through real Electron, Surfaces and PTYs",
  () => {
    // A tuple keeps the undefined case's original %s title: it.for treats a
    // bare undefined row as an empty list of formatting arguments.
    it.for([[undefined], ["held-surface"]] as const)(
      "keeps A selected and receiving Paste, native keyboard and Snippet after ordinary C exit (%s)",
      { timeout: 110_000 },
      async ([control], testContext) => {
        const { execution, phases, controls } = await runRemoval(
          testContext,
          control,
        );
        expect(
          execution,
          `Tab removal fixture failed.\nstdout:\n${execution.stdout}\nstderr:\n${execution.stderr}`,
        ).toMatchObject({
          exitCode: 0,
          signal: null,
          reason: "exit",
          cleanupErrors: [],
        });
        const result = execution.stdout
          .split("\n")
          .find((l) => l.startsWith(prefix));
        expect(result).toBeDefined();
        expect(JSON.parse(result!.slice(prefix.length)) as unknown).toEqual({
          preservedSelection: true,
          sameSurfaces: true,
          paste: true,
          nativeKeyboard: true,
          snippet: true,
          backgroundIsolated: true,
        });
        expect(phases.some((p) => p.status === "failure")).toBe(false);
        expect(phases.at(-1)).toMatchObject({
          phase: "verification",
          status: "complete",
        });
        for (const phase of [
          "initial-selection",
          "initial-renderer-boundary",
        ]) {
          expect(
            phases.find((p) => p.phase === phase && p.status === "complete"),
          ).toMatchObject({
            category: "none",
            observation: {
              sessionCount: 1,
              initialSelected: true,
              backgroundExited: false,
            },
          });
        }
        if (control === "held-surface") {
          expect(controls).toEqual(
            [
              "actual-surface-held",
              "readiness-pending",
              "surface-released",
            ].map((n) => TAB_REMOVAL_CONTROL_PREFIX + n),
          );
        }
      },
    );
    it.for([
      {
        control: "early-command",
        phase: "second-program",
        markers: [
          "actual-surface-held",
          "early-command-observed",
          "surface-released",
        ],
      },
      {
        control: "held-renderer",
        phase: "initial-renderer-boundary",
        markers: ["held-renderer-boundary"],
      },
    ])(
      "bounds the faithful $control failure at $phase",
      { timeout: 110_000 },
      async ({ control, phase, markers }, testContext) => {
        const { execution, phases, controls } = await runRemoval(
          testContext,
          control,
        );
        expect(execution).toMatchObject({
          exitCode: 1,
          reason: "exit",
          signal: null,
          cleanupErrors: [],
        });
        expect(execution.stdout).not.toContain(prefix);
        expect(controls).toEqual(
          markers.map((n) => TAB_REMOVAL_CONTROL_PREFIX + n),
        );
        expect(phases.filter((p) => p.status === "failure")).toHaveLength(1);
        expect(phases.at(-1)).toMatchObject({
          phase,
          status: "failure",
          category: "operation-timeout",
          observation: {
            sessionCount: 1,
            initialSelected: true,
            backgroundExited: false,
            native: { visible: true, minimized: false },
          },
        });
        expect(execution.stderr).toContain(`operation-timeout at ${phase}`);
      },
    );
  },
);
