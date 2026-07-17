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
    const navigateHandlers = new Map<
      string,
      (event: { preventDefault(): void }) => void
    >();
    lockTerminalRendererNavigation({
      setWindowOpenHandler(handler) {
        openHandler = handler;
      },
      on(event, handler) {
        navigateHandlers.set(event, handler);
      },
    });
    const preventMainFrameNavigation = vi.fn();
    const preventSubframeNavigation = vi.fn();
    navigateHandlers.get("will-navigate")!({
      preventDefault: preventMainFrameNavigation,
    });
    navigateHandlers.get("will-frame-navigate")!({
      preventDefault: preventSubframeNavigation,
    });
    expect(openHandler!()).toEqual({ action: "deny" });
    expect(preventMainFrameNavigation).toHaveBeenCalledOnce();
    expect(preventSubframeNavigation).toHaveBeenCalledOnce();
  });
});
