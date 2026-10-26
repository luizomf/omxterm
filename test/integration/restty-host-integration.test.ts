import { createRequire } from "node:module";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildHostFixture } from "../fixtures/restty-host-build";
import type { LocalImageLinkEvidence } from "../fixtures/restty-local-image-reference";
import { assertLocalImageRefitEvidence } from "../fixtures/restty-local-image-unicode";
import {
  hasResttyImagePlacementEvidence,
  type ResttyImagePixelEvidence,
} from "../fixtures/restty-image-evidence";
import type { ResttyLinkCancellationEvidence } from "../fixtures/restty-link-cancellation";
import { supportedFixtureChromiumArguments } from "../fixtures/supported-fixture-chromium-arguments";
import {
  runNativeFixture,
  type NativeFixtureTestContext,
} from "../fixtures/run-native-fixture";
import type { OutputStressEvidence } from "../fixtures/restty-host-output-stress";
import type { ResttyLinkGestureEvidence } from "../fixtures/restty-link-gestures";
import type { ResttyImageThemePixels } from "../fixtures/restty-image-theme";

const electronExecutable = createRequire(import.meta.url)("electron") as string;
const resultPrefix = "__OMXTERM_RESTTY_HOST_RESULT__";

interface HostResult extends ResttyLinkGestureEvidence {
  readonly fontMutation: {
    readonly sources: number;
    readonly bytes: number;
    readonly changedSources: number;
    readonly collections: number;
    readonly shapes: number;
    readonly outlines: number;
    readonly colors: number;
    readonly borrowedViews: number;
  };
  readonly beforeDestroy: { readonly canvases: number; readonly tabs: number };
  readonly backendLoss: {
    readonly message: string;
    readonly ownedSessionExited: boolean;
    readonly unaffectedSessionResponded: boolean;
    readonly executedResponse: boolean;
    readonly responseInSurvivingSurface: boolean;
    readonly surfaceRetained: boolean;
    readonly canvasRetained: boolean;
    readonly ownedExitDelta: number;
  };
  readonly concurrentFontInitialization: {
    readonly requestedTabs: number;
    readonly readyTabs: number;
    readonly rendererFontRequests: number;
    readonly physicalFontLoads: number;
    readonly falseErrorVisible: boolean;
  };
  readonly configuredFontFamily: string;
  readonly renderedFontFamily: string | null;
  readonly renderedPixels: {
    readonly blank: number;
    readonly configured: number;
    readonly cjk: number;
    readonly emojiAndSymbol: number;
  };
  readonly reloadState: {
    readonly fonts: readonly string[];
    readonly notice: string;
  };
  readonly clipboardReads: number;
  readonly clipboardWrites: number;
  readonly selectAllCoveredScrollback: boolean;
  readonly selectedUnicodeExactly: boolean;
  readonly protectedPasteConfirmations: number;
  readonly contextMenus: number;
  readonly largePasteLength: number;
  readonly externalLinks: readonly string[];
  readonly validLinkMouseReports: string;
  readonly localPathMouseReports: string;
  readonly localImageEvidence: ReadonlyArray<LocalImageLinkEvidence>;
  readonly titleEvents: ReadonlyArray<{
    readonly sessionId: string;
    readonly fixture: "first" | "overlong" | "second" | "unexpected";
  }>;
  readonly bellSessionIds: readonly string[];
  readonly titleQueryReplyBytes: number;
  readonly capabilityReplies: string;
  readonly outputStress: OutputStressEvidence;
  readonly imageEvidence: {
    readonly cellSizeResponse: string;
    readonly gridSize: { readonly cols: number; readonly rows: number };
    readonly pixels: ResttyImagePixelEvidence;
    readonly afterZoomPixels: ResttyImagePixelEvidence;
    readonly afterContentShrinkPixels: ResttyImagePixelEvidence;
    readonly afterContentRestorePixels: ResttyImagePixelEvidence;
    readonly contentRefit: {
      readonly before: {
        readonly width: number;
        readonly grid: { readonly cols: number; readonly rows: number };
      };
      readonly shrunk: {
        readonly width: number;
        readonly grid: { readonly cols: number; readonly rows: number };
      };
      readonly restored: {
        readonly width: number;
        readonly grid: { readonly cols: number; readonly rows: number };
      };
    };
    readonly afterTabAndThemePixels: ResttyImagePixelEvidence;
    readonly themeBefore: ResttyImageThemePixels;
    readonly themeAfter: ResttyImageThemePixels;
    readonly surfaceRetained: boolean;
    readonly canvasRetained: boolean;
    readonly sessionRetained: boolean;
  };
  readonly navigations: number;
  readonly openedWindows: number;
  readonly permissionRequests: number;
  readonly ptyExits: number;
  readonly launchKinds: readonly string[];
  readonly outputEvidence: {
    readonly defaultUnicode: boolean;
    readonly explicitReady: boolean;
    readonly explicitInput: boolean;
  };
  readonly resizeCounts: readonly number[];
  readonly ended: ReadonlyArray<{
    readonly closeRequested: boolean;
    readonly liveSessions: number;
  }>;
  readonly sessionStarts: number;
}

interface CancellationResult {
  readonly linkCancellation: ResttyLinkCancellationEvidence;
  readonly externalLinks: readonly string[];
  readonly sessionStarts: number;
  readonly ptyExits: number;
}

function assertNamedGestureEvidence(result: ResttyLinkGestureEvidence) {
  const modified = process.platform === "darwin" ? 0 : 16;
  const reports = result.ordinaryGestures;
  expect(reports.modifiedDrag.mouseReports).toBe(
    `\u001b[<${modified};4;1M\u001b[<${modified};4;2m`,
  );
  expect(reports.plainPrimary.mouseReports).toBe(
    "\u001b[<0;4;1M\u001b[<0;4;1m",
  );
  expect(reports.modifiedMiddle.mouseReports).toBe(
    `\u001b[<${modified + 1};4;1M\u001b[<${modified + 1};4;1m`,
  );
  expect(reports.changedUrl.mouseReports).toBe(
    `\u001b[<${modified};4;1M\u001b[<${modified};4;1m`,
  );
  expect(reports.releasedModifier.mouseReports).toBe(
    `\u001b[<${modified};4;1M\u001b[<0;4;1m`,
  );
  expect(result.wheel.mouseReports).toBe("\u001b[<65;4;1M\u001b[<65;4;1M");
  expect(result.alternateScreen.primaryClick.mouseReports).toBe(
    "\u001b[<0;4;1M\u001b[<0;4;1m",
  );
  expect(result.alternateScreen.wheel.mouseReports).toBe("\u001b[<64;4;1M");
  for (const gesture of [
    ...Object.values(reports),
    result.wheel,
    ...Object.values(result.alternateScreen),
  ]) {
    expect(gesture.activationsAfter).toBe(gesture.activationsBefore);
    expect(gesture.unattributedInput).toBe("");
  }
}

function assertDestinationOutputEvidence(stress: OutputStressEvidence) {
  expect(stress.source.bytes).toBeGreaterThanOrEqual(2 * 1024 * 1024);
  expect(stress.source).toMatchObject({
    records: 65_536,
    recordBytes: 2_097_152,
    checkpoints: 16,
    endSeen: true,
    framedBytes: 2_097_952,
    bufferedCodeUnits: 0,
    finalized: true,
  });
  expect(stress.source.framedBytes + stress.source.envelopeBytes).toBe(
    stress.source.bytes,
  );
  expect(stress.source.envelopeBytes).toBeGreaterThanOrEqual(0);
  expect(stress.destination).toMatchObject({
    records: 65_536,
    recordBytes: 2_097_152,
    endSeen: true,
  });
  expect(stress.destination.checkpoints).toHaveLength(16);
  for (const [batch, checkpoint] of stress.destination.checkpoints.entries())
    expect(checkpoint).toEqual({
      batch,
      first: batch * 4_096,
      last: (batch + 1) * 4_096 - 1,
      records: 4_096,
      recordBytes: 131_072,
      endSeen: true,
    });
  expect(stress.load).toBe("paced-128KiB-checkpoints");
  expect(stress.gridColumns).toBeGreaterThanOrEqual(20);
  expect(stress.scrollbackLines).toBe(10_000);
  expect(stress.pinnedCoreByteLimit).toBe(10_000_000);
  expect(stress.acknowledgements.count).toBeGreaterThan(0);
  expect(stress.acknowledgements.cumulativeEnd).toBe(stress.source.bytes);
}

describe.skipIf(
  !(["darwin", "linux", "win32"] as const).includes(
    process.platform as "darwin" | "linux" | "win32",
  ),
)("Restty through the OMXTerm host and a real native PTY", () => {
  it("preserves session lifecycle, isolation, focus, resize, and disabled routes", async (testContext) => {
    // Retain the existing macOS root policy: its per-user tmpdir can exceed
    // the viewport's total capacity. Clipping supports a measured multirow
    // prefix on the unchanged window; it no longer requires a one-row path.
    testContext.signal.throwIfAborted();
    const root = await mkdtemp(
      path.join(
        process.platform === "darwin" ? "/tmp" : tmpdir(),
        "omxterm-restty-host-",
      ),
    );
    let supervised = false;
    try {
      testContext.signal.throwIfAborted();
      supervised = true;
      const execution = await runFixture(root, testContext);
      const resultLine = execution.stdout
        .split("\n")
        .find((line) => line.startsWith(resultPrefix));
      const result = resultLine
        ? (JSON.parse(resultLine.slice(resultPrefix.length)) as HostResult)
        : undefined;
      const evidencePath = process.env["OMXTERM_RESTTY_HOST_EVIDENCE_PATH"];
      if (evidencePath && result)
        await writeFile(evidencePath, `${JSON.stringify(result, null, 2)}\n`);

      expect(
        execution,
        `Host fixture failed.\nstdout:\n${execution.stdout}\nstderr:\n${execution.stderr}`,
      ).toMatchObject({
        exitCode: 0,
        signal: null,
        reason: "exit",
        cleanupErrors: [],
      });
      if (!result) throw new Error("Host fixture returned no result");
      expect(result.fontMutation.sources).toBeGreaterThan(0);
      expect(result.fontMutation.bytes).toBeGreaterThan(0);
      expect(result.fontMutation.changedSources).toBe(0);
      expect(result.fontMutation.shapes).toBeGreaterThan(0);
      expect(result.fontMutation.outlines).toBeGreaterThan(0);
      expect(result.fontMutation.borrowedViews).toBeGreaterThan(0);
      if (process.platform === "darwin") {
        expect(result.fontMutation.collections).toBeGreaterThan(0);
        expect(result.fontMutation.colors).toBeGreaterThan(0);
      }
      expect(result.sessionStarts).toBe(9);
      expect(result.renderedFontFamily).toBe(result.configuredFontFamily);
      expect(result.renderedPixels.configured).toBeGreaterThan(
        result.renderedPixels.blank,
      );
      expect(result.renderedPixels.cjk).toBeGreaterThan(
        result.renderedPixels.configured,
      );
      expect(result.renderedPixels.emojiAndSymbol).toBeGreaterThan(
        result.renderedPixels.cjk,
      );
      expect(result.reloadState.fonts).toEqual(
        process.platform === "darwin"
          ? ["Helvetica", "Times New Roman"]
          : process.platform === "win32"
            ? ["Consolas", "Courier New"]
            : ["DejaVu Sans", "Liberation Mono"],
      );
      expect(result.reloadState.notice).toContain(
        "font.family and font.lineHeight",
      );
      expect(result.reloadState.notice).toContain("Restart OMXTerm");
      expect(result.launchKinds).toEqual([
        "default-shell",
        "explicit-command",
        "explicit-command",
        "default-shell",
        "default-shell",
        "default-shell",
        "default-shell",
        "default-shell",
        "default-shell",
      ]);
      expect(result.resizeCounts).toHaveLength(9);
      expect(result.resizeCounts.every((count) => count > 0)).toBe(true);
      expect(result.outputEvidence).toEqual({
        defaultUnicode: true,
        explicitReady: true,
        explicitInput: true,
      });
      expect(result.beforeDestroy).toEqual({ canvases: 1, tabs: 1 });
      expect(result.backendLoss).toMatchObject({
        message: "The OMXTerm Terminal Surface rendering backend was lost",
        ownedSessionExited: true,
        unaffectedSessionResponded: true,
        executedResponse: true,
        responseInSurvivingSurface: true,
        surfaceRetained: true,
        canvasRetained: true,
        ownedExitDelta: 1,
      });
      expect(result.concurrentFontInitialization).toEqual({
        requestedTabs: 4,
        readyTabs: 4,
        rendererFontRequests: 0,
        physicalFontLoads: 0,
        falseErrorVisible: false,
      });
      expect(result.ended.slice(0, 3)).toEqual([
        { closeRequested: true, liveSessions: 1 },
        { closeRequested: false, liveSessions: 1 },
        { closeRequested: false, liveSessions: 1 },
      ]);
      assertVisibleLinkEvidence(result);
      expect(
        result.localImageEvidence.slice(0, 5).map(({ control }) => control),
      ).toEqual([
        "unquoted PNG",
        "unquoted JPEG",
        "soft-wrapped PNG",
        "space at soft-wrap boundary",
        "quoted Unicode prefix and location",
      ]);
      expect(
        result.localImageEvidence
          .slice(0, 5)
          .every(({ activations }) => activations >= 2),
      ).toBe(true);
      assertLocalImageRefitEvidence(result.localImageEvidence);
      expect(
        result.localImageEvidence.slice(10).map(({ control }) => control),
      ).toEqual(
        process.env["OMXTERM_TEST_IMAGE_TMUX"] === "1"
          ? [
              "tmux initial",
              "tmux redraw",
              "tmux initial boundary",
              "tmux redraw boundary",
            ]
          : [],
      );
      expect(result.localImageEvidence.slice(5, 8)).toEqual([
        { control: "space clipped above viewport", activations: 0 },
        { control: "space clipped below viewport", activations: 0 },
        { control: "trailing-space exclusion", activations: 1 },
      ]);
      assertNamedGestureEvidence(result);
      expect(result).toMatchObject({
        clipboardReads: 1,
        clipboardWrites: 18,
        selectAllCoveredScrollback: true,
        selectedUnicodeExactly: true,
        protectedPasteConfirmations: 1,
        contextMenus: 1,
        largePasteLength: 79_000,
        validLinkMouseReports: "",
        localPathMouseReports: "",
        titleQueryReplyBytes: 0,
        navigations: 0,
        openedWindows: 0,
        permissionRequests: 0,
        ptyExits: 9,
      });
      expect(result.capabilityReplies).toMatch(
        /^\u001b\[\?1;2c\u001b\[>0;0;0c\u001b\[3;5R\u001b\[6;\d+;\d+t$/u,
      );
      expect(result.outputStress).toMatchObject({
        resizeObserved: true,
        producerExit: { exitCode: 0, signal: 0 },
        flow: { pendingBytes: 0 },
      });
      assertDestinationOutputEvidence(result.outputStress);
      expect(result.outputStress.flow.pauseCount).toBeGreaterThan(0);
      expect(result.outputStress.flow.resumeCount).toBeGreaterThan(0);
      expect(result.outputStress.flow.maxPendingBytes).toBeLessThanOrEqual(
        64 * 1024 + result.outputStress.flow.largestNativeReadBytes,
      );
      expect(result.outputStress.memory.mainHeapUsedBytes).toBeGreaterThan(0);
      expect(result.outputStress.memory.mainRssBytes).toBeGreaterThan(0);
      if (result.outputStress.memory.rendererHeapUsedBytes !== null)
        expect(
          result.outputStress.memory.rendererHeapUsedBytes,
        ).toBeGreaterThan(0);
      expect(result.titleEvents.map(({ fixture }) => fixture)).toEqual([
        "first",
        "overlong",
        "second",
      ]);
      expect(result.titleEvents[0]?.sessionId).toBe(
        result.titleEvents[1]?.sessionId,
      );
      expect(result.titleEvents[0]?.sessionId).not.toBe(
        result.titleEvents[2]?.sessionId,
      );
      expect(result.bellSessionIds[0]).toBe(result.titleEvents[0]?.sessionId);
      expect(result.bellSessionIds.at(-1)).toBe(
        result.titleEvents[2]?.sessionId,
      );
      expect(
        result.bellSessionIds.every(
          (sessionId) =>
            sessionId === result.titleEvents[0]?.sessionId ||
            sessionId === result.titleEvents[2]?.sessionId,
        ),
      ).toBe(true);
      expect(result.imageEvidence).toMatchObject({
        themeBefore: {
          background: [25, 34, 53, 255],
          retainedAnsiRed: [192, 71, 131, 255],
        },
        themeAfter: {
          background: [0, 0, 0, 255],
          retainedAnsiRed: [255, 128, 170, 255],
        },
        surfaceRetained: true,
        canvasRetained: true,
        sessionRetained: true,
      });
      expect(result.imageEvidence.cellSizeResponse).toMatch(
        /^\u001b\[6;\d+;\d+t$/u,
      );
      const [, reportedHeight, reportedWidth] =
        /^\u001b\[6;(\d+);(\d+)t$/u.exec(
          result.imageEvidence.cellSizeResponse,
        )!;
      expect(
        Math.abs(
          Number(reportedWidth) -
            result.imageEvidence.pixels.bitmapSize[0] /
              result.imageEvidence.gridSize.cols,
        ),
      ).toBeLessThan(2);
      expect(
        Math.abs(
          Number(reportedHeight) -
            result.imageEvidence.pixels.bitmapSize[1] /
              result.imageEvidence.gridSize.rows,
        ),
      ).toBeLessThan(2);
      const { before, shrunk, restored } = result.imageEvidence.contentRefit;
      expect(shrunk.width).toBeLessThan(before.width);
      expect(shrunk.grid.cols).toBeLessThan(before.grid.cols);
      expect(restored.width).toBeGreaterThan(shrunk.width);
      expect(Math.abs(restored.width - before.width)).toBeLessThanOrEqual(1);
      expect(restored.grid).toEqual(before.grid);
      for (const [operation, evidence] of Object.entries({
        initial: result.imageEvidence.pixels,
        zoom: result.imageEvidence.afterZoomPixels,
        contentShrink: result.imageEvidence.afterContentShrinkPixels,
        contentRestore: result.imageEvidence.afterContentRestorePixels,
        tabAndTheme: result.imageEvidence.afterTabAndThemePixels,
      })) {
        expect(
          hasResttyImagePlacementEvidence(evidence),
          `${operation}: ${JSON.stringify(evidence)}`,
        ).toBe(true);
      }
    } finally {
      // After API delegation, its preparation/settlement boundary owns cleanup.
      // Do not remove a profile on rejection with uncertain native ownership.
      if (!supervised)
        await rm(root, {
          recursive: true,
          force: true,
          maxRetries: 10,
          retryDelay: 100,
        });
    }
  }, 270_000);

  it("cancels pending link gestures through pointercancel and blur in the real Surface", async (testContext) => {
    const result = await runCancellationFixture(testContext);
    assertLinkCancellationEvidence(result.linkCancellation);
    expect(result.externalLinks).toEqual(["https://cancel.test/visible"]);
  }, 270_000);

  it.for(["pointercancel", "blur"] as const)(
    "detects disabled pending %s cancellation in the real Surface",
    { timeout: 270_000 },
    async (cancellation, testContext) => {
      const result = await runCancellationFixture(testContext, cancellation);
      assertLinkCancellationControls(result.linkCancellation);
      expect(() =>
        assertLinkCancellationEvidence(result.linkCancellation),
      ).toThrow();
      const { pointercancel, blur } = result.linkCancellation;
      for (const [event, observation] of Object.entries({
        pointercancel,
        blur,
      })) {
        expect(observation.mouseReports).toBe("");
        // The same unchanged-count invariant used by the positive suite must
        // reject ONLY the case whose actual cancellation listener is missing.
        expect(observation.activationsAfter).toBe(
          observation.activationsBefore + Number(event === cancellation),
        );
      }
      expect(result.externalLinks).toEqual([
        "https://cancel.test/visible",
        "https://cancel.test/visible",
      ]);
    },
  );
});

function assertVisibleLinkEvidence(result: HostResult) {
  expect(result.externalLinks[0]).toMatch(/^https:\/\/example\.test\/漢a+$/u);
  expect(result.externalLinks[0]).toBe(result.externalLinks[1]);
  expect(result.externalLinks.slice(2)).toEqual([
    "https://one.test/a",
    "https://two.test/b",
    "https://scroll.test/complete",
  ]);
}

function assertLinkCancellationControls(
  evidence: ResttyLinkCancellationEvidence,
) {
  expect(evidence.positive).toEqual({
    activationsBefore: 0,
    activationsAfter: 1,
    mouseReports: "",
  });
  expect(evidence.reportingControl).toMatch(
    /^\u001b\[<0;\d+;\d+M\u001b\[<0;\d+;\d+m$/u,
  );
}

function assertLinkCancellationEvidence(
  evidence: ResttyLinkCancellationEvidence,
) {
  assertLinkCancellationControls(evidence);
  for (const cancellation of ["pointercancel", "blur"] as const)
    expect(evidence[cancellation], cancellation).toEqual({
      activationsBefore: 1,
      activationsAfter: 1,
      mouseReports: "",
    });
}

async function runCancellationFixture(
  testContext: NativeFixtureTestContext,
  cancellation?: "pointercancel" | "blur",
) {
  testContext.signal.throwIfAborted();
  const root = await mkdtemp(
    path.join(tmpdir(), "omxterm-restty-cancellation-"),
  );
  let supervised = false;
  try {
    testContext.signal.throwIfAborted();
    supervised = true;
    const execution = await runFixture(root, testContext, true, cancellation);
    expect(
      execution,
      `Cancellation fixture setup/execution failed.\n${JSON.stringify(execution)}`,
    ).toMatchObject({
      exitCode: 0,
      signal: null,
      reason: "exit",
      cleanupErrors: [],
    });
    const line = execution.stdout
      .split("\n")
      .find((entry) => entry.startsWith(resultPrefix));
    if (!line) throw new Error("Cancellation fixture returned no result");
    const result = JSON.parse(
      line.slice(resultPrefix.length),
    ) as CancellationResult;
    const evidencePath = process.env["OMXTERM_RESTTY_HOST_EVIDENCE_PATH"];
    if (evidencePath)
      await writeFile(
        `${evidencePath}.${cancellation ?? "cancellation"}.json`,
        `${JSON.stringify(result, null, 2)}\n`,
      );
    expect(result.sessionStarts).toBe(1);
    expect(result.ptyExits).toBe(1);
    return result;
  } finally {
    // The delegated runner owns preparation cleanup as well as native settlement.
    if (!supervised) await rm(root, { recursive: true, force: true });
  }
}

async function runFixture(
  root: string,
  testContext: NativeFixtureTestContext,
  focusedCancellation = false,
  cancellation?: "pointercancel" | "blur",
) {
  const chromiumArguments = supportedFixtureChromiumArguments();
  return runNativeFixture({
    executable: electronExecutable,
    args: [
      ...chromiumArguments,
      root,
      ...(focusedCancellation ? ["--link-cancellation"] : []),
    ],
    root,
    timeout: 260_000,
    testContext,
    prepare: () =>
      buildHostFixture(root, {
        focusedCancellation,
        ...(cancellation ? { cancellation } : {}),
      }),
  });
}
