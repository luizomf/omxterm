import { afterEach, describe, expect, it, vi } from "vitest";
import type { TerminalSessionHandlers } from "../../src/terminal-surface/terminal-session-adapter";
import { sendKittyBase64 } from "../fixtures/kitty-image-data";

const KITTY_CHUNK_CHARACTERS = 4_096;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Kitty image fixture transport", () => {
  it("splits every large transmission chunk while crossing only one transport frame", async () => {
    const events: string[] = [];
    const outputs: string[] = [];
    const handlers: TerminalSessionHandlers = {
      onOutput(data) {
        events.push("output");
        outputs.push(data);
      },
      onExit() {},
    };
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      events.push("frame");
      callback(0);
      return 1;
    });
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
    const setTimeout = vi.spyOn(globalThis, "setTimeout");

    await sendKittyBase64(
      handlers,
      "A".repeat(KITTY_CHUNK_CHARACTERS * 65),
      { id: 601 },
      true,
    );

    expect(outputs).toHaveLength(65 * 2);
    for (let index = 0; index < outputs.length; index += 2) {
      expect(outputs[index]).toMatch(/^\u001b_G/u);
      expect(outputs[index]).not.toMatch(/\u001b\\$/u);
      expect(outputs[index + 1]).not.toMatch(/^\u001b_G/u);
      expect(outputs[index + 1]).toMatch(/\u001b\\$/u);
    }
    expect(events.slice(0, 3)).toEqual(["output", "frame", "output"]);
    expect(events.slice(-2)).toEqual(["frame", "frame"]);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(3);
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 0);
  });
});
