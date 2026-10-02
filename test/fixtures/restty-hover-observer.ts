import { readFile } from "node:fs/promises";
import type { Plugin } from "esbuild";
import { instrumentLocalImageCoreCells } from "./restty-local-image-core-probe";

// Fixture bundle only. Observe the actual set/draw calls without forcing dirty
// state, recognition, refresh, focus or a frame. No destination/cell text escapes.
export function instrumentResttyHover(source: string): string {
  const replace = (needle: string, value: string) => {
    if (source.split(needle).length !== 2)
      throw new Error("Pinned hover observation seam drift");
    source = source.replace(needle, value);
  };
  replace(
    "  function setVisibleLinkHover(cells) {",
    `  const hoverCanvasId = (globalThis.__resttyHoverCanvasId = (globalThis.__resttyHoverCanvasId ?? 0) + 1);
  const hoverDraw = { revision: 0, cells: 0, setAt: 0, drawRevision: -1, drawCells: 0, drawAt: 0, draws: 0 };
  const hoverEvents = [];
  const observeHoverEvent = event => {
    hoverEvents.push({ type: event.type, trusted: event.isTrusted, modified: Boolean(event.ctrlKey || event.metaKey), at: performance.now() });
    if (hoverEvents.length > 8) hoverEvents.shift();
  };
  for (const type of ["pointermove", "pointerleave", "wheel", "focusout", "scroll"])
    canvas.addEventListener(type, observeHoverEvent, true);
  for (const type of ["keydown", "keyup", "blur", "resize"])
    window.addEventListener(type, observeHoverEvent, true);
  canvas.__resttyHoverFixture = () => {
    const r = canvas.getBoundingClientRect();
    return { canvasId: hoverCanvasId, draw: { ...hoverDraw }, events: hoverEvents.slice(), geometry: {
      canvas: { x:r.x, y:r.y, width:r.width, height:r.height },
      backing: { width:canvas.width, height:canvas.height },
      viewport: { width:innerWidth, height:innerHeight }, dpr:devicePixelRatio,
      cols:gridState.cols, rows:gridState.rows, cellWidth:gridState.cellW, cellHeight:gridState.cellH
    } };
  };
  canvas.__resttyHoverFixture.didDraw = cells => {
    hoverDraw.drawRevision = hoverDraw.revision;
    hoverDraw.drawCells = cells;
    hoverDraw.drawAt = performance.now();
    hoverDraw.draws++;
  };
  cleanupFns.push(() => {
    delete canvas.__resttyHoverFixture;
    for (const type of ["pointermove", "pointerleave", "wheel", "focusout", "scroll"])
      canvas.removeEventListener(type, observeHoverEvent, true);
    for (const type of ["keydown", "keyup", "blur", "resize"])
      window.removeEventListener(type, observeHoverEvent, true);
  });
  function setVisibleLinkHover(cells) {
    hoverDraw.revision++;
    hoverDraw.cells = cells?.length ?? 0;
    hoverDraw.setAt = performance.now();`,
  );
  replace(
    "  renderWebGLGlyphPipeline(ctx);\n}",
    `  renderWebGLGlyphPipeline(ctx);
  deps.canvas.__resttyHoverFixture?.didDraw(deps.linkState.visibleHoverCells.size);
}`,
  );
  return source;
}

export const resttyHoverProbe: Plugin = {
  name: "restty-hover-observation",
  setup(api) {
    api.onLoad({ filter: /chunk-c0rcpsc5\.js$/ }, async ({ path }) => ({
      contents: instrumentResttyHover(
        instrumentLocalImageCoreCells(await readFile(path, "utf8")),
      ),
      loader: "js",
    }));
  },
};
