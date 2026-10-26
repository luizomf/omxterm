import {
  buildFixture,
  expectedColors,
  resultPrefix,
} from "../fixtures/restty-appearance-rendering-build";
import {
  runNativeFixture,
  type NativeFixtureTestContext,
} from "../fixtures/run-native-fixture";
import { removeFailedFixture } from "../fixtures/remove-failed-fixture";
import { createRequire } from "node:module";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { applyChromiumSandboxPolicy } from "../../src/main/chromium-sandbox-policy";

import type { PendingWrapResizeEvidence } from "../fixtures/restty-resize-regression";
import type {
  Measurement,
  SelectionObservation,
} from "../fixtures/restty-appearance-renderer";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const electronExecutable = createRequire(import.meta.url)("electron") as string;

interface Result {
  readonly pendingWrapResize: PendingWrapResizeEvidence;
  readonly selection: SelectionObservation;
  readonly controlledReadiness?: {
    readonly firstSelectionPixels: number;
    readonly firstExactCopy: boolean;
    readonly firstFrameCount: number;
    readonly heldCallbacks: number;
    readonly heldDeadlineRejected: boolean;
    readonly heldCaptures: number;
    readonly releasedCallbacks: number;
    readonly completedCallbacks: number;
    readonly finalExactCopy: boolean;
    readonly artifactDirectory: string;
  };
  readonly configuredFont: {
    readonly regularInk: number;
    readonly deferredFrame: boolean;
    readonly preservesConfiguredRendering: boolean;
  };
  readonly measurements: readonly Measurement[];
  readonly live: Measurement & {
    readonly sameCanvas: boolean;
    readonly closesBeforeDispose: number;
    readonly resizeCount: number;
    readonly containerPadding: readonly string[];
    readonly canvasCssWidth: number;
    readonly canvasCssHeight: number;
    readonly canvasBackingWidth: number;
    readonly canvasBackingHeight: number;
    readonly externalLinks: number;
  };
  readonly colorCounts: Record<string, number>;
  readonly fontRendering: {
    readonly regularInk: number;
    readonly boldInk: number;
    readonly firaCoverageInk: number;
    readonly dejaVuCoverageInk: number;
    readonly firaDiffersFromMissing: boolean;
    readonly dejaVuDiffersFromMissing: boolean;
  };
  readonly devicePixelRatio: number;
  readonly security: {
    readonly contextIsolation: boolean;
    readonly nodeIntegration: boolean;
    readonly sandbox: boolean;
    readonly webSecurity: boolean;
  };
}

describe("Restty OMXTerm appearance under production Electron policy", () => {
  it("preserves the configured palette through actual Surface OSC resets and live reload", async (testContext) => {
    const execution = await runFixture(
      testContext,
      undefined,
      false,
      false,
      false,
      true,
    );
    expect(execution, execution.stderr).toMatchObject({
      reason: "exit",
      exitCode: 0,
      cleanupErrors: [],
    });
    const line = execution.stdout
      .split("\n")
      .find((entry) => entry.startsWith(resultPrefix));
    expect(line).toBeDefined();
    expect(JSON.parse(line!.slice(resultPrefix.length))).toMatchObject({
      configuredPaletteReset: true,
      starts: 1,
      closes: 1,
      observations: [
        { phase: "initial" },
        { phase: "initial-full" },
        { phase: "live-replaces-supplied-only" },
        { phase: "split-indexed-ST" },
        { phase: "live-full-ST" },
      ],
    });
  }, 90_000);

  it("renders theme colors and preserves configured geometry through live updates", async (testContext) => {
    const runs: Array<{
      readonly label: string;
      readonly requestedScaleFactor: number | undefined;
      readonly result: Result;
    }> = [];
    for (const [
      requestedScaleFactor,
      deferFrames,
      mixedPointer,
      gateFrames,
    ] of [
      [undefined, false, false, false],
      [1, false, false, false],
      [2, false, false, false],
      [undefined, true, false, false],
      [undefined, false, true, false],
      [undefined, false, false, true],
    ] as const) {
      const execution = await runFixture(
        testContext,
        requestedScaleFactor,
        deferFrames,
        mixedPointer,
        gateFrames,
      );
      expect(execution, execution.stderr).toMatchObject({
        reason: "exit",
        cleanupErrors: [],
      });
      const line = execution.stdout
        .split("\n")
        .find((entry) => entry.startsWith(resultPrefix));
      const result = line
        ? (JSON.parse(line.slice(resultPrefix.length)) as Result)
        : undefined;
      const label = gateFrames
        ? "held Surface RAF with independent native fixture frames"
        : mixedPointer
          ? "mouse press with pen motion and compatibility mouse events"
          : deferFrames
            ? "delayed configured-font output at actual display DPR"
            : requestedScaleFactor
              ? `forced DPR ${requestedScaleFactor}`
              : "actual display DPR";

      expect(
        execution.exitCode,
        `${label} appearance fixture failed.\nstdout:\n${execution.stdout}\nstderr:\n${execution.stderr}`,
      ).toBe(0);
      expect(result, label).toBeDefined();
      runs.push({ label, requestedScaleFactor, result: result! });
    }
    const evidencePath = process.env.OMXTERM_RESTTY_APPEARANCE_EVIDENCE_PATH;
    if (evidencePath)
      await writeFile(
        evidencePath,
        `${JSON.stringify(
          {
            platform: process.platform,
            architecture: process.arch,
            runs: runs.map(({ label, requestedScaleFactor, result }) => ({
              label,
              requestedScaleFactor,
              devicePixelRatio: result.devicePixelRatio,
              measurements: result.measurements,
              pendingWrapResize: result.pendingWrapResize,
              live: result.live,
              selection: result.selection,
              controlledReadiness: result.controlledReadiness,
              colorCounts: result.colorCounts,
              configuredFont: result.configuredFont,
            })),
          },
          undefined,
          2,
        )}\n`,
      );

    const controlled = runs[5]!.result;
    expect(controlled.controlledReadiness).toMatchObject({
      firstSelectionPixels: 0,
      firstExactCopy: true,
      firstFrameCount: 2,
      heldDeadlineRejected: true,
      finalExactCopy: true,
    });
    expect(controlled.controlledReadiness!.heldCallbacks).toBeGreaterThan(0);
    expect(controlled.controlledReadiness!.heldCaptures).toBeGreaterThan(0);
    expect(controlled.controlledReadiness!.releasedCallbacks).toBe(
      controlled.controlledReadiness!.heldCallbacks,
    );
    expect(controlled.controlledReadiness!.completedCallbacks).toBe(
      controlled.controlledReadiness!.heldCallbacks,
    );
    for (const color of expectedColors)
      expect(
        controlled.colorCounts[color],
        `released gate ${color}`,
      ).toBeGreaterThan(0);

    expect(runs[1]!.result.devicePixelRatio).toBeCloseTo(1, 5);
    expect(runs[2]!.result.devicePixelRatio).toBeCloseTo(2, 5);
    for (const { result, label } of runs) {
      const wrap = result.pendingWrapResize;
      expect(wrap, label).toMatchObject({
        sameSurface: true,
        sameCanvas: true,
        starts: 1,
        closesBeforeDispose: 0,
      });
      for (const value of [
        wrap.original.cols,
        wrap.original.rows,
        wrap.resized.cols,
        wrap.resized.rows,
      ]) {
        expect(Number.isSafeInteger(value), label).toBe(true);
        expect(value, label).toBeGreaterThan(0);
      }
      expect(wrap.resized.cols, label).toBeLessThan(wrap.original.cols);
      expect(wrap.resized.rows, label).toBe(wrap.original.rows);
      expect(wrap.original.cols % wrap.resized.cols, label).not.toBe(0);
      expect(wrap.copied, label).toBe(
        "a".repeat(wrap.original.cols - 1) + "PCONTINUOU",
      );
      assertFontGeometry(result, label);
      expect(result.configuredFont.regularInk, label).toBeGreaterThan(20);
      expect(result.configuredFont.preservesConfiguredRendering, label).toBe(
        true,
      );
    }
    expect(runs[3]!.result.configuredFont.deferredFrame).toBe(true);
    for (const color of expectedColors)
      expect(
        runs[3]!.result.colorCounts[color],
        `delayed configured-font output ${color}`,
      ).toBeGreaterThan(0);
    for (const size of [1, 8, 10, 16, 64, 72]) {
      const dpr1 = fontMeasurement(runs[1]!.result, size);
      const dpr2 = fontMeasurement(runs[2]!.result, size);
      expect(
        Math.abs(
          dpr1.cellWidth / runs[1]!.result.devicePixelRatio -
            dpr2.cellWidth / runs[2]!.result.devicePixelRatio,
        ),
        `normalized CSI width at size ${size}`,
      ).toBeLessThanOrEqual(0.5);
    }

    const result = runs[0]!.result;
    const { measurements, live, devicePixelRatio } = result;
    const size8 = measurements.find((entry) => entry.size === 8)!;
    const size16 = measurements.find(
      (entry) =>
        entry.size === 16 &&
        entry.lineHeight === 1 &&
        entry.padding === 0 &&
        entry.nativeTitleInset === 0,
    )!;
    const size72 = measurements.find((entry) => entry.size === 72)!;
    const line2 = measurements.find((entry) => entry.lineHeight === 2)!;
    const padding128 = measurements.find((entry) => entry.padding === 128)!;
    const size1 = measurements.find((entry) => entry.size === 1)!;
    const titleInset = measurements.find(
      (entry) => entry.nativeTitleInset === 30,
    )!;

    expect(size8.cols).toBeGreaterThan(size16.cols);
    expect(size16.cols).toBeGreaterThan(size72.cols);
    expect(size1.cols).toBeGreaterThan(size8.cols);
    expect(size72.cellWidth).toBeGreaterThan(size16.cellWidth);
    expect(line2.cols).toBe(size16.cols);
    expect(line2.cellWidth).toBeCloseTo(size16.cellWidth, 5);
    expect(line2.cellHeight).toBeGreaterThanOrEqual(size16.cellHeight * 2 - 1);
    expect(line2.rows).toBeLessThan(size16.rows);
    expect(line2.imeFontSize).toBe(size16.imeFontSize);
    expect(padding128.cols).toBeLessThan(size16.cols);
    expect(padding128.rows).toBeLessThan(size16.rows);
    expect(titleInset.cols).toBe(size16.cols);
    expect(titleInset.rows).toBeLessThan(size16.rows);
    expect(titleInset.containerPaddingTop).toBe("30px");
    expect(measurements.every((entry) => entry.starts === 1)).toBe(true);

    expect(result!.live).toMatchObject({
      sameCanvas: true,
      starts: 1,
      closesBeforeDispose: 0,
      externalLinks: 0,
    });
    expect(result!.live.resizeCount).toBeGreaterThan(1);
    expect(result!.live.containerPadding).toEqual([
      "128px",
      "128px",
      "128px",
      "128px",
    ]);
    expect(result!.live.cols).toBe(padding128.cols);
    expect(result!.live.rows).toBe(padding128.rows);
    expect(result!.live.cellWidth).toBeCloseTo(size16.cellWidth, 5);
    expect(result!.live.cellHeight).toBe(size16.cellHeight);
    expect(result!.live.cellHeight).toBeLessThan(line2.cellHeight);
    expect(result!.live.imeFontSize).toBe(size16.imeFontSize);
    expect(live.canvasCssWidth).toBeGreaterThan(0);
    expect(live.canvasCssHeight).toBeGreaterThan(0);
    expect(devicePixelRatio).toBeGreaterThanOrEqual(1);
    expect(live.canvasBackingWidth).toBe(
      Math.max(1, Math.floor(live.canvasCssWidth * devicePixelRatio)),
    );
    expect(live.canvasBackingHeight).toBe(
      Math.max(1, Math.floor(live.canvasCssHeight * devicePixelRatio)),
    );
    for (const color of expectedColors)
      expect(result!.colorCounts[color], color).toBeGreaterThan(0);
    expect(result!.colorCounts["#201012"]).toBeGreaterThan(
      result!.colorCounts["#90105a"]!,
    );
    expect(result!.fontRendering.boldInk).toBeGreaterThan(
      result!.fontRendering.regularInk,
    );
    expect(result!.fontRendering.firaCoverageInk).toBeGreaterThan(20);
    expect(result!.fontRendering.dejaVuCoverageInk).toBeGreaterThan(20);
    expect(result!.fontRendering.firaDiffersFromMissing).toBe(true);
    expect(result!.fontRendering.dejaVuDiffersFromMissing).toBe(true);
    expect(result!.security).toEqual({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    });
  }, 240_000);
});

function fontMeasurement(result: Result, size: number): Measurement {
  return result.measurements.find(
    (entry) =>
      entry.size === size &&
      entry.lineHeight === 1 &&
      entry.padding === 0 &&
      entry.nativeTitleInset === 0,
  )!;
}

function assertFontGeometry(result: Result, label: string): void {
  const size1 = fontMeasurement(result, 1);
  const size8 = fontMeasurement(result, 8);
  const size10 = fontMeasurement(result, 10);
  const size16 = fontMeasurement(result, 16);
  const size64 = fontMeasurement(result, 64);
  const size72 = fontMeasurement(result, 72);
  const cssCellWidth = (entry: Measurement) =>
    entry.cellWidth / result.devicePixelRatio;

  expect(size1.cols, label).toBeGreaterThan(size8.cols);
  expect(size8.cols, label).toBeGreaterThan(size10.cols);
  expect(size10.cols, label).toBeGreaterThan(size16.cols);
  expect(size16.cols, label).toBeGreaterThan(size64.cols);
  expect(size64.cols, label).toBeGreaterThan(size72.cols);
  expect(cssCellWidth(size1), label).toBeLessThan(cssCellWidth(size8));
  expect(cssCellWidth(size8), label).toBeLessThan(cssCellWidth(size10));
  expect(cssCellWidth(size10), label).toBeLessThan(cssCellWidth(size16));
  expect(cssCellWidth(size16), label).toBeLessThan(cssCellWidth(size64));
  expect(cssCellWidth(size64), label).toBeLessThan(cssCellWidth(size72));
  for (const entry of result.measurements) {
    expect(entry.liveCellWidth, `${label}, size ${entry.size} live width`).toBe(
      entry.cellWidth,
    );
    expect(
      entry.liveCellHeight,
      `${label}, size ${entry.size} live height`,
    ).toBe(entry.cellHeight);
    expect(entry.liveCols, `${label}, size ${entry.size} live columns`).toBe(
      entry.cols,
    );
    expect(entry.liveRows, `${label}, size ${entry.size} live rows`).toBe(
      entry.rows,
    );
    expect(entry.starts, `${label}, size ${entry.size} readiness`).toBe(1);
    expect(entry.closes, `${label}, size ${entry.size} lifecycle`).toBe(0);
    expect(
      entry.cellWidth,
      `${label}, size ${entry.size} CSI width`,
    ).toBeGreaterThan(0);
    expect(
      entry.cellHeight,
      `${label}, size ${entry.size} CSI height`,
    ).toBeGreaterThan(0);
    const cssCellWidth = entry.cellWidth / result.devicePixelRatio;
    const cssCellHeight = entry.cellHeight / result.devicePixelRatio;
    const unusedWidth = entry.canvasCssWidth - entry.cols * cssCellWidth;
    const unusedHeight = entry.canvasCssHeight - entry.rows * cssCellHeight;
    expect(
      unusedWidth,
      `${label}, size ${entry.size} CSI backing-pixel width`,
    ).toBeGreaterThanOrEqual(-1);
    expect(
      unusedWidth,
      `${label}, size ${entry.size} CSI backing-pixel width`,
    ).toBeLessThan(cssCellWidth + 1);
    expect(
      unusedHeight,
      `${label}, size ${entry.size} CSI backing-pixel height`,
    ).toBeGreaterThanOrEqual(-1);
    expect(
      unusedHeight,
      `${label}, size ${entry.size} CSI backing-pixel height`,
    ).toBeLessThan(cssCellHeight + 1);
    expect(
      entry.canvasCssWidth,
      `${label}, size ${entry.size} CSS width`,
    ).toBeGreaterThan(0);
    expect(
      entry.canvasCssHeight,
      `${label}, size ${entry.size} CSS height`,
    ).toBeGreaterThan(0);
    // Match the renderer's floor at fractional display scales.
    expect(
      entry.canvasBackingWidth,
      `${label}, size ${entry.size} backing width`,
    ).toBe(
      Math.max(1, Math.floor(entry.canvasCssWidth * result.devicePixelRatio)),
    );
    expect(
      entry.canvasBackingHeight,
      `${label}, size ${entry.size} backing height`,
    ).toBe(
      Math.max(1, Math.floor(entry.canvasCssHeight * result.devicePixelRatio)),
    );
  }
}

async function runFixture(
  testContext: NativeFixtureTestContext,
  scaleFactor?: number,
  deferFrames = false,
  mixedPointer = false,
  gateFrames = false,
  paletteOnly = false,
) {
  testContext.signal.throwIfAborted();
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-restty-appearance-"));
  let supervised = false;
  try {
    testContext.signal.throwIfAborted();
    const chromiumArguments =
      process.platform === "linux" ? ["--ozone-platform=x11"] : [];
    applyChromiumSandboxPolicy({
      appendSwitch(name) {
        chromiumArguments.push(`--${name}`);
      },
    });
    if (scaleFactor !== undefined)
      chromiumArguments.push(`--force-device-scale-factor=${scaleFactor}`);
    supervised = true;
    return await runNativeFixture({
      executable: electronExecutable,
      args: [...chromiumArguments, root],
      root,
      timeout: 110_000,
      testContext,
      prepare: () =>
        buildFixture(root, "runner", {
          requestedDPR: scaleFactor ?? "actual",
          paletteOnly,
          deferFrames,
          mixedPointer,
          gateFrames,
          artifactDirectory: path.join(
            projectRoot,
            ".scratch",
            `restty-appearance-${Date.now()}-${process.pid}-${gateFrames ? "gate" : mixedPointer ? "mixed" : deferFrames ? "deferred" : (scaleFactor ?? "actual")}`,
          ),
        }),
    });
  } catch (error) {
    if (!supervised) await removeFailedFixture(root, error);
    throw error;
  }
}
