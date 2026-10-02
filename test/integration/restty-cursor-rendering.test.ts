import { buildFixture } from "../fixtures/restty-cursor-rendering-build";
import { createRequire } from "node:module";
import { mkdtemp, stat } from "node:fs/promises";
import { removeFailedFixture } from "../fixtures/remove-failed-fixture";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, it } from "vitest";
import { runNativeFixture } from "../fixtures/run-native-fixture";
import {
  CURSOR_PHASE_PREFIX,
  type CursorDiagnostic,
} from "../fixtures/restty-cursor-readiness";

import { observeNativeWindow } from "../fixtures/native-window-observation";
import {
  nativeWindowDiscoveryTimeout,
  rejectLegacyNativeWindowDeclarations,
} from "../fixtures/window-policy";

async function runCursor(dpr: number, control?: string) {
  rejectLegacyNativeWindowDeclarations();
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-cursor-"));
  await buildFixture(root);
  let supervised = false;
  try {
    const executable = createRequire(import.meta.url)("electron") as string;
    supervised = true;
    const result = await runNativeFixture({
      executable,
      args: [
        `--force-device-scale-factor=${dpr}`,
        ...(process.platform === "linux"
          ? ["--no-sandbox", "--ozone-platform=x11"]
          : []),
        root,
        ...(control ? [`--fixture-cursor-control=${control}`] : []),
      ],
      root,
      timeout: 90_000,
    });
    const phases = result.stdout
      .split("\n")
      .filter((line) => line.startsWith(CURSOR_PHASE_PREFIX))
      .map(
        (line) =>
          JSON.parse(
            line.slice(CURSOR_PHASE_PREFIX.length),
          ) as CursorDiagnostic,
      );
    await expect(stat(root)).rejects.toMatchObject({ code: "ENOENT" });
    return { result, phases };
  } catch (error) {
    if (!supervised) await removeFailedFixture(root, error);
    throw error;
  }
}

it.each([1, 2])(
  "keeps native WebGL cursor pixels inside the first cell at DPR %i through zoom, controlled content refit and reload",
  async (dpr) => {
    const { result, phases } = await runCursor(dpr);
    expect(result, result.stderr).toMatchObject({
      exitCode: 0,
      reason: "exit",
      cleanupErrors: [],
    });
    expect(phases.at(-1)).toMatchObject({
      status: "complete",
      category: "none",
      step: { lifecycle: "dispose", operation: "dispose", dpr },
    });
    expect(phases.some((phase) => phase.status === "failure")).toBe(false);
    const prefix = "__OMXTERM_CURSOR_RESULT__";
    const line = result.stdout
      .split("\n")
      .find((entry) => entry.startsWith(prefix));
    expect(line).toBeDefined();
    const observation = JSON.parse(line!.slice(prefix.length)) as {
      captures: { dpr: number }[];
    };
    expect(observation.captures).toHaveLength(64);
    expect(observation.captures.every((capture) => capture.dpr === dpr)).toBe(
      true,
    );
  },
  120_000,
);

it.each(["unavailable-presentation", "held-execute", "held-capture"])(
  "rejects native cursor readiness control %s with retained phase evidence and supervised cleanup",
  async (scenario) => {
    const control =
      scenario === "unavailable-presentation"
        ? await observeNativeWindow("cursor", 1)
        : scenario;
    expect([
      "early-minimize",
      "early-hide",
      "held-execute",
      "held-capture",
    ]).toContain(control);
    // Discovery has separate supervision; this still bounds only the behavior guard.
    const started = Date.now();
    const { result, phases } = await runCursor(1, control);
    const evidence = JSON.stringify({ result, phases });
    expect(result, evidence).toMatchObject({
      exitCode: 1,
      reason: "exit",
      cleanupErrors: [],
    });
    expect(Date.now() - started, evidence).toBeLessThan(20_000);
    expect(result.stdout).not.toContain("__OMXTERM_CURSOR_RESULT__");
    const capture = control === "held-capture";
    const unavailable =
      control === "early-minimize" || control === "early-hide";
    const step = {
      dpr: 1,
      font: "bundled",
      padding: 0,
      lifecycle: capture ? "initial" : "mount",
      kind: capture ? "capture" : "execute",
      operation: capture ? "hidden" : "mount",
    };
    expect(phases.at(-2), evidence).toMatchObject({
      step,
      status: "begin",
      category: "none",
    });
    expect(phases.at(-1), evidence).toMatchObject({
      step,
      status: "failure",
      category: unavailable ? "presentation-unavailable" : "operation-timeout",
      native: { minimized: control === "early-minimize" },
    });
    if (control === "early-hide") {
      expect(phases.at(-1)?.native, evidence).toMatchObject({
        visible: false,
        minimized: false,
      });
    } else if (!unavailable) {
      expect(phases.at(-1)?.native?.visible, evidence).toBe(true);
    }
    // Neither timeout nor a requested action proves the actual control was reached.
    expect(
      result.stdout
        .split("\n")
        .filter((line) => line === `__OMXTERM_CURSOR_CONTROL__${control}`),
      evidence,
    ).toHaveLength(1);
  },
  nativeWindowDiscoveryTimeout("cursor") + 120_000,
);
