// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { harness } from "../fixtures/restty-surface-harness";
import { mountResttyTerminalSurface } from "../../src/terminal-surface/restty-terminal-surface";

function createAdapter() {
  return {
    start: vi.fn(async () => {}),
    write: vi.fn(),
    resize: vi.fn(),
    close: vi.fn(),
  };
}

// The size a session starts at, which a program that runs at once reads.
describe("Restty Terminal Surface start size", () => {
  beforeEach(() => {
    harness.instances.length = 0;
    harness.setInitError(undefined);
  });

  it.each([
    [
      "the grid it measured, pixels included",
      960,
      { cols: 118, rows: 37, pixelWidth: 1_888, pixelHeight: 1_184 },
    ],
    ["no size from a hidden tab's placeholder grid", 0, undefined],
  ])("starts the session at %s", async (_label, width, size) => {
    harness.setConnectGrid({ cols: 118, rows: 37, cellW: 16, cellH: 32 });
    try {
      const adapter = createAdapter();
      const container = document.createElement("main");
      container.getBoundingClientRect = () => ({ width }) as DOMRect;
      const surface = await mountResttyTerminalSurface(container, adapter);
      expect(adapter.start).toHaveBeenCalledExactlyOnceWith(
        expect.anything(),
        size,
      );
      surface.dispose();
    } finally {
      harness.setConnectGrid(undefined);
    }
  });

  it.each([
    [
      "sizes a hidden tab's grid from the host's estimate",
      0,
      { cols: 117, rows: 37, pixelWidth: 1_872, pixelHeight: 1_184 },
    ],
    [
      "ignores the estimate once laid out",
      960,
      { cols: 18, rows: 4, pixelWidth: 288, pixelHeight: 128 },
    ],
  ])("%s (#1041)", async (_label, width, size) => {
    // Restty's 300×150 default canvas makes an 18×4 grid at 16×32 cells.
    harness.setConnectGrid({ cellW: 16, cellH: 32 });
    vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(2);
    try {
      const adapter = createAdapter();
      const container = document.createElement("main");
      container.style.padding = "10px 20px";
      container.getBoundingClientRect = () => ({ width }) as DOMRect;
      const surface = await mountResttyTerminalSurface(container, adapter, {
        estimatedBox: () => ({ width: 980, height: 620 }),
      });
      expect(adapter.start).toHaveBeenCalledExactlyOnceWith(
        expect.anything(),
        size,
      );
      // The post-start replay sends the same grid.
      expect(adapter.resize).toHaveBeenLastCalledWith(size);
      surface.dispose();
    } finally {
      harness.setConnectGrid(undefined);
      vi.restoreAllMocks();
    }
  });

  it("starts without a size when nothing was measured yet", async () => {
    const adapter = createAdapter();
    const surface = await mountResttyTerminalSurface(
      document.createElement("main"),
      adapter,
    );
    expect(adapter.start).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      undefined,
    );
    surface.dispose();
  });
});
