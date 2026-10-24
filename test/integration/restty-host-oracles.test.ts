import { createRequire } from "node:module";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildHostFixture } from "../fixtures/restty-host-build";
import {
  hasResttyImagePlacementEvidence,
  type ResttyImagePixelEvidence,
} from "../fixtures/restty-image-evidence";
import type { ResttyImageThemePixels } from "../fixtures/restty-image-theme";
import type { OutputStressEvidence } from "../fixtures/restty-host-output-stress";
import type { exerciseResttyBackendLoss } from "../fixtures/restty-host-failures";
import type { FocusedHostOracle } from "../fixtures/restty-host-oracle-scenarios";
import type { HostOracleRendererControl } from "../fixtures/restty-host-oracle-controls";
import { assertOutputDropRejection } from "../fixtures/restty-output-drop-evidence";
import { supportedFixtureChromiumArguments } from "../fixtures/supported-fixture-chromium-arguments";
import {
  runNativeFixture,
  type NativeFixtureTestContext,
} from "../fixtures/run-native-fixture";
import type { ResttyGestureControl } from "../fixtures/restty-gesture-routing-mutation";
import type { exerciseResttyOrdinaryGestures } from "../fixtures/restty-link-gestures";
import type { ResttySearchEvidence } from "../fixtures/restty-host-search";
import type { ResttyExportEvidence } from "../fixtures/restty-host-export";

const electronExecutable = createRequire(import.meta.url)("electron") as string;
const prefix = "__OMXTERM_RESTTY_HOST_RESULT__";
interface FocusedResult {
  readonly oracle: FocusedHostOracle;
  readonly sessionStarts: number;
  readonly ptyExits: number;
  readonly outputStress?: OutputStressEvidence;
  readonly backendLoss?: Awaited<ReturnType<typeof exerciseResttyBackendLoss>>;
  readonly searchEvidence?: ResttySearchEvidence;
  readonly exportEvidence?: ResttyExportEvidence;
  readonly gestureEvidence?: Awaited<
    ReturnType<typeof exerciseResttyOrdinaryGestures>
  >;
  readonly imageEvidence?: {
    readonly geometryScenario: "full" | "reload-only";
    readonly pixels: ResttyImagePixelEvidence;
    readonly contentRefit?: unknown;
    readonly themeBefore: ResttyImageThemePixels;
    readonly themeAfter: ResttyImageThemePixels;
    readonly surfaceRetained: boolean;
    readonly canvasRetained: boolean;
    readonly sessionRetained: boolean;
    readonly afterTabAndThemePixels: ResttyImagePixelEvidence;
  };
}

async function runOracle(
  oracle: FocusedHostOracle,
  testContext: NativeFixtureTestContext,
  control?: HostOracleRendererControl,
  args: readonly string[] = [],
  gestureControl?: ResttyGestureControl,
) {
  testContext.signal.throwIfAborted();
  const root = await mkdtemp(
    path.join(
      process.platform === "darwin" ? "/tmp" : tmpdir(),
      "omxterm-restty-oracle-",
    ),
  );
  let supervised = false;
  try {
    testContext.signal.throwIfAborted();
    supervised = true;
    const execution = await runNativeFixture({
      executable: electronExecutable,
      args: [
        ...supportedFixtureChromiumArguments(),
        root,
        `--oracle-${oracle}`,
        ...args,
      ],
      root,
      timeout: 120_000,
      testContext,
      prepare: () =>
        buildHostFixture(root, {
          ...(control ? { oracleControl: control } : {}),
          ...(gestureControl ? { gestureControl } : {}),
        }),
    });
    const evidence = process.env["OMXTERM_RESTTY_HOST_ORACLE_EVIDENCE_PATH"];
    if (evidence)
      await writeFile(
        `${evidence}.${oracle}.${control ?? gestureControl ?? args[0]?.slice(2) ?? "green"}.json`,
        `${JSON.stringify(execution, null, 2)}\n`,
      );
    expect(execution, JSON.stringify(execution)).toMatchObject({
      reason: "exit",
      signal: null,
      cleanupErrors: [],
    });
    return execution;
  } finally {
    // Delegated preparation and uncertain native ownership belong to the runner.
    if (!supervised) await rm(root, { recursive: true, force: true });
  }
}

function readResult(execution: Awaited<ReturnType<typeof runOracle>>) {
  expect(execution, JSON.stringify(execution)).toMatchObject({ exitCode: 0 });
  const line = execution.stdout
    .split("\n")
    .find((value) => value.startsWith(prefix));
  if (!line) throw new Error("Focused native oracle returned no result");
  return JSON.parse(line.slice(prefix.length)) as FocusedResult;
}

describe.skipIf(!["darwin", "linux", "win32"].includes(process.platform))(
  "focused actual-destination host oracles",
  () => {
    it("checks all sixteen paced destination copies under unchanged history and real backpressure", async (testContext) => {
      const execution = await runOracle("output-checkpoints", testContext);
      // Omitting the mutation cannot satisfy the same negative-control consumer.
      expect(() => assertOutputDropRejection(execution.stderr)).toThrow(
        "rejection evidence",
      );
      const result = readResult(execution);
      expect(result.sessionStarts).toBe(1);
      const stress = result.outputStress!;
      expect(stress.source).toMatchObject({
        records: 65_536,
        recordBytes: 2_097_152,
        checkpoints: 16,
        endSeen: true,
        remainderCodeUnits: 0,
      });
      expect(stress.destination).toMatchObject({
        records: 65_536,
        recordBytes: 2_097_152,
        endSeen: true,
      });
      expect(stress.destination.checkpoints).toHaveLength(16);
      for (const [
        batch,
        checkpoint,
      ] of stress.destination.checkpoints.entries())
        expect(checkpoint).toMatchObject({
          batch,
          first: batch * 4_096,
          last: (batch + 1) * 4_096 - 1,
          records: 4_096,
          recordBytes: 131_072,
        });
      expect(stress.load).toBe("paced-128KiB-checkpoints");
      expect(stress.scrollbackLines).toBe(10_000);
      expect(stress.pinnedCoreByteLimit).toBe(10_000_000);
      expect(stress.acknowledgements.cumulativeEnd).toBe(stress.source.bytes);
      expect(stress.flow.pendingBytes).toBe(0);
      expect(stress.flow.pauseCount).toBeGreaterThan(0);
      expect(stress.flow.resumeCount).toBeGreaterThan(0);
      expect(stress.flow.maxPendingBytes).toBeLessThanOrEqual(
        64 * 1024 + stress.flow.largestNativeReadBytes,
      );
      expect(stress.resizeObserved).toBe(true);
      expect(stress.producerExit).toEqual({ exitCode: 0, signal: 0 });
    }, 130_000);

    it("copies exact output continued from a pending-wrap boundary after native content refit", async (testContext) => {
      const result = readResult(
        await runOracle("output-checkpoints", testContext, undefined, [
          "--oracle-row-end-refit",
          "--oracle-single-checkpoint",
        ]),
      );
      expect(result.sessionStarts).toBe(1);
      expect(result.ptyExits).toBe(1);
      const stress = result.outputStress!;
      const refit = stress.controlledRefit!;
      expect(refit.refitted.cols).toBeLessThan(refit.original.cols);
      expect(refit.refitted.rows).toBe(refit.original.rows);
      expect((refit.prefixUnits + 24) % refit.original.cols).toBe(0);
      expect((refit.prefixUnits + 24) % refit.refitted.cols).not.toBe(0);
      expect(refit.prefixUnits).toBeGreaterThanOrEqual(65_536);
      const acknowledged = refit.prefixAcknowledgement;
      expect(acknowledged.prefixUnits).toBe(refit.prefixUnits);
      expect(acknowledged.sourceBytes - acknowledged.baselineBytes).toBe(
        refit.prefixUnits,
      );
      expect(acknowledged.expectedSourceBytes).toBe(acknowledged.sourceBytes);
      expect(acknowledged.cumulativeAck).toBe(acknowledged.sourceBytes);
      expect(acknowledged.pendingBytes).toBe(0);
      // The producer emits exactly 26 BEGIN + 131072 record + 24 END bytes.
      // Native startup stays in both original source and ACK totals.
      expect(stress.source).toMatchObject({
        bytes: acknowledged.baselineBytes + 131_122,
        records: 4_096,
        recordBytes: 131_072,
        checkpoints: 1,
        endSeen: true,
        remainderCodeUnits: 0,
      });
      expect(stress.destination.checkpoints).toEqual([
        {
          batch: 0,
          first: 0,
          last: 4_095,
          records: 4_096,
          recordBytes: 131_072,
          endSeen: true,
        },
      ]);
      expect(stress.destination).toMatchObject({
        records: 4_096,
        recordBytes: 131_072,
        endSeen: true,
      });
      expect(stress.acknowledgements.cumulativeEnd).toBe(stress.source.bytes);
      expect(stress.flow.pendingBytes).toBe(0);
      expect(stress.flow.pauseCount).toBeGreaterThan(0);
      expect(stress.flow.resumeCount).toBeGreaterThan(0);
      expect(stress.resizeObserved).toBe(true);
      expect(stress.producerExit).toEqual({ exitCode: 0, signal: 0 });
    }, 130_000);

    it("observes freshly executed surviving-session response in the same Surface/core after owned backend loss", async (testContext) => {
      const result = readResult(
        await runOracle("surviving-session", testContext),
      );
      expect(result).toMatchObject({
        sessionStarts: 2,
        ptyExits: 1,
        backendLoss: {
          ownedExitDelta: 1,
          executedResponse: true,
          responseInSurvivingSurface: true,
          surfaceRetained: true,
          canvasRetained: true,
          unaffectedSessionResponded: true,
        },
      });
    }, 130_000);

    it.for(["image-palette", "image-palette-reload"] as const)(
      "paints retained ANSI palette B-to-A with %s without replacing the hidden/revealed session or images",
      { timeout: 130_000 },
      async (oracle, testContext) => {
        const result = readResult(await runOracle(oracle, testContext));
        expect(result.imageEvidence!.geometryScenario).toBe(
          oracle === "image-palette" ? "full" : "reload-only",
        );
        expect(
          hasResttyImagePlacementEvidence(result.imageEvidence!.pixels),
        ).toBe(true);
        if (oracle === "image-palette-reload")
          expect(result.imageEvidence!.contentRefit).toBeUndefined();
        expect(result).toMatchObject({
          sessionStarts: 2,
          ptyExits: 1,
          imageEvidence: {
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
          },
        });
        expect(
          hasResttyImagePlacementEvidence(
            result.imageEvidence!.afterTabAndThemePixels,
          ),
        ).toBe(true);
      },
    );

    it("records exact native per-gesture packets and zero destination activation", async (testContext) => {
      const result = readResult(
        await runOracle("gesture-routing", testContext),
      );
      expect(result.sessionStarts).toBe(1);
      const evidence = result.gestureEvidence!;
      const modified = process.platform === "darwin" ? 0 : 16;
      expect(evidence.ordinaryGestures).toMatchObject({
        modifiedDrag: {
          mouseReports: `\u001b[<${modified};4;1M\u001b[<${modified};4;2m`,
        },
        plainPrimary: { mouseReports: "\u001b[<0;4;1M\u001b[<0;4;1m" },
        modifiedMiddle: {
          mouseReports: `\u001b[<${modified + 1};4;1M\u001b[<${modified + 1};4;1m`,
        },
        changedUrl: {
          mouseReports: `\u001b[<${modified};4;1M\u001b[<${modified};4;1m`,
        },
        releasedModifier: {
          mouseReports: `\u001b[<${modified};4;1M\u001b[<0;4;1m`,
        },
      });
      expect(evidence.wheel.mouseReports).toBe(
        "\u001b[<65;4;1M\u001b[<65;4;1M",
      );
      expect(evidence.alternateScreen.primaryClick.mouseReports).toBe(
        "\u001b[<0;4;1M\u001b[<0;4;1m",
      );
      expect(evidence.alternateScreen.wheel.mouseReports).toBe(
        "\u001b[<64;4;1M",
      );
      for (const gesture of [
        ...Object.values(evidence.ordinaryGestures),
        evidence.wheel,
        ...Object.values(evidence.alternateScreen),
      ])
        expect(gesture).toMatchObject({
          activationsBefore: 0,
          activationsAfter: 0,
          unattributedInput: "",
        });
    }, 130_000);

    it.for(["move", "up", "middle"] as const)(
      "rejects actual native %s report loss in its own named gesture",
      { timeout: 130_000 },
      async (control, testContext) => {
        const execution = await runOracle(
          "gesture-routing",
          testContext,
          undefined,
          [],
          control,
        );
        expect(execution.exitCode, execution.stderr).toBe(1);
        const affected = {
          move: "modifiedDrag",
          up: "changedUrl",
          middle: "modifiedMiddle",
        }[control];
        expect(execution.stderr).toContain(`${affected} mouse reports:`);
        expect(execution.stderr).toContain("activationDelta=0");
      },
    );

    it.for(["reorder", "drop"] as const)(
      "rejects actual %s after valid source while END and original ACK progress survive",
      { timeout: 130_000 },
      async (kind, testContext) => {
        const execution = await runOracle(
          "output-checkpoints",
          testContext,
          kind === "drop" ? "drop-output" : undefined,
          [
            "--oracle-single-checkpoint",
            ...(kind === "reorder" ? ["--reorder-output"] : []),
          ],
        );
        expect(execution.exitCode, execution.stderr).toBe(1);
        if (kind === "reorder")
          expect(execution.stderr).toContain(
            "Destination checkpoint 0 order at 100",
          );
        else assertOutputDropRejection(execution.stderr);
        expect(execution.stderr).toContain("END present: true");
        expect(execution.stderr).toContain(
          "source checkpoints=1, source records=4096, pending=0",
        );
        const ack = /ACK=(\d+)\/(\d+)/u.exec(execution.stderr);
        expect(ack).not.toBeNull();
        expect(ack![1]).toBe(ack![2]);
        if (kind === "reorder")
          expect(execution.stderr).toContain('"applied":true');
      },
    );

    it("rejects omitted real surviving destination response despite fresh raw PTY execution", async (testContext) => {
      const execution = await runOracle(
        "surviving-session",
        testContext,
        undefined,
        ["--omit-sibling-response"],
      );
      expect(execution.exitCode, execution.stderr).toBe(1);
      expect(execution.stderr).toContain(
        "sibling destination response in surviving Surface core after backend loss (source executed response observed)",
      );
      expect(execution.stderr).toContain('"omit":true,"applied":true');
    }, 130_000);

    it.for(["skip-palette", "delete-images"] as const)(
      "rejects actual %s during retained image theme reload",
      { timeout: 130_000 },
      async (control, testContext) => {
        const execution = await runOracle(
          "image-palette-reload",
          testContext,
          control,
        );
        expect(execution.exitCode, execution.stderr).toBe(1);
        expect(execution.stdout).toContain(
          "__OMXTERM_IMAGE_SCENARIO__reload-only",
        );
        expect(execution.stderr).toContain(
          "Retained palette/image reload failed:",
        );
        if (control === "skip-palette")
          expect(execution.stderr).toContain(
            '"retainedAnsiRed":[192,71,131,255]',
          );
        else {
          expect(execution.stderr).toContain(
            '"retainedAnsiRed":[255,128,170,255]',
          );
          expect(execution.stderr).toContain('"greenInChafaPlacement":0');
        }
      },
    );
  },
);

describe.skipIf(!["darwin", "linux", "win32"].includes(process.platform))(
  "focused Scrollback Search host oracle",
  () => {
    it("finds scrollback matches, edits the query through the application clipboard, and leaves keys to a focused terminal", async (testContext) => {
      const result = readResult(
        await runOracle("scrollback-search", testContext),
      );
      expect(result.sessionStarts).toBe(1);
      const { selectedStatus, ...evidence } = result.searchEvidence!;
      expect(selectedStatus).toMatch(/^\d+\/10$/);
      expect(evidence).toEqual({
        openedFocused: true,
        asciiStatus: "10",
        pastedQuery: "needleprivate",
        unicodeStatus: "1",
        themed: true,
        counterMatchesField: true,
        terminalKeysWhileOpen: true,
        openAfterTerminalKeys: true,
        closed: true,
        focusReturned: true,
        queryReachedPty: false,
        // Only the terminal-owned Escape's press and release.
        kittyEscapeWrites: "\u001b[27;1:1u\u001b[27;1:3u",
      });
    }, 130_000);
  },
);

describe.skipIf(!["darwin", "linux", "win32"].includes(process.platform))(
  "focused terminal export host oracle",
  () => {
    it("exports retained content or the selection without changing it, from the requesting tab", async (testContext) => {
      const result = readResult(
        await runOracle("terminal-export", testContext),
      );
      expect(result.exportEvidence).toEqual({
        contextMenuSelection: [false, false, true],
        contentKind: "content",
        contentFirstRow: true,
        contentLastRow: true,
        contentUnicode: true,
        contentRowsInOrder: true,
        selectionKind: "selection",
        selectionMatchesCopy: true,
        selectionPreserved: true,
        afterTabSwitchFromOriginalTab: true,
      });
    }, 130_000);
  },
);
