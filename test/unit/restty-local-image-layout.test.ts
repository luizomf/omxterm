import type { BrowserWindow } from "electron";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
import { withLocalImageFixtureLayout } from "../fixtures/restty-local-image-layout";

function fixture(
  stuck = false,
  width = 1000,
  cellWidth = 10,
  inset = 0,
  dpr = 1,
  quantize = false,
) {
  const originalCols = Math.floor((width - inset) / cellWidth);
  const resizes = [{ cols: originalCols, rows: 30 }];
  const rect = { x: 0, y: 0, width, height: 600 };
  let saved = "color: red;";
  const content = {
    getBoundingClientRect: () => ({ ...rect }),
    getAttribute: () => saved,
    setAttribute(_name: string, value: string) {
      saved = value;
      rect.width = width;
      rect.height = 600;
      resizes.push({ cols: originalCols, rows: 30 });
    },
    removeAttribute() {
      this.setAttribute("style", "");
    },
    style: {
      setProperty(name: string, value: string) {
        if (name === "width" || name === "height") {
          const extent = Number.parseFloat(value);
          rect[name] = quantize
            ? Math.fround(extent - (name === "width" ? inset : 0)) +
              (name === "width" ? inset : 0)
            : extent;
          if (!stuck)
            resizes.push({
              cols: Math.floor(
                Math.floor((rect.width - inset) * dpr) /
                  Math.round(cellWidth * dpr),
              ),
              rows: Math.floor(
                Math.floor(rect.height * dpr) / Math.round(20 * dpr),
              ),
            });
        }
      },
    },
  };
  const canvas = {
    getBoundingClientRect: () => ({ ...rect, width: rect.width - inset }),
    get width() {
      return Math.floor((rect.width - inset) * dpr);
    },
    get height() {
      return Math.floor(rect.height * dpr);
    },
  };
  const surface = { getBoundingClientRect: () => ({ ...rect }) };
  const context = {
    devicePixelRatio: dpr,
    window: {},
    document: {
      querySelector: () => content,
      querySelectorAll: (selector: string) =>
        selector.includes("canvas") ? [canvas] : [surface],
    },
  };
  const window = {
    setSize() {
      throw new Error("Native window size is compositor-owned");
    },
    webContents: {
      async executeJavaScript(source: string) {
        return runInNewContext(source, context) as unknown;
      },
    },
  } as unknown as BrowserWindow;
  const options = {
    window,
    resizes,
    cellSize: [cellWidth, 20] as const,
    dpr,
    async waitFor(predicate: () => boolean | Promise<boolean>, label: string) {
      if (!(await predicate())) throw new Error(`Not ready: ${label}`);
    },
  };
  return { options, rect, canvas, context, saved: () => saved };
}

it("refits the actual content/grid and restores the original layout even when a link assertion fails", async () => {
  const f = fixture();
  const observed: number[] = [];
  await expect(
    withLocalImageFixtureLayout(f.options, async (refit) => {
      for (const phase of ["base", "shrunk", "base", "wide"] as const)
        observed.push((await refit(phase)).cols);
      throw new Error("link assertion");
    }),
  ).rejects.toThrow("link assertion");
  expect(observed).toEqual([76, 57, 76, 100]);
  expect(f.rect.width).toBe(1000);
  expect(f.options.resizes.at(-1)).toEqual({ cols: 100, rows: 30 });
  expect(f.saved()).toBe("color: red;");
  expect(f.context.window).toEqual({});
});

it("keeps hover capture partitions on actual cell edges instead of distributing unused canvas space", async () => {
  const f = fixture(false, 1011, 13, 16);
  await withLocalImageFixtureLayout(f.options, async (refit) => {
    const grid = await refit("base");
    expect(f.canvas.width).toBe(grid.cols * 13);
  });
});

it("preserves exact cell backing at fractional DPR despite quantization below a nominal CSS boundary", async () => {
  const f = fixture(false, 748, 8.4, 16, 2.5, true);
  await withLocalImageFixtureLayout(f.options, async (refit) => {
    const base = await refit("base");
    expect(base.cols).toBe(69);
    const shrunk = await refit("shrunk");
    expect(shrunk.cols).toBe(51);
    expect(f.canvas.width).toBe(1071);
    expect(Math.abs(f.rect.width - 16 - 51 * 8.4)).toBeLessThan(0.1);
  });
  expect(f.rect.width).toBe(748);
});

it("rejects a mismatched observed backing even when CSS and the PTY grid look aligned", async () => {
  const f = fixture();
  Object.defineProperty(f.canvas, "width", { get: () => 1 });
  await expect(
    withLocalImageFixtureLayout(f.options, async (refit) => refit("base")),
  ).rejects.toThrow("Local image content/PTY refit failed");
  expect(f.rect.width).toBe(1000);
  expect(f.context.window).toEqual({});
});

it("rejects unchanged PTY geometry despite resized content, and releases the layout", async () => {
  const f = fixture(true);
  await expect(
    withLocalImageFixtureLayout(f.options, async (refit) => refit("base")),
  ).rejects.toThrow("Local image content/PTY refit failed");
  expect(f.rect.width).toBe(1000);
  expect(f.saved()).toBe("color: red;");
  expect(f.context.window).toEqual({});
});
