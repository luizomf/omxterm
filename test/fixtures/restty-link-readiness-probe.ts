import { readFile } from "node:fs/promises";
import type { Plugin } from "esbuild";

interface RenderedDestination {
  readonly cols: number;
  readonly rows: number;
  readonly matches: boolean;
}

interface DestinationCells {
  readonly cols: number;
  readonly rows: number;
  readonly codepoints?: ArrayLike<number>;
  readonly wide?: ArrayLike<number>;
  readonly graphemeLen?: ArrayLike<number>;
  readonly graphemeOffset?: ArrayLike<number>;
  readonly graphemeBuffer?: ArrayLike<number>;
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
) {
  let expected: number[] | undefined;
  let web:
    | {
        destination: string;
        text: string;
        points: ReadonlyArray<readonly [number, number]>;
      }
    | undefined;
  let presented: RenderedDestination | undefined;
  return {
    // The local gesture-only paths are ASCII and start at cell zero.
    prepare(destination: string) {
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
      expected = undefined;
      web = { destination, text: prefix + destination, points };
      presented = undefined;
    },
    capture(render: DestinationCells): RenderedDestination {
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
      presented = snapshot;
    },
    snapshot() {
      return presented;
    },
    invalidate() {
      presented = undefined;
    },
    clear() {
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
  canvas.__resttyLinkDestinationFixture = (${createLinkDestinationObserver.toString()})(readClusterText, services.resolveVisibleLink);
  cleanupFns.push(() => {
    canvas.__resttyLinkDestinationFixture?.clear();
    delete canvas.__resttyLinkDestinationFixture;
  });`,
  );
  replace(
    "    shared.wasm.write(handle, text);",
    `    options.getCanvas().__resttyLinkDestinationFixture?.invalidate();
    shared.wasm.write(handle, text);`,
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
    "  const previewActive = () => localImagePreview?.isActive() ?? false;",
    `  const previewActive = () => localImagePreview?.isActive() ?? false;
  page.document.__resttyLinkPreviewFixture = previewActive;`,
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
