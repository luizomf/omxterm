import { describe, expect, it, vi } from "vitest";
import {
  lockTerminalRendererNavigation,
  terminalNativeTitleInset,
  terminalWindowOptions,
} from "../../src/main/terminal-window";
import { DEFAULT_USER_CONFIGURATION } from "../../src/main/user-configuration";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";

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

  const configuredZapfinoGeometry = Object.freeze({
    ...extremeGeometryConfiguration,
    fontFamily: "Zapfino",
    configuredFontMetrics: Object.freeze({
      cellWidth: 135.72,
      cellHeight: 243.18017578125,
    }),
  });

  it("uses small native chrome and an isolated renderer preload", () => {
    const options = terminalWindowOptions(
      "/application/preload.cjs",
      DEFAULT_USER_CONFIGURATION,
      "darwin",
    );

    expect(terminalNativeTitleInset("darwin")).toBe(30);
    expect(options.useContentSize).toBe(false);
    expect(options.titleBarStyle).toBe("hiddenInset");
    expect(options.webPreferences).toMatchObject({
      preload: "/application/preload.cjs",
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    });
  });

  it("uses native Linux chrome without an app-controlled title inset", () => {
    const options = terminalWindowOptions(
      "/application/preload.cjs",
      extremeGeometryConfiguration,
      "linux",
    );

    expect(terminalNativeTitleInset("linux")).toBe(0);
    expect(options.useContentSize).toBe(true);
    expect(options.titleBarStyle).toBe("default");
    expect(options.minHeight).toBe(544);
  });

  it("uses the resolved Terminal Theme background before renderer startup", () => {
    const options = terminalWindowOptions("/application/preload.cjs", {
      ...DEFAULT_USER_CONFIGURATION,
      terminalTheme: Object.freeze({
        ...DEFAULT_TERMINAL_THEME,
        name: "non-black",
        colors: Object.freeze({
          ...DEFAULT_TERMINAL_THEME.colors,
          background: "#1e1e2e",
        }),
      }),
    });

    expect(options.backgroundColor).toBe("#1e1e2e");
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

  it("covers conceptual Zapfino geometry through injected wide and high metrics", () => {
    const options = terminalWindowOptions(
      "/application/preload.cjs",
      configuredZapfinoGeometry,
    );
    const widthForGrid =
      (options.minWidth as number) -
      configuredZapfinoGeometry.terminalPadding.left -
      configuredZapfinoGeometry.terminalPadding.right -
      14;
    const heightForGrid =
      (options.minHeight as number) -
      30 -
      configuredZapfinoGeometry.terminalPadding.top -
      configuredZapfinoGeometry.terminalPadding.bottom;

    expect(widthForGrid).toBeGreaterThanOrEqual(
      configuredZapfinoGeometry.configuredFontMetrics.cellWidth * 2,
    );
    expect(heightForGrid).toBeGreaterThanOrEqual(
      configuredZapfinoGeometry.configuredFontMetrics.cellHeight *
        configuredZapfinoGeometry.fontLineHeight,
    );
  });

  it("applies configured line height exactly once to the typographic envelope", () => {
    const options = terminalWindowOptions("/application/preload.cjs", {
      ...configuredZapfinoGeometry,
      fontLineHeight: 1.5,
      configuredFontMetrics: Object.freeze({
        cellWidth: 80,
        cellHeight: 100.25,
      }),
    });
    const heightForGrid =
      (options.minHeight as number) -
      30 -
      configuredZapfinoGeometry.terminalPadding.top -
      configuredZapfinoGeometry.terminalPadding.bottom;

    expect(heightForGrid).toBe(152);
    expect(heightForGrid).toBeLessThan(100.25 * 1.5 * 1.5);
  });

  it("keeps Fira/common configured-font metrics on the existing native floors", () => {
    const options = terminalWindowOptions("/application/preload.cjs", {
      ...DEFAULT_USER_CONFIGURATION,
      configuredFontMetrics: Object.freeze({
        cellWidth: 10,
        cellHeight: 19,
      }),
    });

    expect(options.minWidth).toBe(320);
    expect(options.minHeight).toBe(200);
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
