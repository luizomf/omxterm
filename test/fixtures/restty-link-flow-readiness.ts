import type { ResttyLinkGestureOptions } from "./restty-link-gestures";
import {
  cellPoint,
  drainGestureInput,
  sendTerminalCellClick,
  type CellSnapshot,
  type TerminalSize,
} from "./restty-link-input";
import type { LinkFixtureFrame } from "./restty-link-readiness-probe";
import { gestureInputSince } from "./restty-gesture-evidence";

// Bounded to this caller's known frames and existing wait/drain/geometry ports.
// Readiness is a submitted match bit, not forced core preparation or pixel proof.
export function createLinkFlowReadiness(
  options: ResttyLinkGestureOptions,
  size: TerminalSize,
) {
  const { window, waitFor, externalLinks } = options;
  const canvas = `[...document.querySelectorAll('.restty-terminal-surface canvas')].find(c => c.getBoundingClientRect().width > 0)`;
  let phase = "unprepared";
  let frameId: number | undefined;
  let sends = 0;
  const inputStart = options.inputs.join("").length;
  const observe = () =>
    window.webContents.executeJavaScript(
      `(() => {
    const canvas = ${canvas};
    if (!canvas?.__resttyLinkDestinationFixture || !canvas.__resttyHoverFixture)
      throw new Error('Link flow observer is missing');
    return {...canvas.__resttyHoverFixture(), destination: canvas.__resttyLinkDestinationFixture.snapshot()};
  })()`,
      true,
    ) as Promise<
      CellSnapshot & {
        destination?: {
          matches: boolean;
          cols: number;
          rows: number;
          frameId?: number;
        };
      }
    >;
  const ready = (snapshot: Awaited<ReturnType<typeof observe>>) =>
    snapshot.destination?.matches === true &&
    snapshot.destination.cols === size.cols &&
    snapshot.destination.rows === size.rows;
  const metadata = () =>
    `phase ${phase}, requests ${externalLinks.length}, sent input events ${sends}`;
  const noInput = () => {
    if (gestureInputSince(options.inputs, inputStart) !== "")
      throw new Error(`Link flow unexpected PTY input (${metadata()})`);
  };
  const settled = (expected: number) => {
    noInput();
    if (externalLinks.length !== expected)
      throw new Error(
        `Link flow excess requests (${metadata()}, expected ${expected})`,
      );
  };
  return {
    settled,
    async prepare(
      label: string,
      expectation: LinkFixtureFrame,
      output?: string,
    ) {
      phase = label;
      frameId = undefined;
      await window.webContents.executeJavaScript(
        `(${canvas}).__resttyLinkDestinationFixture.prepareFrame(${JSON.stringify(expectation)})`,
        true,
      );
      if (output !== undefined) options.deliverOutput(output);
    },
    async wait() {
      try {
        await waitFor(async () => {
          const snapshot = await observe();
          if (!ready(snapshot)) return false;
          frameId = snapshot.destination!.frameId;
          return true;
        }, `${phase} current frame`);
      } catch {
        throw new Error(`Link flow readiness exhausted (${metadata()})`);
      }
    },
    async points(cells: ReadonlyArray<readonly [number, number]>) {
      const snapshot = await observe();
      if (!ready(snapshot) || snapshot.destination!.frameId !== frameId)
        throw new Error(`Link flow preparation invalidated (${metadata()})`);
      return cells.map(([row, col]) => cellPoint(snapshot, row, col, size));
    },
    click(point: { x: number; y: number }) {
      sendTerminalCellClick(window, point);
      sends += 2;
    },
    sent() {
      sends++;
    },
    async count(expected: number) {
      try {
        await waitFor(
          () => externalLinks.length === expected,
          `${phase} activation`,
        );
      } catch {
        throw new Error(
          `Link flow activation count failed (${metadata()}, expected ${expected})`,
        );
      }
      await drainGestureInput(window);
      settled(expected);
    },
    async clear() {
      await window.webContents.executeJavaScript(
        `(${canvas})?.__resttyLinkDestinationFixture?.clear()`,
        true,
      );
    },
  };
}

export function hardRows(
  lines: readonly string[],
  viewport: LinkFixtureFrame["viewport"] = {
    offset: "bottom",
    mouseActive: true,
    alternate: false,
  },
): LinkFixtureFrame {
  return {
    lines,
    viewport,
    targets: lines.map((line, row) => ({
      row,
      col: 3,
      firstRow: row,
      lastRow: row,
      clippedStart: false,
      clippedEnd: false,
      url: line.startsWith("https://") ? line.replace(/,$/u, "") : null,
    })),
  };
}
