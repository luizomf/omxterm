import type { BrowserWindow } from "electron";

interface Grid {
  readonly cols: number;
  readonly rows: number;
}
type WaitFor = (
  predicate: () => boolean | Promise<boolean>,
  label: string,
) => Promise<void>;
interface Layout {
  readonly width: number;
  readonly height: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly backingWidth: number;
  readonly backingHeight: number;
  readonly dpr: number;
  readonly sameSurface: boolean;
}

// Only this scenario owns the temporary content constraint. ResizeObserver and
// the production Surface/Adapter still perform every refit and real PTY resize.
export async function withLocalImageFixtureLayout<T>(
  options: {
    readonly window: BrowserWindow;
    readonly resizes: Grid[];
    readonly cellSize: readonly [number, number];
    readonly dpr: number;
    readonly waitFor: WaitFor;
  },
  run: (
    refit: (phase: "base" | "shrunk" | "wide") => Promise<Grid>,
  ) => Promise<T>,
): Promise<T> {
  const { window, resizes, waitFor } = options;
  const originalGrid = resizes.at(-1)!;
  const original = (await window.webContents.executeJavaScript(
    `(() => {
      if (window.__localImageFixtureLayout) throw new Error('Local image layout already owned');
      const content = document.querySelector('#terminal-window-content');
      const canvas = [...document.querySelectorAll('.restty-terminal-surface canvas')].find(c => c.getBoundingClientRect().width > 0);
      const surface = [...document.querySelectorAll('.restty-terminal-surface')].find(c => c.getBoundingClientRect().width > 0);
      if (!content || !canvas || !surface) throw new Error('Visible local image layout is missing');
      window.__localImageFixtureLayout = { content, canvas, surface, style: content.getAttribute('style') };
      const bounds = content.getBoundingClientRect();
      const pixels = canvas.getBoundingClientRect();
      return { width: bounds.width, height: bounds.height, canvasWidth: pixels.width, canvasHeight: pixels.height, backingWidth: canvas.width, backingHeight: canvas.height, dpr: devicePixelRatio, sameSurface: true };
    })()`,
    true,
  )) as Layout;
  const readLayout = async () =>
    (await window.webContents.executeJavaScript(
      `(() => {
        const saved = window.__localImageFixtureLayout;
        const canvas = [...document.querySelectorAll('.restty-terminal-surface canvas')].find(c => c.getBoundingClientRect().width > 0);
        const surface = [...document.querySelectorAll('.restty-terminal-surface')].find(c => c.getBoundingClientRect().width > 0);
        const bounds = saved.content.getBoundingClientRect();
        const pixels = canvas.getBoundingClientRect();
        return { width: bounds.width, height: bounds.height, canvasWidth: pixels.width, canvasHeight: pixels.height, backingWidth: canvas.width, backingHeight: canvas.height, dpr: devicePixelRatio, sameSurface: canvas === saved.canvas && surface === saved.surface };
      })()`,
      true,
    )) as Layout;
  const [cellWidth, cellHeight] = options.cellSize;
  const horizontalInset = original.width - original.canvasWidth;
  const verticalInset = original.height - original.canvasHeight;
  // Choose an interior of the intended backing-pixel bucket, not its boundary:
  // fractional CSS quantization can otherwise lose one device pixel/column.
  // This measured stimulus margin stays inside the unchanged 0.1 CSS budget;
  // acceptance still requires observed EXACT backing/grid, not an epsilon claim.
  const margin = Math.min(0.05, 1 / (16 * options.dpr));
  const align = (
    extent: number,
    inset: number,
    pitch: number,
    available: number,
  ) => {
    let cells = Math.floor((extent - inset) / pitch);
    if (cells * pitch + inset + margin > available) cells -= 1;
    return {
      extent: cells * pitch + inset + margin,
      cells,
      backing: cells * Math.round(pitch * options.dpr),
    };
  };
  const baseWidth = align(
    Math.min(760, original.width * 0.8),
    horizontalInset,
    cellWidth,
    original.width,
  );
  const heightTarget = align(
    Math.min(600, original.height),
    verticalInset,
    cellHeight,
    original.height,
  );
  const height = heightTarget.extent;
  const refit = async (phase: "base" | "shrunk" | "wide") => {
    const widthTarget =
      phase === "wide"
        ? null
        : align(
            baseWidth.extent * (phase === "shrunk" ? 0.75 : 1),
            horizontalInset,
            cellWidth,
            original.width,
          );
    const width = widthTarget?.extent ?? original.width;
    const previous = await readLayout();
    const previousGrid = resizes.at(-1)!;
    await window.webContents.executeJavaScript(
      `(() => {
        const style = window.__localImageFixtureLayout.content.style;
        style.setProperty('flex', 'none');
        style.setProperty('width', '${width}px');
        style.setProperty('height', '${height}px');
      })()`,
      true,
    );
    let layout: Layout | undefined;
    await waitFor(async () => {
      layout = await readLayout();
      if (!layout.sameSurface)
        throw new Error("Local image refit replaced the Surface/canvas");
      const grid = resizes.at(-1)!;
      return (
        Math.abs(layout.width - width) <= 1 &&
        Math.abs(layout.height - height) <= 1 &&
        layout.dpr === options.dpr &&
        (!widthTarget ||
          (layout.backingWidth === widthTarget.backing &&
            grid.cols === widthTarget.cells &&
            Math.abs(layout.canvasWidth - grid.cols * cellWidth) < 0.1)) &&
        layout.backingHeight === heightTarget.backing &&
        grid.rows === heightTarget.cells &&
        Math.abs(layout.canvasHeight - grid.rows * cellHeight) < 0.1 &&
        (width < previous.width
          ? layout.canvasWidth < previous.canvasWidth &&
            grid.cols < previousGrid.cols
          : layout.canvasWidth > previous.canvasWidth &&
            grid.cols > previousGrid.cols)
      );
    }, `local image ${phase} content and real PTY grid refit`).catch(
      (cause: unknown) => {
        throw new Error(
          `Local image content/PTY refit failed: ${JSON.stringify({ phase, widthTarget, heightTarget, previous, previousGrid, layout, grid: resizes.at(-1) })}`,
          { cause },
        );
      },
    );
    return resizes.at(-1)!;
  };
  try {
    return await run(refit);
  } finally {
    await window.webContents.executeJavaScript(
      `(() => {
        const saved = window.__localImageFixtureLayout;
        if (saved.style === null) saved.content.removeAttribute('style');
        else saved.content.setAttribute('style', saved.style);
      })()`,
      true,
    );
    try {
      await waitFor(async () => {
        const restored = await readLayout();
        const grid = resizes.at(-1)!;
        return (
          restored.sameSurface &&
          Math.abs(restored.canvasWidth - original.canvasWidth) <= 1 &&
          Math.abs(restored.canvasHeight - original.canvasHeight) <= 1 &&
          restored.backingWidth === original.backingWidth &&
          restored.backingHeight === original.backingHeight &&
          grid.cols === originalGrid.cols &&
          grid.rows === originalGrid.rows
        );
      }, "local image original layout and PTY grid restoration");
    } finally {
      await window.webContents.executeJavaScript(
        "delete window.__localImageFixtureLayout",
        true,
      );
    }
  }
}
