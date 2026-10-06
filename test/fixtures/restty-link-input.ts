import type { BrowserWindow } from "electron";
import {
  hoverCellPoint,
  HoverEvidenceError,
  sameHoverGeometry,
  type HoverGeometry,
} from "./restty-hover-evidence";

export interface CellSnapshot {
  readonly canvasId: number;
  readonly geometry: HoverGeometry;
  readonly destination?: {
    readonly cols: number;
    readonly rows: number;
    readonly matches: boolean;
  };
}
export interface TerminalSize {
  readonly cols: number;
  readonly rows: number;
  readonly snapshot?: CellSnapshot;
  readonly allowCanvasTranslation?: true;
}

export async function readCellSnapshot(
  window: BrowserWindow,
): Promise<CellSnapshot> {
  // Geometry must not inspect the core: an allocating selection query can
  // detach the renderer's borrowed WASM views before its legitimate lookup.
  return window.webContents.executeJavaScript(
    `(() => {
      const canvas = [...document.querySelectorAll('.restty-terminal-surface canvas')].find(c => c.getBoundingClientRect().width > 0);
      if (!canvas?.__resttyHoverFixture) throw new Error('Cell geometry observer is missing');
      const {canvasId, geometry} = canvas.__resttyHoverFixture();
      return {canvasId, geometry, destination: canvas.__resttyLinkDestinationFixture?.snapshot()};
    })()`,
    true,
  ) as Promise<CellSnapshot>;
}

export function cellPoint(
  snapshot: CellSnapshot,
  row: number,
  col: number,
  size: TerminalSize,
) {
  const { geometry } = snapshot;
  if (
    geometry.cols !== size.cols ||
    geometry.rows !== size.rows ||
    (size.snapshot &&
      (snapshot.canvasId !== size.snapshot.canvasId ||
        !sameHoverGeometry(
          size.allowCanvasTranslation
            ? {
                ...geometry,
                canvas: {
                  ...geometry.canvas,
                  x: size.snapshot.geometry.canvas.x,
                  y: size.snapshot.geometry.canvas.y,
                },
              }
            : geometry,
          size.snapshot.geometry,
        )))
  )
    throw new HoverEvidenceError("geometry-changed");
  return hoverCellPoint(geometry, row, col);
}

export async function terminalCellPoint(
  window: BrowserWindow,
  row: number,
  col: number,
  size: TerminalSize,
) {
  return cellPoint(await readCellSnapshot(window), row, col, size);
}

export async function clickTerminalCell(
  window: BrowserWindow,
  row: number,
  col: number,
  size: TerminalSize,
) {
  sendTerminalCellClick(
    window,
    await terminalCellPoint(window, row, col, size),
  );
}

export async function scrollTerminal(
  window: BrowserWindow,
  row: number,
  col: number,
  size: TerminalSize,
  deltaY: number,
): Promise<void> {
  const snapshot = await readCellSnapshot(window);
  const point = cellPoint(snapshot, row, col, size);
  // Revalidate in the dispatch operation itself: another renderer crossing can
  // expose a replacement canvas or different geometry after point calculation.
  await window.webContents.executeJavaScript(
    `(() => {
    const canvas = [...document.querySelectorAll('.restty-terminal-surface canvas')].find((candidate) => candidate.getBoundingClientRect().width > 0);
    const observed = canvas?.__resttyHoverFixture?.();
    if (observed?.canvasId !== ${snapshot.canvasId} ||
      JSON.stringify(observed.geometry) !== ${JSON.stringify(JSON.stringify(snapshot.geometry))})
      throw new Error('Restty hover geometry-changed');
    canvas.dispatchEvent(new WheelEvent('wheel', {bubbles: true, cancelable: true, clientX: ${point.x}, clientY: ${point.y}, deltaMode: 1, deltaY: ${deltaY}}));
  })()`,
    true,
  );
}

export async function drainGestureInput(window: BrowserWindow): Promise<void> {
  // Present queued native events, then cross the real preload invoke route.
  // Main has received preceding input/link sends when this FIFO round trip
  // resolves. No PTY sentinel is injected.
  await window.webContents.executeJavaScript(
    `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`,
    true,
  );
  await window.webContents.executeJavaScript(
    `window.omxterm.terminal.configuration().then(() => undefined)`,
    true,
  );
}

export function sendTerminalCellClick(
  window: BrowserWindow,
  point: { readonly x: number; readonly y: number },
) {
  const modifiers: Array<"meta" | "control"> =
    process.platform === "darwin" ? ["meta"] : ["control"];
  window.webContents.sendInputEvent({
    type: "mouseDown",
    x: point.x,
    y: point.y,
    button: "left",
    clickCount: 1,
    modifiers,
  });
  window.webContents.sendInputEvent({
    type: "mouseUp",
    x: point.x,
    y: point.y,
    button: "left",
    clickCount: 1,
    modifiers,
  });
}
