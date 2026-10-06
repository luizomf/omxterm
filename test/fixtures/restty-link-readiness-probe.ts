import { readFile } from "node:fs/promises";
import type { Plugin } from "esbuild";

interface RenderedDestination {
  readonly cols: number;
  readonly rows: number;
  readonly matches: boolean;
}

// The gesture-only paths are ASCII and start at cell zero on a cleared grid.
// Copy only a match bit before shaping can allocate; never retain borrowed WASM
// views or terminal text. This is submitted-frame readiness, not pixel proof.
export function createLinkDestinationObserver() {
  let expected: number[] | undefined;
  let presented: RenderedDestination | undefined;
  return {
    prepare(destination: string) {
      expected = Array.from(destination, (char) => char.codePointAt(0)!);
      presented = undefined;
    },
    capture(render: {
      cols: number;
      rows: number;
      codepoints?: ArrayLike<number>;
    }): RenderedDestination {
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
  canvas.__resttyLinkDestinationFixture = (${createLinkDestinationObserver.toString()})();
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
