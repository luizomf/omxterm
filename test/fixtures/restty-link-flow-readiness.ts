import type { ResttyLinkGestureOptions } from "./restty-link-gestures";
import {
  cellPoint,
  drainGestureInput,
  sendTerminalCellClick,
  type CellSnapshot,
  type TerminalSize,
} from "./restty-link-input";
import type {
  createLinkDestinationObserver,
  LinkFixtureFrame,
} from "./restty-link-readiness-probe";
import { sameHoverGeometry } from "./restty-hover-evidence";
import { gestureInputSince } from "./restty-gesture-evidence";

type Observer = ReturnType<typeof createLinkDestinationObserver>;
type FlowSnapshot = CellSnapshot & {
  destination?: ReturnType<Observer["snapshot"]>;
  observation: ReturnType<Observer["status"]>;
};
function submitted(snapshot: FlowSnapshot, size: TerminalSize) {
  return (
    snapshot.destination?.matches === true &&
    snapshot.destination.cols === size.cols &&
    snapshot.destination.rows === size.rows &&
    snapshot.destination.frameId === snapshot.observation.frameId &&
    snapshot.destination.expectationId === snapshot.observation.expectationId
  );
}
function rejection(
  snapshot: FlowSnapshot,
  size: TerminalSize,
  anchor?: FlowSnapshot,
) {
  if (anchor) {
    if (snapshot.observation.expectationId !== anchor.observation.expectationId)
      return "expectation-changed";
    if (
      snapshot.canvasId !== anchor.canvasId ||
      !sameHoverGeometry(snapshot.geometry, anchor.geometry)
    )
      return "geometry-changed";
    if (
      JSON.stringify(snapshot.observation.viewport) !==
      JSON.stringify(anchor.destination?.viewport)
    )
      return "viewport-mode-difference";
  }
  if (!snapshot.destination) return "absent-snapshot";
  if (snapshot.destination.viewportMatches === false)
    return "viewport-mode-difference";
  if (!snapshot.destination.matches) return "content-mismatch";
  if (
    snapshot.destination.cols !== size.cols ||
    snapshot.destination.rows !== size.rows
  )
    return "grid-difference";
  if (snapshot.destination.expectationId !== snapshot.observation.expectationId)
    return "expectation-changed";
  if (snapshot.destination.frameId !== snapshot.observation.frameId)
    return "epoch-only";
  return undefined;
}
function diagnostic(
  snapshot: FlowSnapshot | undefined,
  acceptedEpoch?: number,
) {
  return `epoch ${snapshot?.observation.frameId ?? "none"}, accepted epoch ${acceptedEpoch ?? "none"}, submitted epoch ${snapshot?.destination?.frameId ?? "none"}, expectation ${snapshot?.observation.expectationId ?? "none"}, origin ${snapshot?.observation.origin ?? "unavailable"}, matched ${snapshot?.destination?.matches ?? "none"}`;
}

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
  let anchor: FlowSnapshot | undefined;
  const inputStart = options.inputs.join("").length;
  const observe = () =>
    window.webContents.executeJavaScript(
      `(() => {
    const canvas = ${canvas};
    if (!canvas?.__resttyLinkDestinationFixture || !canvas.__resttyHoverFixture)
      throw new Error('Link flow observer is missing');
    const destination = canvas.__resttyLinkDestinationFixture.snapshot();
    return {...canvas.__resttyHoverFixture(), destination, observation: canvas.__resttyLinkDestinationFixture.status()};
  })()`,
      true,
    ) as Promise<FlowSnapshot>;
  const metadata = () =>
    `phase ${phase}, requests ${externalLinks.length}, sent input events ${sends}`;
  const invalidated = (snapshot?: FlowSnapshot) =>
    new Error(
      `Link flow preparation invalidated (${metadata()}, reason ${snapshot ? (rejection(snapshot, size, anchor) ?? "observation-failed") : "absent-snapshot"}, ${diagnostic(snapshot, frameId)})`,
    );
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
      anchor = undefined;
      await window.webContents.executeJavaScript(
        `(${canvas}).__resttyLinkDestinationFixture.prepareFrame(${JSON.stringify(expectation)})`,
        true,
      );
      if (output !== undefined) options.deliverOutput(output);
    },
    async wait() {
      let snapshot: FlowSnapshot | undefined;
      try {
        await waitFor(async () => {
          snapshot = await observe();
          if (!submitted(snapshot, size)) return false;
          frameId = snapshot.destination!.frameId;
          anchor = snapshot;
          return true;
        }, `${phase} current frame`);
      } catch {
        throw new Error(
          `Link flow readiness exhausted (${metadata()}, reason ${snapshot ? (rejection(snapshot, size) ?? "observation-failed") : "absent-snapshot"}, ${diagnostic(snapshot)})`,
        );
      }
    },
    async points(
      cells: ReadonlyArray<readonly [number, number]>,
      label = phase,
    ) {
      phase = label;
      if (!anchor) throw invalidated();
      let snapshot = await observe();
      const current = () => {
        const reason = rejection(snapshot, size, anchor);
        if (reason && reason !== "absent-snapshot" && reason !== "epoch-only")
          throw invalidated(snapshot);
        return submitted(snapshot, size);
      };
      if (!current()) {
        // Observe only: no old match, reprint, re-click, gesture restart or
        // forced core update. Existing wait bound applies to a new submission.
        try {
          await waitFor(async () => {
            snapshot = await observe();
            return current();
          }, `${phase} resubmitted frame`);
        } catch {
          throw invalidated(snapshot);
        }
      }
      if (snapshot.destination!.frameId !== frameId)
        frameId = snapshot.destination!.frameId;
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
