import { describe, expect, it, vi } from "vitest";
import {
  lockTerminalRendererNavigation,
  terminalWindowOptions,
} from "../../src/main/terminal-window";

describe("Terminal Window startup contract", () => {
  it("uses small native chrome and an isolated renderer preload", () => {
    const options = terminalWindowOptions("/application/preload.cjs");

    expect(options.titleBarStyle).toBe("hiddenInset");
    expect(options.webPreferences).toMatchObject({
      preload: "/application/preload.cjs",
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    });
  });

  it("denies renderer-created windows and renderer navigation", () => {
    let openHandler: (() => { action: "deny" }) | undefined;
    let navigateHandler:
      ((event: { preventDefault(): void }) => void) | undefined;
    lockTerminalRendererNavigation({
      setWindowOpenHandler(handler) {
        openHandler = handler;
      },
      on(_event, handler) {
        navigateHandler = handler;
      },
    });
    const preventDefault = vi.fn();
    navigateHandler!({ preventDefault });
    expect(openHandler!()).toEqual({ action: "deny" });
    expect(preventDefault).toHaveBeenCalledOnce();
  });
});
