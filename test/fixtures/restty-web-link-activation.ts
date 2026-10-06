import type { ResttyLinkGestureOptions } from "./restty-link-gestures";
import {
  readCellSnapshot,
  sendTerminalCellClick,
  type CellSnapshot,
  type TerminalSize,
} from "./restty-link-input";
import {
  hoverCellPoint,
  HoverEvidenceError,
  sameHoverGeometry,
  validateHoverGeometry,
} from "./restty-hover-evidence";
import { gestureInputSince } from "./restty-gesture-evidence";

export async function exerciseInitialWebActivation(
  options: ResttyLinkGestureOptions,
) {
  const { window, deliverOutput, inputs, resizes, externalLinks, waitFor } =
    options;
  const size = resizes.at(-1);
  if (!size) throw new Error("Restty link fixture has no grid size");
  const initial = await readCellSnapshot(window);
  const visibleUrl = `https://example.test/漢${"a".repeat(size.cols)}`;
  // Both wide characters occupy two cells; the combining mark adds no column.
  const destinationColumns = Array.from(visibleUrl).length + 1;
  const canvasExpression = `[...document.querySelectorAll('.restty-terminal-surface canvas')].find(c => c.getBoundingClientRect().width > 0)`;
  if (externalLinks.length !== 0)
    throw new Error("Unexpected prior web-link request");
  let sentInputEvents = 0;
  const waitForPhase = async (
    predicate: Parameters<ResttyLinkGestureOptions["waitFor"]>[0],
    phase: string,
  ) => {
    try {
      await waitFor(predicate, phase);
    } catch (cause) {
      if (cause instanceof HoverEvidenceError) throw cause;
      // Counts describe this fixture's requests/sends, not native event origin.
      throw new Error(
        `${phase} failed (requests ${externalLinks.length}, sent input events ${sentInputEvents})`,
        { cause },
      );
    }
  };
  try {
    await window.webContents.executeJavaScript(
      `(() => {
        const observer = (${canvasExpression})?.__resttyLinkDestinationFixture;
        if (!observer) throw new Error('Link destination observer is missing');
        observer.prepareWeb(${JSON.stringify(visibleUrl)}, "漢e\\u0301 ", [[0, 4], [1, 2]]);
      })()`,
      true,
    );
    deliverOutput(
      `\u001b[2J\u001b[H\u001b[?25l\u001b[?1000h\u001b[?1006h漢e\u0301 ${visibleUrl}`,
    );
    deliverOutput("\u001b[?1049halternate\u001b[?1049l");
    // The former native resize was followed by clearing and reprinting this URL,
    // so it did not verify retained-output reflow. The local-image layout scenario
    // covers actual shrink/widen of retained output without that reprint.
    deliverOutput(
      `\u001b[2J\u001b[H漢e\u0301 \u001b]8;;https://hidden.test/different\u0007${visibleUrl}\u001b]8;;\u0007`,
    );
    const current = (snapshot: CellSnapshot) => {
      if (
        !Number.isSafeInteger(initial.canvasId) ||
        initial.canvasId <= 0 ||
        snapshot.canvasId !== initial.canvasId
      )
        throw new HoverEvidenceError("geometry-changed");
      const grid = resizes.at(-1);
      return (
        grid?.cols === snapshot.geometry.cols &&
        grid.rows === snapshot.geometry.rows
      );
    };
    const ready = (snapshot: CellSnapshot) =>
      current(snapshot) &&
      snapshot.destination?.matches === true &&
      snapshot.destination.cols === snapshot.geometry.cols &&
      snapshot.destination.rows === snapshot.geometry.rows;
    await waitForPhase(
      async () => ready(await readCellSnapshot(window)),
      "initial web current destination",
    );

    const inputBeforeLinks = inputs.join("");
    let prepared: CellSnapshot | undefined;
    for (const [row, col] of [
      [0, 4],
      [1, 2],
    ] as const) {
      // The readiness observation is not the gesture's geometry. Read again at
      // the actual input boundary, freeze the first click, and reject subsequent
      // changes. No output, sleep or IPC await separates validation and sending.
      const snapshot = await readCellSnapshot(window);
      if (!ready(snapshot))
        throw new HoverEvidenceError("stimulus-invalidated");
      if (prepared && !sameHoverGeometry(prepared.geometry, snapshot.geometry))
        throw new HoverEvidenceError("geometry-changed");
      validateHoverGeometry(snapshot.geometry);
      const { cols, rows } = snapshot.geometry;
      if (
        4 + destinationColumns <= cols + 2 ||
        4 + destinationColumns > cols * rows
      )
        throw new HoverEvidenceError("preparation");
      prepared ??= snapshot;
      sendTerminalCellClick(
        window,
        hoverCellPoint(snapshot.geometry, row, col),
      );
      sentInputEvents += 2;
    }
    if (!prepared) throw new HoverEvidenceError("preparation");
    const reflowedSize: TerminalSize = {
      cols: prepared.geometry.cols,
      rows: prepared.geometry.rows,
      snapshot: { canvasId: prepared.canvasId, geometry: prepared.geometry },
    };
    await waitForPhase(
      () => externalLinks.length === 2,
      "repeated visible link activation",
    );
    if (externalLinks[0] !== visibleUrl || externalLinks[1] !== visibleUrl)
      throw new Error("Restty link activation changed the literal destination");
    const validLinkMouseReports = gestureInputSince(
      inputs,
      inputBeforeLinks.length,
    );
    if (validLinkMouseReports !== "")
      throw new Error("Initial web gesture produced PTY input");
    return { reflowedSize, validLinkMouseReports };
  } finally {
    await window.webContents.executeJavaScript(
      `(${canvasExpression})?.__resttyLinkDestinationFixture?.clear()`,
      true,
    );
  }
}
