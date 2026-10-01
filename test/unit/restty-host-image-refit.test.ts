import type { BrowserWindow } from "electron";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import {
  exerciseResttyImages,
  resttyImageEmitterSource,
} from "../fixtures/restty-host-images";
import type { ResttyImagePixelEvidence } from "../fixtures/restty-image-evidence";

it("starts image placement in a clean viewport/history independent of earlier host output", () => {
  const output: string[] = [];
  runInNewContext(resttyImageEmitterSource(), {
    process: {
      argv: ["node", "image-emitter.cjs", "fixture.png"],
      stdout: { write: (value: string) => output.push(value) },
      stdin: { isTTY: false, resume() {}, on() {} },
    },
    require(name: string) {
      if (name !== "node:fs") throw new Error("Unexpected emitter I/O");
      return { readFileSync: () => Buffer.from("synthetic PNG bytes") };
    },
  });
  expect(output[0]).toBe("\u001b[3J\u001b[2J\u001b[H\u001b[?25l");
  expect(output.at(-1)).toBe("\u001b[16t__RESTTY_IMAGES_SENT__\n");
});

const pixels: ResttyImagePixelEvidence = {
  bitmapSize: [800, 400],
  cellSize: [20, 20],
  changedInPiPlacement: 4800,
  changedOutsidePlacements: 0,
  colorBucketsInPiPlacement: 2000,
  colorBucketsOutsidePlacements: 1,
  colorBucketsInBitmap: 2001,
  greenInChafaPlacement: 1600,
  greenInBitmap: 1600,
  greenOutsideChafaPlacement: 0,
};

function fixture(stuckGrid = false, missingPixels = false) {
  let cols = 40;
  let sidebarVisible = false;
  let width = 800;
  let input = "";
  const toggles: boolean[] = [];
  const window = {
    getSize: () => [800, 400],
    setSize() {
      throw new Error("Native window sizing is not a content-refit stimulus");
    },
    webContents: {
      send(channel: string, action?: string) {
        if (channel === terminalIpc.fontZoom) cols = action === "in" ? 38 : 40;
        if (channel === terminalIpc.snippetsToggle) {
          sidebarVisible = !sidebarVisible;
          toggles.push(sidebarVisible);
          width = sidebarVisible ? 560 : 800;
          if (!stuckGrid) cols = sidebarVisible ? 28 : 40;
        }
      },
      async executeJavaScript(script: string) {
        if (script.includes("atob("))
          return missingPixels && sidebarVisible
            ? { ...pixels, greenInChafaPlacement: 0 }
            : pixels;
        if (script.includes("#snippets-sidebar"))
          return { sidebarVisible, sidebarReady: true, width, height: 400 };
        return { x: 0, y: 0, width, height: 400 };
      },
      async capturePage() {
        return { toPNG: () => Buffer.from("external screenshot port") };
      },
    },
  } as unknown as BrowserWindow;
  const run = () =>
    exerciseResttyImages({
      window,
      runEmitter() {
        input += "\u001b[6;20;20t";
      },
      output: () => "__RESTTY_IMAGES_SENT__",
      input: () => input,
      size: () => ({ cols, rows: 20 }),
      cellSize: async () => [20, 20],
      async waitFor(predicate, label) {
        if (!(await predicate())) throw new Error(`Not ready: ${label}`);
      },
    });
  return { run, toggles };
}

it("shrinks and restores image content through the production sidebar route without native size requests", async () => {
  const { run, toggles } = fixture();
  const evidence = await run();
  expect(toggles).toEqual([true, false]);
  expect(evidence).toMatchObject({
    contentRefit: {
      before: { grid: { cols: 40, rows: 20 }, width: 800 },
      shrunk: { grid: { cols: 28, rows: 20 }, width: 560 },
      restored: { grid: { cols: 40, rows: 20 }, width: 800 },
    },
    afterContentShrinkPixels: pixels,
    afterContentRestorePixels: pixels,
  });
});

it("reports unchanged PTY geometry separately from valid image pixels and restores the sidebar", async () => {
  const { run, toggles } = fixture(true);
  await expect(run()).rejects.toThrow("Image content/PTY refit failed");
  expect(toggles).toEqual([true, false]);
});

it("reports missing image pixels only after observed content and grid shrink, then restores the sidebar", async () => {
  const { run, toggles } = fixture(false, true);
  await expect(run()).rejects.toThrow(
    "Image pixels failed at Pi and Chafa images after content shrink",
  );
  expect(toggles).toEqual([true, false]);
});
