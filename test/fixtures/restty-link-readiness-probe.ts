import { readFile } from "node:fs/promises";
import type { Plugin } from "esbuild";

export interface LinkFixtureViewport {
  readonly offset: number;
  readonly total: number;
  readonly length: number;
  readonly alternate: boolean;
  readonly mouseActive: boolean;
}

// Only the known ASCII fixtures below the initial Unicode/wrapped phase use
// this contract. Row boundaries/clipping are fixture facts, not a wrap oracle.
export interface LinkFixtureFrame {
  readonly lines: readonly string[];
  readonly viewport: {
    readonly offset: number | "bottom";
    readonly total?: number;
    readonly alternate: boolean;
    readonly mouseActive: boolean;
  };
  readonly targets: ReadonlyArray<{
    readonly row: number;
    readonly col: number;
    readonly firstRow: number;
    readonly lastRow: number;
    readonly clippedStart: boolean;
    readonly clippedEnd: boolean;
    readonly url: string | null;
  }>;
}

export type LinkInvalidationOrigin =
  | "prepare"
  | "clear"
  | "output"
  | "viewport-scroll"
  | "viewport-scalar"
  | "manual";

interface RenderedDestination {
  readonly cols: number;
  readonly rows: number;
  readonly matches: boolean;
  readonly frameId?: number;
  readonly expectationId?: number;
  readonly viewport?: LinkFixtureViewport | undefined;
  readonly viewportMatches?: boolean;
}

interface DestinationCells {
  readonly cols: number;
  readonly rows: number;
  readonly codepoints?: ArrayLike<number> | null;
  readonly wide?: ArrayLike<number> | null;
  readonly graphemeLen?: ArrayLike<number> | null;
  readonly graphemeOffset?: ArrayLike<number> | null;
  readonly graphemeBuffer?: ArrayLike<number> | null;
}

// Copy only a match bit before shaping can allocate; never retain borrowed WASM
// views or terminal text. This is submitted-frame readiness, not pixel proof.
export function createLinkDestinationObserver(
  readCluster?: (render: DestinationCells, index: number) => string,
  resolve?: (input: {
    text: string;
    offset: number;
    clippedStart: boolean;
    clippedEnd: boolean;
  }) => { readonly url: string } | null | undefined,
  readViewport?: () => LinkFixtureViewport | undefined,
) {
  let expected: number[] | undefined;
  let web:
    | {
        destination: string;
        text: string;
        points: ReadonlyArray<readonly [number, number]>;
      }
    | undefined;
  let frame: LinkFixtureFrame | undefined;
  let frameId = 0;
  let expectationId = 0;
  let origin: LinkInvalidationOrigin = "clear";
  let presented: RenderedDestination | undefined;
  function matchesAsciiRows(
    render: DestinationCells,
    lines: readonly string[],
  ) {
    if (!render.codepoints || lines.length > render.rows) return false;
    for (let row = 0; row < render.rows; row++) {
      const line = lines[row] ?? "";
      if (line.length > render.cols) return false;
      for (let col = 0; col < render.cols; col++) {
        const index = row * render.cols + col;
        const cp = render.codepoints[index] ?? 0;
        if (
          (render.wide?.[index] ?? 0) !== 0 ||
          (render.graphemeLen?.[index] ?? 0) !== 0 ||
          (col < line.length
            ? cp !== line.charCodeAt(col)
            : cp !== 0 && cp !== 32)
        )
          return false;
      }
    }
    return true;
  }
  function captureKnownFrame(
    render: DestinationCells,
    expectation: LinkFixtureFrame,
  ): RenderedDestination {
    const viewport = readViewport?.();
    const viewportMatches = Boolean(
      viewport &&
      viewport.length === render.rows &&
      viewport.alternate === expectation.viewport.alternate &&
      viewport.mouseActive === expectation.viewport.mouseActive &&
      (expectation.viewport.offset === "bottom"
        ? viewport.offset + viewport.length === viewport.total
        : viewport.offset === expectation.viewport.offset) &&
      (expectation.viewport.total === undefined ||
        viewport.total === expectation.viewport.total),
    );
    const matches = Boolean(
      resolve &&
      viewportMatches &&
      matchesAsciiRows(render, expectation.lines) &&
      expectation.targets.every(
        ({ row, col, firstRow, lastRow, clippedStart, clippedEnd, url }) => {
          if (
            firstRow < 0 ||
            firstRow > row ||
            row > lastRow ||
            lastRow >= render.rows ||
            col < 0 ||
            col >= render.cols
          )
            return false;
          const text = expectation.lines.slice(firstRow, lastRow + 1).join("");
          const offset =
            expectation.lines.slice(firstRow, row).join("").length + col;
          return (
            (resolve!({ text, offset, clippedStart, clippedEnd })?.url ??
              null) === url
          );
        },
      ),
    );
    return {
      cols: render.cols,
      rows: render.rows,
      matches,
      frameId,
      expectationId,
      viewport,
      viewportMatches,
    };
  }
  return {
    // The local gesture-only paths are ASCII and start at cell zero.
    prepare(destination: string) {
      frame = undefined;
      frameId++;
      origin = "prepare";
      expectationId++;
      expected = Array.from(destination, (char) => char.codePointAt(0)!);
      web = undefined;
      presented = undefined;
    },
    // This fixture emits exactly one hard-break-free logical line at cell zero
    // on a cleared grid. Do not use this observation to join arbitrary output.
    prepareWeb(
      destination: string,
      prefix: string,
      points: ReadonlyArray<readonly [number, number]>,
    ) {
      frame = undefined;
      frameId++;
      origin = "prepare";
      expectationId++;
      expected = undefined;
      web = { destination, text: prefix + destination, points };
      presented = undefined;
    },
    prepareFrame(expectation: LinkFixtureFrame) {
      expected = undefined;
      web = undefined;
      frame = expectation;
      frameId++;
      origin = "prepare";
      expectationId++;
      presented = undefined;
    },
    capture(render: DestinationCells): RenderedDestination {
      if (frame) return captureKnownFrame(render, frame);
      if (web) {
        let matches = false;
        if (render.codepoints && readCluster && resolve) {
          let end = render.cols * render.rows;
          while (end > 0 && !(render.codepoints[end - 1] ?? 0)) end--;
          let wideWrapSpacer = false;
          const cells = Array.from({ length: end }, (_, index) => {
            const wide = render.wide?.[index] ?? 0;
            if (wide === 3) wideWrapSpacer = true;
            return wide === 2 || wide === 3 ? "" : readCluster(render, index);
          });
          const text = cells.join("");
          // Both value and cell offsets come from the submitted runtime cells,
          // not code-point counts (wide tails and combining clusters differ).
          // Current full-row selection includes the next row's wide glyph at
          // a wide-wrap spacer, so the actual interaction refuses that frame.
          matches =
            !wideWrapSpacer &&
            text === web.text &&
            web.points.length === 2 &&
            web.points.every(([row, col]) => {
              if (
                row < 0 ||
                col < 0 ||
                col >= render.cols ||
                row >= render.rows
              )
                return false;
              let index = row * render.cols + col;
              // Match normalizeSelectionCell2: a wide tail targets its leading
              // cell, not an empty cluster. Wide-wrap spacers remain refused.
              if (col > 0 && render.wide?.[index] === 2) index--;
              if (!cells[index]) return false;
              return (
                resolve({
                  text,
                  offset: cells.slice(0, index).join("").length,
                  clippedStart: false,
                  clippedEnd: false,
                })?.url === web!.destination
              );
            });
        }
        return { cols: render.cols, rows: render.rows, matches };
      }
      let matches = Boolean(
        expected &&
        render.codepoints &&
        expected.length <= render.cols * render.rows,
      );
      if (matches) {
        for (let index = 0; index < render.cols * render.rows; index++) {
          const actual = render.codepoints![index] ?? 0;
          if (
            index < expected!.length
              ? actual !== expected![index]
              : actual !== 0 && actual !== 32
          ) {
            matches = false;
            break;
          }
        }
      }
      return { cols: render.cols, rows: render.rows, matches };
    },
    present(snapshot: RenderedDestination) {
      if (snapshot.frameId !== undefined && snapshot.frameId !== frameId)
        return;
      presented = snapshot;
    },
    snapshot() {
      // Scalar reads cannot allocate/prepare cells. This also catches viewport
      // movement outside the two pinned scroll calls before dispatch.
      if (
        presented?.viewport &&
        JSON.stringify(presented.viewport) !== JSON.stringify(readViewport?.())
      ) {
        frameId++;
        origin = "viewport-scalar";
        presented = undefined;
      }
      return presented;
    },
    status() {
      return { frameId, expectationId, origin, viewport: readViewport?.() };
    },
    invalidate(reason: LinkInvalidationOrigin = "manual") {
      frameId++;
      origin = reason;
      presented = undefined;
    },
    clear() {
      frame = undefined;
      frameId++;
      origin = "clear";
      expectationId++;
      expected = undefined;
      web = undefined;
      presented = undefined;
    },
  };
}

export function instrumentResttyLinkDestination(source: string): string {
  const replace = (needle: string, replacement: string) => {
    if (source.split(needle).length !== 2)
      throw new Error("Pinned link destination observation seam drift");
    source = source.replace(needle, replacement);
  };
  const needle = "  let lastCursorForCpr = { row: 1, col: 1 };";
  replace(
    needle,
    `${needle}
  canvas.__resttyLinkDestinationFixture = (${createLinkDestinationObserver.toString()})(readClusterText, services.resolveVisibleLink, () => {
    if (!wasmHandle || !wasmExports) return undefined;
    return {
      offset: wasmExports.restty_scrollbar_offset(wasmHandle),
      total: wasmExports.restty_scrollbar_total(wasmHandle),
      length: wasmExports.restty_scrollbar_len(wasmHandle),
      alternate: inputHandler.isAltScreen(),
      mouseActive: inputHandler.isMouseActive(),
    };
  });
  cleanupFns.push(() => {
    canvas.__resttyLinkDestinationFixture?.clear();
    delete canvas.__resttyLinkDestinationFixture;
  });`,
  );
  replace(
    "    shared.wasm.write(handle, text);",
    `    options.getCanvas().__resttyLinkDestinationFixture?.invalidate('output');
    shared.wasm.write(handle, text);`,
  );
  const scroll = "    wasm.scrollViewport(wasmHandle, delta);";
  if (source.split(scroll).length !== 3)
    throw new Error("Pinned link viewport observation seam drift");
  source = source.replaceAll(
    scroll,
    `    getCanvas().__resttyLinkDestinationFixture?.invalidate('viewport-scroll');\n${scroll}`,
  );
  replace(
    "  populateWebGLSceneData(ctx);",
    `  const linkDestinationFrame = deps.canvas.__resttyLinkDestinationFixture?.capture(ctx);
  populateWebGLSceneData(ctx);`,
  );
  replace(
    "  renderWebGLGlyphPipeline(ctx);",
    `  renderWebGLGlyphPipeline(ctx);
  if (linkDestinationFrame) deps.canvas.__resttyLinkDestinationFixture?.present(linkDestinationFrame);`,
  );
  return source;
}

// Fixture bundle only. Observe the public preview owner, including opening;
// dialog.open alone cannot prove that an asynchronous null reply has settled.
export function instrumentResttyLinkPreview(source: string): string {
  const replace = (needle: string, replacement: string) => {
    if (source.split(needle).length !== 2)
      throw new Error("Restty link preview observation seam drift");
    source = source.replace(needle, replacement);
  };
  replace(
    "  let localImagePreview: LocalImagePreview | undefined;",
    `  let localImagePreview: LocalImagePreview | undefined;
  page.document.__resttyLinkPreviewFixture = () => localImagePreview?.isActive() ?? false;`,
  );
  replace(
    "    localImagePreview?.dispose();",
    `    delete page.document.__resttyLinkPreviewFixture;
    localImagePreview?.dispose();`,
  );
  return source;
}

export const resttyLinkReadinessProbe: Plugin = {
  name: "restty-link-readiness-observation",
  setup(api) {
    api.onLoad({ filter: /terminal-window-host\.ts$/ }, async ({ path }) => ({
      contents: instrumentResttyLinkPreview(await readFile(path, "utf8")),
      loader: "ts",
    }));
  },
};
