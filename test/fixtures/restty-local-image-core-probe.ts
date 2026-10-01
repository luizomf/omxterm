import type { BrowserWindow } from "electron";
import type { ResttyWasm } from "restty/internal";
import type { LocalImageCoreCells } from "./restty-local-image-root";

export function snapshotLocalImageCoreCells(
  wasm: Pick<
    ResttyWasm,
    "renderUpdate" | "getRenderState" | "getSelectionText"
  >,
  handle: number,
): LocalImageCoreCells | null {
  wasm.renderUpdate(handle);
  const state = wasm.getRenderState(handle);
  if (!state?.codepoints) return null;
  return {
    cols: state.cols,
    rows: state.rows,
    codepoints: Array.from(state.codepoints),
    text: wasm
      .getSelectionText(handle, 0, 0, state.rows - 1, state.cols - 1)
      .trimEnd(),
  };
}

// Composed with the existing broad-host bundle probe: no dependency bytes,
// production API or parsing behavior change. Observe this Surface's real core,
// not OutputFilter's UTF-16 cursor hint. renderUpdate only prepares cell views;
// this probe never writes, resizes, clears, draws or uploads a frame.
export function instrumentLocalImageCoreCells(source: string): string {
  const needle = "  let lastCursorForCpr = { row: 1, col: 1 };";
  if (source.split(needle).length !== 2)
    throw new Error("Pinned local image core observation seam drift");
  return source.replace(
    needle,
    `${needle}
  canvas.__localImageFixtureCoreCells = () => {
    if (!wasmReady || !wasm || !wasmHandle) return null;
    return (${snapshotLocalImageCoreCells.toString()})(wasm, wasmHandle);
  };
  cleanupFns.push(() => delete canvas.__localImageFixtureCoreCells);`,
  );
}

export async function readLocalImageCoreCells(
  window: BrowserWindow,
): Promise<LocalImageCoreCells | null> {
  return window.webContents.executeJavaScript(
    `(() => {
    const canvas = [...document.querySelectorAll('.restty-terminal-surface canvas')].find(c => c.getBoundingClientRect().width > 0);
    if (!canvas?.__localImageFixtureCoreCells) throw new Error('Fixture core cell observer is missing');
    return canvas.__localImageFixtureCoreCells();
  })()`,
    true,
  ) as Promise<LocalImageCoreCells | null>;
}
