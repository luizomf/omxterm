import { createRequire } from "node:module";
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { resttyImageEmitterSource } from "../fixtures/restty-host-images";
import { resttyFontMutationProbe } from "../fixtures/restty-font-mutation-probe";
import { createNativeHostPng } from "../fixtures/native-host-png";
import { applyChromiumSandboxPolicy } from "../../src/main/chromium-sandbox-policy";
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
  readonly cancelledGestureMouseReports: string;
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
    readonly pixels: {
      readonly bitmapSize: readonly [number, number];
      readonly changedInPiPlacement: number;
      readonly changedOutsidePlacements: number;
      readonly colorBucketsInPiPlacement: number;
      readonly greenInChafaPlacement: number;
      readonly greenOutsideChafaPlacement: number;
    };
    readonly afterZoomPixels: {
      readonly changedInPiPlacement: number;
      readonly greenInChafaPlacement: number;
    };
    readonly afterResizePixels: {
      readonly changedInPiPlacement: number;
      readonly greenInChafaPlacement: number;
    };
    readonly afterTabAndThemePixels: {
      readonly colorBucketsInBitmap: number;
      readonly greenInBitmap: number;
    };
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
      expect(result.externalLinks[0]).toMatch(
        /^https:\/\/example\.test\/漢a+$/u,
      );
      expect(result.externalLinks[0]).toBe(result.externalLinks[1]);
      expect(result.externalLinks.slice(2)).toEqual([
        "https://one.test/a",
        "https://two.test/b",
        "https://scroll.test/complete",
      ]);
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
        cancelledGestureMouseReports: "",
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
      expect(result.imageEvidence.pixels.changedInPiPlacement).toBeGreaterThan(
        1_000,
      );
      expect(result.imageEvidence.pixels.greenInChafaPlacement).toBeGreaterThan(
        100,
      );
      expect(
        result.imageEvidence.pixels.colorBucketsInPiPlacement,
      ).toBeGreaterThan(1_000);
      expect(
        result.imageEvidence.pixels.greenOutsideChafaPlacement,
      ).toBeLessThan(200);
      for (const evidence of [
        result.imageEvidence.afterZoomPixels,
        result.imageEvidence.afterResizePixels,
      ]) {
        expect(evidence.changedInPiPlacement).toBeGreaterThan(1_000);
        expect(evidence.greenInChafaPlacement).toBeGreaterThan(100);
      }
      expect(
        result.imageEvidence.afterTabAndThemePixels.colorBucketsInBitmap,
      ).toBeGreaterThan(1_000);
      expect(
        result.imageEvidence.afterTabAndThemePixels.greenInBitmap,
      ).toBeGreaterThan(100);
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
});

async function buildHostFixture(root: string): Promise<void> {
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
      plugins: [resttyFontMutationProbe],
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
    writeFile(
      path.join(root, "pi-2000.png"),
      createNativeHostPng(2_000, 2_000),
    ),
    writeFile(path.join(root, "image-emitter.cjs"), resttyImageEmitterSource()),
    symlink(
      path.join(projectRoot, "node_modules"),
      path.join(root, "node_modules"),
      "dir",
    ),
  ]);
}

async function runFixture(root: string) {
  const chromiumArguments: string[] = [];
  applyChromiumSandboxPolicy({
    appendSwitch(name) {
      chromiumArguments.push(`--${name}`);
    },
  });
  return runNativeFixture({
    executable: electronExecutable,
    args: [...chromiumArguments, root],
    root,
    timeout: 260_000,
  });
}
