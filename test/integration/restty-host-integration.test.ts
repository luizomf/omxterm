import { createRequire } from "node:module";
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { resttyImageEmitterSource } from "../fixtures/restty-host-images";
import {
  hasResttyImagePlacementEvidence,
  type ResttyImagePixelEvidence,
} from "../fixtures/restty-image-evidence";
import { resttyFontMutationProbe } from "../fixtures/restty-font-mutation-probe";
import type { ResttyLinkCancellationEvidence } from "../fixtures/restty-link-cancellation";
import { resttyLinkCancellationMutation } from "../fixtures/restty-link-cancellation-mutation";
import { createNativeHostPng } from "../fixtures/native-host-png";
import { supportedFixtureChromiumArguments } from "../fixtures/supported-fixture-chromium-arguments";
import { runNativeFixture } from "../fixtures/run-native-fixture";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const electronExecutable = createRequire(import.meta.url)("electron") as string;
const resultPrefix = "__OMXTERM_RESTTY_HOST_RESULT__";

interface HostResult {
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
  readonly modifiedHoverChangedPixels: number;
  readonly releasedHoverChangedPixels: number;
  readonly validLinkMouseReports: string;
  readonly localPathMouseReports: string;
  readonly localImageEvidence: ReadonlyArray<{
    readonly control: string;
    readonly activations: number;
  }>;
  readonly ordinaryGestureMouseReports: string;
  readonly wheelMouseReports: string;
  readonly alternateScreenMouseReports: string;
  readonly titleEvents: ReadonlyArray<{
    readonly sessionId: string;
    readonly fixture: "first" | "overlong" | "second" | "unexpected";
  }>;
  readonly bellSessionIds: readonly string[];
  readonly titleQueryReplyBytes: number;
  readonly capabilityReplies: string;
  readonly outputStress: {
    readonly bytes: number;
    readonly records: number;
    readonly endSeen: boolean;
    readonly markerVisible: boolean;
    readonly remainderCodeUnits: number;
    readonly resizeObserved: boolean;
    readonly producerExit: {
      readonly exitCode: number;
      readonly signal: number;
    };
    readonly flow: {
      readonly pendingBytes: number;
      readonly maxPendingBytes: number;
      readonly largestNativeReadBytes: number;
      readonly pauseCount: number;
      readonly resumeCount: number;
    };
    readonly memory: {
      readonly mainHeapUsedBytes: number;
      readonly mainRssBytes: number;
      readonly rendererHeapUsedBytes: number | null;
    };
  };
  readonly imageEvidence: {
    readonly cellSizeResponse: string;
    readonly gridSize: { readonly cols: number; readonly rows: number };
    readonly pixels: ResttyImagePixelEvidence;
    readonly afterZoomPixels: ResttyImagePixelEvidence;
    readonly afterResizePixels: ResttyImagePixelEvidence;
    readonly afterTabAndThemePixels: ResttyImagePixelEvidence;
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

describe.skipIf(
  !(["darwin", "linux", "win32"] as const).includes(
    process.platform as "darwin" | "linux" | "win32",
  ),
)("Restty through the OMXTerm host and a real native PTY", () => {
  it("preserves session lifecycle, isolation, focus, resize, and disabled routes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-restty-host-"));
    let supervised = false;
    try {
      await buildHostFixture(root);
      supervised = true;
      const execution = await runFixture(root);
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
      expect(result.backendLoss).toEqual({
        message: "The OMXTerm Terminal Surface rendering backend was lost",
        ownedSessionExited: true,
        unaffectedSessionResponded: true,
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
      expect(result.modifiedHoverChangedPixels).toBeGreaterThan(10);
      expect(result.releasedHoverChangedPixels).toBe(0);
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
      expect(
        result.localImageEvidence.slice(8).map(({ control }) => control),
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
      expect(result.ordinaryGestureMouseReports).toMatch(/\u001b\[</u);
      expect(result.wheelMouseReports).toMatch(/\u001b\[<65;/u);
      expect(result.alternateScreenMouseReports).toMatch(/\u001b\[<0;/u);
      expect(result.alternateScreenMouseReports).toMatch(/\u001b\[<64;/u);
      expect(result).toMatchObject({
        clipboardReads: 1,
        clipboardWrites: 3,
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
        records: 65_536,
        endSeen: true,
        markerVisible: true,
        resizeObserved: true,
        producerExit: { exitCode: 0, signal: 0 },
        flow: {
          pendingBytes: 0,
        },
      });
      expect(result.outputStress.bytes).toBeGreaterThanOrEqual(
        2 * 1024 * 1024 + "__OMXTERM_OUTPUT_END__".length,
      );
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
      for (const [operation, evidence] of Object.entries({
        initial: result.imageEvidence.pixels,
        zoom: result.imageEvidence.afterZoomPixels,
        resize: result.imageEvidence.afterResizePixels,
        tabAndTheme: result.imageEvidence.afterTabAndThemePixels,
      })) {
        expect(
          hasResttyImagePlacementEvidence(evidence),
          `${operation}: ${JSON.stringify(evidence)}`,
        ).toBe(true);
      }
    } finally {
      // Once launched, only the supervisor may remove the owned profile after
      // checking process cleanup. Retain it if cleanup could not be established.
      if (!supervised)
        await rm(root, {
          recursive: true,
          force: true,
          maxRetries: 10,
          retryDelay: 100,
        });
    }
  }, 270_000);

  it("cancels pending link gestures through pointercancel and blur in the real Surface", async () => {
    const result = await runCancellationFixture();
    assertLinkCancellationEvidence(result.linkCancellation);
    expect(result.externalLinks).toEqual(["https://cancel.test/visible"]);
  }, 270_000);

  it.each(["pointercancel", "blur"] as const)(
    "detects disabled pending %s cancellation in the real Surface",
    async (cancellation) => {
      const result = await runCancellationFixture(cancellation);
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
    270_000,
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

async function runCancellationFixture(cancellation?: "pointercancel" | "blur") {
  const root = await mkdtemp(
    path.join(tmpdir(), "omxterm-restty-cancellation-"),
  );
  let supervised = false;
  try {
    await buildHostFixture(root, {
      focusedCancellation: true,
      ...(cancellation ? { cancellation } : {}),
    });
    supervised = true;
    const execution = await runFixture(root, true);
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
    // Only the supervisor may remove a launched profile after owned cleanup.
    if (!supervised) await rm(root, { recursive: true, force: true });
  }
}

async function buildHostFixture(
  root: string,
  {
    focusedCancellation = false,
    cancellation,
  }: {
    focusedCancellation?: boolean;
    cancellation?: "pointercancel" | "blur";
  } = {},
): Promise<void> {
  await mkdir(path.join(root, "renderer"), { recursive: true });
  await Promise.all([
    build({
      absWorkingDir: projectRoot,
      bundle: true,
      entryPoints: ["test/fixtures/restty-host-main.ts"],
      external: ["electron", "node-pty"],
      format: "cjs",
      logLevel: "silent",
      outfile: path.join(root, "main.cjs"),
      platform: "node",
    }),
    build({
      absWorkingDir: projectRoot,
      bundle: true,
      entryPoints: ["src/preload/index.ts"],
      external: ["electron"],
      format: "cjs",
      logLevel: "silent",
      outfile: path.join(root, "preload.cjs"),
      platform: "node",
    }),
    build({
      absWorkingDir: projectRoot,
      bundle: true,
      entryPoints: ["src/renderer/index.ts"],
      format: "iife",
      loader: { ".ttf": "binary" },
      plugins: [
        ...(focusedCancellation ? [] : [resttyFontMutationProbe]),
        ...(cancellation ? [resttyLinkCancellationMutation(cancellation)] : []),
      ],
      logLevel: "silent",
      outfile: path.join(root, "renderer", "index.js"),
      platform: "browser",
    }),
    cp(
      path.join(projectRoot, "src", "renderer", "index.html"),
      path.join(root, "renderer", "index.html"),
    ),
    writeFile(
      path.join(root, "package.json"),
      `${JSON.stringify({ name: "omxterm-restty-host-fixture", main: "main.cjs" })}\n`,
    ),
    ...(!focusedCancellation
      ? [
          writeFile(
            path.join(root, "pi-2000.png"),
            createNativeHostPng(2_000, 2_000),
          ),
          writeFile(
            path.join(root, "image-emitter.cjs"),
            resttyImageEmitterSource(),
          ),
        ]
      : []),
    symlink(
      path.join(projectRoot, "node_modules"),
      path.join(root, "node_modules"),
      "dir",
    ),
  ]);
}

async function runFixture(root: string, focusedCancellation = false) {
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
  });
}
