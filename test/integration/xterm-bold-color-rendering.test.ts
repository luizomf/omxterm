// @vitest-environment jsdom
import type { Terminal as XtermTerminal } from "@xterm/xterm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let Terminal: typeof import("@xterm/xterm").Terminal;
let frames: FrameRequestCallback[];

function write(terminal: XtermTerminal, data: string): Promise<void> {
  return new Promise((resolve) => terminal.write(data, resolve));
}

describe("pinned xterm bold color rendering", () => {
  beforeAll(async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    }));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      measureText: () => ({ width: 10 }),
    } as unknown as CanvasRenderingContext2D);
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    ({ Terminal } = await import("@xterm/xterm"));
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps bold normal colors separate from explicitly bright colors", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const terminal = new Terminal({
      cols: 3,
      rows: 1,
      drawBoldTextInBrightColors: false,
    });
    terminal.open(container);

    await write(terminal, "\u001b[31mN\u001b[1mB\u001b[91mX");
    terminal.refresh(0, 0);
    while (frames.length > 0) frames.shift()!(0);

    const spans = [...container.querySelectorAll(".xterm-rows span")];
    expect(spans.map((span) => span.textContent)).toEqual(["N", "B", "X"]);
    expect(spans[0]?.classList).toContain("xterm-fg-1");
    expect(spans[1]?.classList).toContain("xterm-fg-1");
    expect(spans[1]?.classList).toContain("xterm-bold");
    expect(spans[2]?.classList).toContain("xterm-fg-9");
    expect(spans[2]?.classList).toContain("xterm-bold");

    terminal.dispose();
    container.remove();
  });
});
