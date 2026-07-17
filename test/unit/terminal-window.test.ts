import { describe, expect, it, vi } from "vitest";
import {
  lockTerminalRendererNavigation,
  terminalWindowOptions,
} from "../../src/main/terminal-window";
import { DEFAULT_USER_CONFIGURATION } from "../../src/main/user-configuration";

describe("Terminal Window startup contract", () => {
  const extremeGeometryConfiguration = Object.freeze({
    ...DEFAULT_USER_CONFIGURATION,
    fontSize: 72,
    fontLineHeight: 2,
    terminalPadding: Object.freeze({
      top: 128,
      right: 128,
      bottom: 128,
      left: 128,
    }),
  });

  it("uses small native chrome and an isolated renderer preload", () => {
    const options = terminalWindowOptions(
      "/application/preload.cjs",
      DEFAULT_USER_CONFIGURATION,
    );

    expect(options.titleBarStyle).toBe("hiddenInset");
    expect(options.webPreferences).toMatchObject({
      preload: "/application/preload.cjs",
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    });
  });

  it("keeps the existing native minimums for common configuration", () => {
    const options = terminalWindowOptions(
      "/application/preload.cjs",
      DEFAULT_USER_CONFIGURATION,
    );

    expect(options.minWidth).toBe(320);
    expect(options.minHeight).toBe(200);
  });

  it("keeps two xterm columns visible at extreme horizontal spacing", () => {
    const options = terminalWindowOptions(
      "/application/preload.cjs",
      extremeGeometryConfiguration,
    );

    expect(options.minWidth).toBe(414);
  });

  it("keeps one xterm row visible at extreme vertical spacing", () => {
    const options = terminalWindowOptions(
      "/application/preload.cjs",
      extremeGeometryConfiguration,
    );

    expect(options.minHeight).toBe(574);
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
