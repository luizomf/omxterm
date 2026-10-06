import type { BrowserWindow } from "electron";
import type { HoverGeometry } from "./restty-hover-evidence";

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
