import type { BrowserWindow } from "electron";
import { afterEach, expect, it, vi } from "vitest";
import { exerciseAboutKeyboard } from "../fixtures/about-keyboard-exercise";

afterEach(() => vi.useRealTimers());

it("restores Kitty keyboard mode and focus reporting when the initial handshake reply is missing", async () => {
  vi.useFakeTimers();
  const window = {
    webContents: {
      executeJavaScript: vi.fn(),
      sendInputEvent: vi.fn(),
    },
  } as unknown as BrowserWindow;
  const show = vi.fn();
  const output: string[] = [];
  const rejected = expect(
    exerciseAboutKeyboard(
      window,
      show,
      (data) => output.push(data),
      () => "",
    ),
  ).rejects.toThrow("About keyboard phase not reached: mode 0 handshake");

  await vi.runAllTimersAsync();
  await rejected;
  expect(output).toEqual([
    "\u001b[?1004l\u001b[>0u\u001b[?u",
    "\u001b[<u\u001b[?1004h",
  ]);
  expect(show).not.toHaveBeenCalled();
});
