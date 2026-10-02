import { createRequire } from "node:module";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { buildHostFixture } from "../fixtures/restty-host-build";
import { runNativeFixture } from "../fixtures/run-native-fixture";
import { supportedFixtureChromiumArguments } from "../fixtures/supported-fixture-chromium-arguments";
import { removeFailedFixture } from "../fixtures/remove-failed-fixture";
import { HOVER_PHASE_PREFIX } from "../fixtures/restty-hover";
import {
  HOVER_CONTROL_PREFIX,
  type HoverControl,
} from "../fixtures/restty-hover-control";
import type {
  HoverDraw,
  HoverGeometry,
  HoverPixels,
} from "../fixtures/restty-hover-evidence";

interface Phase {
  readonly phase: string;
  readonly category: string;
  readonly preparation: {
    readonly exactContent: boolean;
    readonly gridMatches: boolean;
    readonly deviceCellSize: readonly [number, number];
  };
  readonly latest: {
    readonly canvasId: number;
    readonly geometry: HoverGeometry;
    readonly draw: HoverDraw;
    readonly events: readonly {
      type: string;
      trusted: boolean;
      modified: boolean;
    }[];
  };
  readonly pixels?: HoverPixels;
}
async function runHover(dpr: number, control: HoverControl) {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-hover-"));
  await buildHostFixture(root, { focusedCancellation: true });
  let supervised = false;
  try {
    const executable = createRequire(import.meta.url)("electron") as string;
    supervised = true;
    const result = await runNativeFixture({
      executable,
      args: [
        ...supportedFixtureChromiumArguments(),
        `--force-device-scale-factor=${dpr}`,
        root,
        `--hover-control=${control}`,
      ],
      root,
      timeout: 60_000,
    });
    await expect(stat(root)).rejects.toMatchObject({ code: "ENOENT" });
    const phases = result.stdout
      .split("\n")
      .filter((line) => line.startsWith(HOVER_PHASE_PREFIX))
      .map(
        (line) => JSON.parse(line.slice(HOVER_PHASE_PREFIX.length)) as Phase,
      );
    return { result, phases };
  } catch (error) {
    if (!supervised) await removeFailedFixture(root, error);
    throw error;
  }
}

it.each([1, 1.5, 2])(
  "checks all native hover cells/complement/unused edges and release at DPR %s with fractional geometry",
  async (dpr) => {
    const { result, phases } = await runHover(dpr, "ordinary");
    expect(result, result.stderr).toMatchObject({
      exitCode: 0,
      reason: "exit",
      cleanupErrors: [],
    });
    expect(
      phases.slice(0, 3).map(({ phase, category }) => ({ phase, category })),
    ).toEqual([
      { phase: "baseline", category: "none" },
      { phase: "modified", category: "none" },
      { phase: "released", category: "none" },
    ]);
    const modified = phases[1]!;
    expect(modified.latest.geometry.dpr).toBe(dpr);
    expect(modified.preparation).toEqual({
      exactContent: true,
      gridMatches: true,
      deviceCellSize: [
        modified.latest.geometry.cellWidth,
        modified.latest.geometry.cellHeight,
      ],
    });
    expect(result.stdout).not.toContain("https://example.test");
    expect(Number.isInteger(modified.latest.geometry.canvas.width)).toBe(false);
    expect(Number.isInteger(modified.latest.geometry.canvas.height)).toBe(
      false,
    );
    expect(modified.pixels!.expectedCells).toBeGreaterThan(
      modified.latest.geometry.cols,
    );
    expect(modified.pixels).toMatchObject({
      missingCells: 0,
      complement: 0,
      unusedEdges: 0,
      mismatches: [],
    });
    expect(modified.pixels!.total).toBeGreaterThan(10);
    expect(phases[2]!.pixels).toMatchObject({
      total: 0,
      complement: 0,
      unusedEdges: 0,
    });
    expect(phases[4]!.latest.geometry.canvas.width).toBeGreaterThan(
      modified.latest.geometry.canvas.width,
    );
    expect(phases.every((phase) => phase.category === "none")).toBe(true);
    for (const phase of phases.filter((phase) => phase.phase === "released"))
      expect(phase.pixels!.total).toBe(0);
    expect(result.stdout).toContain("__OMXTERM_HOVER_RESULT__");
  },
  90_000,
);

it("waits for the actual late native frame continuation without treating draw as pixel success", async () => {
  const { result, phases } = await runHover(1, "late-frame");
  expect(result, result.stderr).toMatchObject({
    exitCode: 0,
    reason: "exit",
    cleanupErrors: [],
  });
  expect(result.stdout).toContain(HOVER_CONTROL_PREFIX + "late-frame");
  expect(phases[1]).toMatchObject({
    phase: "modified",
    category: "none",
    pixels: { missingCells: 0, complement: 0, unusedEdges: 0 },
  });
  expect(
    phases[1]!.latest.draw.drawAt - phases[1]!.latest.draw.setAt,
  ).toBeGreaterThan(100);
  expect(phases[2]!.pixels!.total).toBe(0);
}, 90_000);

it.each([
  "early-capture",
  "output-invalidation",
  "native-invalidation",
] as const)(
  "rejects actual hover control %s with distinct retained metadata",
  async (control) => {
    const { result, phases } = await runHover(1, control);
    expect(result, result.stderr).toMatchObject({
      exitCode: 1,
      reason: "exit",
      cleanupErrors: [],
    });
    expect(result.stdout).toContain(HOVER_CONTROL_PREFIX + control);
    expect(result.stdout).not.toContain("__OMXTERM_HOVER_RESULT__");
    const failed = phases.at(-1)!;
    expect(failed).toMatchObject({
      phase: "modified",
      category:
        control === "early-capture" ? "cue-not-drawn" : "stimulus-invalidated",
      pixels: { total: 0, complement: 0, unusedEdges: 0 },
    });
    expect(failed.pixels!.missingCells).toBe(failed.pixels!.expectedCells);
    if (control === "early-capture") {
      expect(failed.latest.draw.cells).toBeGreaterThan(0);
      expect(failed.latest.draw.drawRevision).toBeLessThan(
        failed.latest.draw.revision,
      );
    } else expect(failed.latest.draw).toMatchObject({ cells: 0, drawCells: 0 });
    if (control === "native-invalidation")
      expect(
        failed.latest.events.some(
          (event) =>
            event.type === "pointermove" && event.trusted && !event.modified,
        ),
      ).toBe(true);
  },
  90_000,
);
