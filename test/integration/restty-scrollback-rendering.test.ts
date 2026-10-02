import {
  buildFixture,
  resultPrefix,
} from "../fixtures/restty-scrollback-rendering-build";
import { runNativeFixture } from "../fixtures/run-native-fixture";
import {
  hasNativeDrag,
  type NativeInputObservation,
} from "../fixtures/scrollback-native-input";
import {
  verifyDepthEvidence,
  type DepthPhase,
} from "../fixtures/restty-depth-evidence";
import { createRequire } from "node:module";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { applyChromiumSandboxPolicy } from "../../src/main/chromium-sandbox-policy";

const electronExecutable = createRequire(import.meta.url)("electron") as string;

interface Metrics {
  readonly scrollHeight: number;
  readonly clientHeight: number;
  readonly scrollTop: number;
  readonly sameCanvas: boolean;
}

interface Result {
  readonly nativeDrag: NativeInputObservation;
  readonly nativeCharacter: NativeInputObservation;
  readonly depth: DepthPhase[];
  readonly hidden: {
    synchronizedReveal: {
      batchedClears: number;
      before: number[];
      selected: number[];
      focused: number[];
      completed: number[];
    };
    pendingGeometrySynchronizedReveal: Result["hidden"]["synchronizedReveal"] & {
      geometry: {
        originalHostWidth: number;
        narrowHostWidth: number;
        narrowCanvasWidth: number;
        restoredHostWidth: number;
        pendingCanvasWidth: number;
        fittedCanvasWidth: number;
        dpr: number;
      };
    };
    ingestion: {
      acked: boolean;
      titles: string[];
      bells: number;
      replies: number;
      retained: boolean;
      ordered: boolean;
    };
    lifecycle: {
      rapidRefreshes: number;
      deadRafCallbacks: number;
      mountCalls: Record<string, number>;
      beforeClose: Record<string, number>;
      afterClose: Record<string, number>;
      hiddenClosed: boolean;
      pendingClosed: boolean;
      usable: boolean;
    };
    images: {
      retained: { red: number; green: number };
      retainedAgain: { red: number; green: number };
      deleted: {
        name: string;
        acked: boolean;
        visible: { red: number };
        revealed: { red: number };
        hiddenClears: number;
        releasedTextures: number;
      }[];
      disposal: {
        releasedTextures: number;
        hiddenClears: number;
        detached: boolean;
      };
    };
    idle: { surfaces: Record<string, number>[] };
    output: { surfaces: Record<string, number>[] };
    reveal: {
      geometry: {
        cursor: { row: number; col: number };
        rows: number;
        cols: number;
      };
      foregroundPixels: number;
      cursorForeground: number;
      revealedSize: { rows: number; cols: number };
      baseline: { rows: number; cols: number };
      pixel: number[];
      calls: Record<string, number>;
      hiddenSizes: unknown[];
      sameCanvas: boolean;
      canvasWidth: number;
      expectedWidth: number;
    };
  };
  readonly resizeAtBottom: {
    readonly before: Metrics;
    readonly reduced: Metrics;
    readonly restored: Metrics;
  };
  readonly viewport: {
    readonly outputTop: number;
    readonly typed: Metrics;
    readonly injected: Metrics;
    readonly writes: string[];
    readonly geometry: {
      sizes: { cols: number; rows: number }[];
      baseline: { cols: number; rows: number };
      hiddenSizes: { cols: number; rows: number }[];
      hiddenCanvasUnchanged: boolean;
      sameCanvas: boolean;
    };
  };
  readonly initial: Metrics;
  readonly scrolledTop: number;
  readonly autoscrollStartTop: number;
  readonly autoscrolledTop: number;
  readonly resized: Metrics;
  readonly reduced: Metrics;
  readonly selectedPixels: number;
  readonly zero: Metrics;
  readonly positiveAgain: Metrics;
  readonly security: {
    readonly contextIsolation: boolean;
    readonly nodeIntegration: boolean;
    readonly sandbox: boolean;
    readonly webSecurity: boolean;
  };
}

describe("Restty scrollback through the production Surface seam", () => {
  it("scrolls and selects retained text while live zero and re-enable keep the same core", async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), "omxterm-restty-scrollback-"),
    );
    await buildFixture(root);
    const execution = await runFixture(root);
    expect(execution.reason).toBe("exit");
    expect(execution.cleanupErrors).toEqual([]);
    const line = execution.stdout
      .split("\n")
      .find((entry) => entry.startsWith(resultPrefix));
    const result = line
      ? (JSON.parse(line.slice(resultPrefix.length)) as Result)
      : undefined;

    expect(
      execution.exitCode,
      `Scrollback fixture failed.\nstdout:\n${execution.stdout}\nstderr:\n${execution.stderr}`,
    ).toBe(0);
    expect(result).toBeDefined();
    if (process.env.OMXTERM_HIDDEN_EVIDENCE)
      await writeFile(
        process.env.OMXTERM_HIDDEN_EVIDENCE,
        JSON.stringify(result!.hidden, null, 2) + "\n",
      );
    await verifyDepthEvidence(result!);
    for (const measurement of [result!.hidden.idle, result!.hidden.output]) {
      for (const [name, count] of Object.entries(measurement.surfaces[0]!))
        if (name !== "deleteTexture")
          expect.soft(count, `hidden ${name}`).toBe(0);
      expect.soft(measurement.surfaces[1]!.clear).toBeGreaterThan(0);
    }
    const synchronized = result!.hidden.synchronizedReveal;
    expect.soft(synchronized.batchedClears).toBe(0);
    expect.soft(synchronized.before).toEqual([12, 34, 56, 255]);
    expect.soft(synchronized.selected).toEqual(synchronized.before);
    expect.soft(synchronized.focused).toEqual(synchronized.before);
    expect.soft(synchronized.completed).toEqual([65, 43, 21, 255]);
    const pending = result!.hidden.pendingGeometrySynchronizedReveal;
    const geometry = pending.geometry;
    expect(geometry.narrowHostWidth).toBeLessThan(geometry.originalHostWidth);
    expect(geometry.restoredHostWidth).toBe(geometry.originalHostWidth);
    expect(geometry.pendingCanvasWidth).toBe(geometry.narrowCanvasWidth);
    expect(
      Math.floor((geometry.restoredHostWidth * geometry.dpr) / 2),
    ).toBeGreaterThan(geometry.narrowCanvasWidth);
    expect(Math.floor(geometry.fittedCanvasWidth / 2)).toBeGreaterThan(
      geometry.narrowCanvasWidth,
    );
    expect.soft(pending.batchedClears).toBe(0);
    expect.soft(pending.before).toEqual([12, 34, 56, 255]);
    expect.soft(pending.selected).toEqual(pending.before);
    expect.soft(pending.focused).toEqual(pending.before);
    expect.soft(pending.completed).toEqual([65, 43, 21, 255]);
    expect.soft(result!.hidden.reveal.pixel).toEqual([12, 34, 56, 255]);
    expect.soft(result!.hidden.reveal.foregroundPixels).toBeGreaterThan(0);
    expect.soft(result!.hidden.reveal.cursorForeground).toBeGreaterThan(0);
    expect.soft(result!.hidden.reveal.geometry.cursor.col).toBe(14);
    expect
      .soft(result!.hidden.reveal.geometry.cursor.row)
      .toBeLessThan(result!.hidden.reveal.revealedSize.rows);
    expect
      .soft(result!.hidden.reveal.geometry.rows)
      .toBe(result!.hidden.reveal.revealedSize.rows);
    expect
      .soft(result!.hidden.reveal.geometry.cols)
      .toBe(result!.hidden.reveal.revealedSize.cols);
    expect
      .soft(result!.hidden.reveal.revealedSize.cols)
      .toBeLessThan(result!.hidden.reveal.baseline.cols);
    expect.soft(result!.hidden.reveal.calls.clear).toBeGreaterThan(0);
    expect.soft(result!.hidden.reveal.hiddenSizes).toEqual([]);
    expect.soft(result!.hidden.reveal.sameCanvas).toBe(true);
    expect
      .soft(result!.hidden.reveal.canvasWidth)
      .toBe(result!.hidden.reveal.expectedWidth);
    expect.soft(result!.hidden.ingestion).toEqual({
      acked: true,
      titles: ["hidden-title"],
      bells: 1,
      replies: 1,
      retained: true,
      ordered: true,
    });
    const lifetime = result!.hidden.lifecycle;
    expect.soft(lifetime.rapidRefreshes).toBe(8);
    expect.soft(lifetime.deadRafCallbacks).toBe(0);
    for (const name of [
      "clear",
      "drawArraysInstanced",
      "bufferSubData",
      "texImage2D",
      "texSubImage2D",
    ])
      expect
        .soft(lifetime.mountCalls[name] ?? 0, `hidden mount ${name}`)
        .toBe(0);
    expect
      .soft(lifetime.afterClose.clear ?? 0)
      .toBe(lifetime.beforeClose.clear ?? 0);
    expect
      .soft(lifetime.hiddenClosed && lifetime.pendingClosed && lifetime.usable)
      .toBe(true);
    expect
      .soft(result!.hidden.images.retainedAgain)
      .toEqual(result!.hidden.images.retained);
    expect.soft(result!.hidden.images.retained.red).toBeGreaterThan(0);
    expect.soft(result!.hidden.images.retained.green).toBeGreaterThan(0);
    for (const deletion of result!.hidden.images.deleted) {
      expect.soft(deletion.acked, deletion.name).toBe(true);
      expect.soft(deletion.visible.red, deletion.name).toBeGreaterThan(0);
      expect.soft(deletion.revealed.red, deletion.name).toBe(0);
      expect.soft(deletion.hiddenClears, deletion.name).toBe(0);
      expect.soft(deletion.releasedTextures, deletion.name).toBeGreaterThan(0);
    }
    expect.soft(result!.hidden.images.disposal.detached).toBe(true);
    expect.soft(result!.hidden.images.disposal.hiddenClears).toBe(0);
    expect
      .soft(result!.hidden.images.disposal.releasedTextures)
      .toBeGreaterThan(0);
    for (const metrics of Object.values(result!.resizeAtBottom)) {
      expect
        .soft(metrics.scrollTop)
        .toBe(metrics.scrollHeight - metrics.clientHeight);
      expect.soft(metrics.sameCanvas).toBe(true);
    }
    expect
      .soft(result!.resizeAtBottom.reduced.clientHeight)
      .toBeLessThan(result!.resizeAtBottom.before.clientHeight);
    expect.soft(result!.viewport.outputTop).toBe(0);
    expect
      .soft(result!.viewport.typed.scrollTop)
      .toBe(
        result!.viewport.typed.scrollHeight -
          result!.viewport.typed.clientHeight,
      );
    expect
      .soft(result!.viewport.injected.scrollTop)
      .toBe(
        result!.viewport.injected.scrollHeight -
          result!.viewport.injected.clientHeight,
      );
    expect.soft(result!.viewport.writes).toContain("x");
    expect.soft(result!.viewport.writes).toContain("injected");
    expect.soft(result!.viewport.geometry.sameCanvas).toBe(true);
    expect.soft(result!.viewport.geometry.hiddenSizes).toEqual([]);
    expect.soft(result!.viewport.geometry.hiddenCanvasUnchanged).toBe(true);
    expect
      .soft(result!.viewport.geometry.sizes.at(-1)?.cols)
      .toBeLessThan(result!.viewport.geometry.baseline.cols);
    expect
      .soft(
        result!.viewport.geometry.sizes.every(
          ({ cols, rows }) => cols > 1 && rows > 1,
        ),
      )
      .toBe(true);
    expect(result!.initial.scrollHeight).toBeGreaterThan(
      result!.initial.clientHeight,
    );
    expect(result!.initial.scrollTop).toBeGreaterThan(0);
    expect(result!.scrolledTop).toBe(0);
    expect(result!.nativeDrag).toBeDefined();
    expect(
      hasNativeDrag(result!.nativeDrag, {
        x: Math.floor(result!.nativeDrag.geometry.x + 80),
        startY: Math.floor(
          result!.nativeDrag.geometry.y +
            result!.nativeDrag.geometry.height -
            30,
        ),
        endY: Math.floor(result!.nativeDrag.geometry.y),
      }),
    ).toBe(true);
    expect(result!.nativeDrag.up?.trusted).toBe(true);
    expect(result!.nativeCharacter.character).toEqual({
      trusted: true,
      input: true,
    });
    expect(result!.nativeCharacter.accepted).toBe(true);
    expect(result!.autoscrollStartTop).toBeGreaterThan(0);
    expect(result!.autoscrolledTop).toBeLessThan(result!.autoscrollStartTop);
    expect(result!.resized.sameCanvas).toBe(true);
    expect(result!.resized.scrollHeight).toBeGreaterThan(
      result!.resized.clientHeight,
    );
    expect(result!.reduced.scrollTop).toBeGreaterThanOrEqual(0);
    expect(result!.reduced.scrollTop).toBeLessThanOrEqual(
      result!.reduced.scrollHeight - result!.reduced.clientHeight,
    );
    expect(result!.reduced.scrollHeight).toBeLessThan(
      result!.initial.scrollHeight,
    );
    expect(result!.reduced.scrollHeight).toBeGreaterThan(
      result!.reduced.clientHeight,
    );
    expect(result!.reduced.sameCanvas).toBe(true);
    expect(result!.selectedPixels).toBeGreaterThan(0);
    expect(result!.zero.scrollHeight).toBe(result!.zero.clientHeight);
    expect(result!.zero.sameCanvas).toBe(true);
    expect(result!.positiveAgain.scrollHeight).toBeGreaterThan(
      result!.positiveAgain.clientHeight,
    );
    expect(result!.positiveAgain.sameCanvas).toBe(true);
    expect(result!.security).toEqual({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    });
  }, 120_000);

  it.each([
    ["down", "mouse-down"],
    ["character", "character"],
  ] as const)(
    "rejects withheld native %s at its named stimulus phase",
    async (control, phase) => {
      const root = await mkdtemp(
        path.join(tmpdir(), "omxterm-restty-input-control-"),
      );
      await buildFixture(root, "scrollback", control);
      const execution = await runFixture(root);
      expect(execution).toMatchObject({
        exitCode: 1,
        reason: "exit",
        cleanupErrors: [],
      });
      expect(execution.stdout).toContain(
        "__OMXTERM_SCROLLBACK_INPUT_CONTROL__" +
          JSON.stringify({ control, withheld: true }),
      );
      const records = execution.stdout
        .split("\n")
        .filter((line) => line.startsWith("__OMXTERM_SCROLLBACK_INPUT__"))
        .map(
          (line) =>
            JSON.parse(line.slice("__OMXTERM_SCROLLBACK_INPUT__".length)) as {
              phase: string;
              status: string;
              category: string;
              observation: NativeInputObservation;
              native: {
                visible: boolean;
                minimized: boolean;
                focused: boolean;
              };
            },
        );
      const failure = records.find((record) => record.status === "failure");
      expect(failure).toMatchObject({
        phase,
        category: "stimulus-unavailable",
      });
      const ready = records.find(
        (record) =>
          record.phase ===
            (control === "down" ? "mouse-ready" : "character-ready") &&
          record.status === "complete",
      );
      expect(ready).toMatchObject({
        native: { visible: true, minimized: false, focused: true },
        observation: { ready: true },
      });
      expect(
        records.filter((record) => record.status === "failure"),
      ).toHaveLength(1);
      if (control === "down") expect(failure!.observation.down).toBeNull();
      else {
        expect(failure!.observation.character).toBeNull();
        expect(failure!.observation.accepted).toBe(false);
        expect(records).toContainEqual(
          expect.objectContaining({ phase: "mouse-drag", status: "complete" }),
        );
      }
      expect(execution.stderr).toContain(
        "Scrollback stimulus-unavailable at " + phase,
      );
    },
    30_000,
  );
});

async function runFixture(root: string) {
  const chromiumArguments =
    process.platform === "linux" ? ["--ozone-platform=x11"] : [];
  applyChromiumSandboxPolicy({
    appendSwitch(name) {
      chromiumArguments.push(`--${name}`);
    },
  });
  return runNativeFixture({
    executable: electronExecutable,
    args: [...chromiumArguments, root],
    root,
    timeout: 110_000,
  });
}
