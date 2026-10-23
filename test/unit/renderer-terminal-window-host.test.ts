// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { mountTerminalWindowPage } from "../../src/renderer/terminal-window-host";
import { TERMINAL_TAB_DRAG_DATA_TYPE } from "../../src/renderer/terminal-tabs";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";
import type {
  TerminalFontZoom,
  TerminalTabCommand,
} from "../../src/shared/terminal-contract";
import type { ElectronTerminalAdapter } from "../../src/renderer/electron-terminal-adapter";
import type {
  TerminalSurface,
  TerminalSurfaceOptions,
} from "../../src/terminal-surface/terminal-surface";
import type { TerminalSessionAdapter } from "../../src/terminal-surface/terminal-session-adapter";
import type { TerminalRendererConfiguration } from "../../src/shared/user-configuration";

function createPageElements() {
  document.body.innerHTML = "";
  document.body.className = "";
  const tabStrip = document.createElement("nav");
  tabStrip.hidden = true;
  const tabsContainer = document.createElement("div");
  document.body.append(tabStrip, tabsContainer);
  return { tabStrip, tabsContainer };
}

function createAdapterFactory() {
  let nextSession = 1;
  return vi.fn((): ElectronTerminalAdapter => {
    const sessionId = `s${nextSession}`;
    nextSession += 1;
    return {
      sessionId: () => sessionId,
      start: vi.fn(async () => {}),
      write: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(),
    };
  });
}

function createSurface(overrides: Record<string, unknown> = {}) {
  return {
    dispose: vi.fn(),
    focus: vi.fn(),
    applyTheme: vi.fn(),
    applyConfiguration: vi.fn(),
    inject: vi.fn(async () => {}),
    zoom: vi.fn(),
    copy: vi.fn(async () => undefined),
    paste: vi.fn(async () => undefined),
    selectAll: vi.fn(),
    toggleSearch: vi.fn(),
    ...overrides,
  };
}

describe("renderer Terminal Window page host", () => {
  it("focuses a successfully mounted Surface when its page is active", async () => {
    const focus = vi.fn();
    const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const host = mountTerminalWindowPage(createPageElements(), {
      createAdapter: createAdapterFactory(),
      page: window,
      mount: vi.fn(async () => createSurface({ focus })),
    });

    await host.ready;

    expect(focus).toHaveBeenCalledOnce();
    hasFocus.mockRestore();
    host.dispose();
  });

  it("focuses only after an inactive page becomes active", async () => {
    const focus = vi.fn();
    const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(false);
    const host = mountTerminalWindowPage(createPageElements(), {
      createAdapter: createAdapterFactory(),
      page: window,
      mount: vi.fn(async () => createSurface({ focus })),
    });

    window.dispatchEvent(new Event("focus"));
    await host.ready;
    expect(focus).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("focus"));
    expect(focus).toHaveBeenCalledOnce();

    hasFocus.mockRestore();
    host.dispose();
  });

  it("removes page activation focus on disposal", async () => {
    const focus = vi.fn();
    const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(false);
    const host = mountTerminalWindowPage(createPageElements(), {
      createAdapter: createAdapterFactory(),
      page: window,
      mount: vi.fn(async () => createSurface({ focus })),
    });
    await host.ready;

    host.dispose();
    window.dispatchEvent(new Event("focus"));

    expect(focus).not.toHaveBeenCalled();
    hasFocus.mockRestore();
  });

  it("disposes the mounted Surface exactly once on page teardown", async () => {
    const dispose = vi.fn();
    const host = mountTerminalWindowPage(createPageElements(), {
      createAdapter: createAdapterFactory(),
      page: window,
      mount: vi.fn(async () => createSurface({ dispose })),
    });
    await host.ready;

    window.dispatchEvent(new Event("pagehide"));
    host.dispose();

    expect(dispose).toHaveBeenCalledOnce();
  });

  it("disposes a Surface that mounts after page teardown", async () => {
    const dispose = vi.fn();
    let finishMount: ((surface: TerminalSurface) => void) | undefined;
    const pendingMount = new Promise<TerminalSurface>((resolve) => {
      finishMount = resolve;
    });
    const host = mountTerminalWindowPage(createPageElements(), {
      createAdapter: createAdapterFactory(),
      page: window,
      mount: vi.fn(() => pendingMount),
    });

    window.dispatchEvent(new Event("pagehide"));
    finishMount!(createSurface({ dispose }) as unknown as TerminalSurface);
    await host.ready;
    host.dispose();

    expect(dispose).toHaveBeenCalledOnce();
  });

  it("applies supplied appearance and independent native zoom to its Surface", async () => {
    const zoom = vi.fn();
    const listeners = new Set<(command: TerminalFontZoom) => void>();
    const removeZoomListener = vi.fn(
      (listener: (command: TerminalFontZoom) => void) =>
        listeners.delete(listener),
    );
    const mount = vi.fn(async () => createSurface({ zoom }));
    const configuration = {
      showTabBar: true,
      transparency: 0,
      fontSize: 19,
      fontLineHeight: 1.2,
      fontLigatures: true,
      terminalPadding: { top: 4, right: 12, bottom: 6, left: 14 },
      fontFamily: "SF Mono",
      scrollbackLines: 2_000,
      optionKeyMode: "right",
      nativeTitleInset: 30,
      terminalTheme: DEFAULT_TERMINAL_THEME,
      userFileErrors: [],
    } as const;
    const host = mountTerminalWindowPage(createPageElements(), {
      createAdapter: createAdapterFactory(),
      configuration,
      page: window,
      mount,
      subscribeToFontZoom(listener) {
        listeners.add(listener);
        return () => removeZoomListener(listener);
      },
    });
    await host.ready;

    for (const listener of listeners) listener("in");

    expect(mount).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.any(Object),
      {
        abortSignal: expect.any(AbortSignal) as AbortSignal,
        onUserInput: expect.any(Function) as () => void,
        // OSC 7 always reaches the tabs: the Files panel follows it.
        onWorkingDirectory: expect.any(Function) as () => void,
        background: "host",
        appearance: {
          fontSize: 19,
          lineHeight: 1.2,
          ligatures: true,
          systemFont: { family: "SF Mono", available: true },
        },
        padding: { top: 4, right: 12, bottom: 6, left: 14 },
        scrollbackLines: 2_000,
        optionKeyMode: "right",
        theme: DEFAULT_TERMINAL_THEME,
      },
    );
    expect(zoom).toHaveBeenCalledWith("in");

    host.dispose();
    expect(removeZoomListener).toHaveBeenCalledOnce();
  });

  it("applies effective fullscreen inset updates without reconfiguring or focusing the Surface", async () => {
    const configuration = {
      transparency: 0,
      showTabBar: true,
      fontSize: 16,
      fontLineHeight: 1,
      fontLigatures: true,
      terminalPadding: { top: 0, right: 8, bottom: 8, left: 8 },
      scrollbackLines: 10_000,
      optionKeyMode: "none",
      nativeTitleInset: 0,
      terminalTheme: DEFAULT_TERMINAL_THEME,
      userFileErrors: [],
    } as const;
    let configurationListener:
      ((configuration: TerminalRendererConfiguration) => void) | undefined;
    const removeConfigurationListener = vi.fn();
    const surface = createSurface();
    const host = mountTerminalWindowPage(createPageElements(), {
      createAdapter: createAdapterFactory(),
      configuration,
      page: window,
      mount: vi.fn(async () => surface),
      subscribeToConfigurationUpdates(listener) {
        configurationListener = listener;
        return removeConfigurationListener;
      },
    });
    await host.ready;

    expect(
      document.documentElement.style.getPropertyValue("--native-title-inset"),
    ).toBe("0px");
    surface.applyConfiguration.mockClear();
    surface.focus.mockClear();

    configurationListener!({ ...configuration, fontSize: 18 });
    expect(
      document.documentElement.style.getPropertyValue("--native-title-inset"),
    ).toBe("0px");
    expect(surface.applyConfiguration).toHaveBeenCalledOnce();
    surface.applyConfiguration.mockClear();

    configurationListener!({
      ...configuration,
      fontSize: 18,
      nativeTitleInset: 30,
    });
    expect(
      document.documentElement.style.getPropertyValue("--native-title-inset"),
    ).toBe("30px");
    expect(surface.applyConfiguration).not.toHaveBeenCalled();
    expect(surface.focus).not.toHaveBeenCalled();

    host.dispose();
    expect(removeConfigurationListener).toHaveBeenCalledOnce();
    configurationListener!(configuration);
    expect(
      document.documentElement.style.getPropertyValue("--native-title-inset"),
    ).toBe("30px");
    expect(surface.applyConfiguration).not.toHaveBeenCalled();
  });

  it("applies runtime themes and notices to current and later-created tabs without closing sessions", async () => {
    const initialTheme = DEFAULT_TERMINAL_THEME;
    const updatedTheme = Object.freeze({
      ...initialTheme,
      name: "runtime",
      colors: Object.freeze({
        ...initialTheme.colors,
        background: "#123456",
        foreground: "#abcdef",
      }),
    });
    const elements = createPageElements();
    const errorBanner = document.createElement("aside");
    const adapterCloses: Array<ReturnType<typeof vi.fn>> = [];
    let nextSession = 1;
    const adapters = vi.fn((): ElectronTerminalAdapter => {
      const sessionId = `s${nextSession}`;
      nextSession += 1;
      const close = vi.fn();
      adapterCloses.push(close);
      return {
        sessionId: () => sessionId,
        start: vi.fn(async () => {}),
        write: vi.fn(),
        resize: vi.fn(),
        close,
      };
    });
    const first = createSurface();
    const second = createSurface();
    const surfaces = [first, second];
    const mountedThemes: unknown[] = [];
    const mountedAppearances: unknown[] = [];
    let configurationListener:
      ((configuration: TerminalRendererConfiguration) => void) | undefined;
    let commandListener: ((command: { action: "new" }) => void) | undefined;
    const host = mountTerminalWindowPage(elements, {
      createAdapter: adapters,
      page: window,
      configuration: {
        showTabBar: true,
        transparency: 0,
        fontFamily: "Initial Family",
        fontSize: 16,
        fontLineHeight: 1,
        fontLigatures: true,
        terminalPadding: { top: 0, right: 8, bottom: 8, left: 8 },
        scrollbackLines: 10_000,
        optionKeyMode: "none",
        nativeTitleInset: 0,
        terminalTheme: initialTheme,
        userFileErrors: ["startup warning"],
      },
      userFileErrorBanner: errorBanner,
      mount: vi.fn(
        async (
          _container: HTMLElement,
          _adapter: TerminalSessionAdapter,
          options: TerminalSurfaceOptions,
        ) => {
          mountedThemes.push(options.theme);
          mountedAppearances.push(options.appearance);
          return surfaces.shift()!;
        },
      ),
      subscribeToConfigurationUpdates(listener) {
        configurationListener = listener;
        return vi.fn();
      },
      subscribeToTabCommands(listener) {
        commandListener = listener as typeof commandListener;
        return vi.fn();
      },
    });
    await host.ready;

    configurationListener!({
      showTabBar: true,
      transparency: 0,
      fontFamily: "Changed Family",
      fontSize: 20,
      fontLineHeight: 1.2,
      fontLigatures: false,
      terminalPadding: { top: 1, right: 2, bottom: 3, left: 4 },
      scrollbackLines: 0,
      optionKeyMode: "both",
      nativeTitleInset: 0,
      terminalTheme: updatedTheme,
      userFileErrors: ["startup warning", "reload failed at /themes/live.json"],
    });

    expect(first.applyConfiguration).toHaveBeenLastCalledWith(
      expect.objectContaining({
        appearance: {
          fontSize: 20,
          lineHeight: 1.2,
          ligatures: false,
          systemFont: { family: "Changed Family", available: true },
        },
        scrollbackLines: 0,
        optionKeyMode: "both",
        theme: updatedTheme,
      }),
    );
    expect(
      document.documentElement.style.getPropertyValue("--terminal-background"),
    ).toBe("#123456");
    expect(
      document.documentElement.style.getPropertyValue("--terminal-foreground"),
    ).toBe("#abcdef");
    expect(errorBanner.textContent).toContain("/themes/live.json");
    expect(adapterCloses[0]).not.toHaveBeenCalled();

    commandListener!({ action: "new" });
    await vi.waitFor(() => expect(mountedThemes).toHaveLength(2));
    expect(mountedThemes).toEqual([initialTheme, updatedTheme]);
    expect(mountedAppearances).toEqual([
      {
        fontSize: 16,
        lineHeight: 1,
        ligatures: true,
        systemFont: { family: "Initial Family", available: true },
      },
      {
        fontSize: 20,
        lineHeight: 1.2,
        ligatures: false,
        systemFont: { family: "Changed Family", available: true },
      },
    ]);
    expect(second.applyConfiguration).toHaveBeenLastCalledWith(
      expect.objectContaining({
        appearance: {
          fontSize: 20,
          lineHeight: 1.2,
          ligatures: false,
          systemFont: { family: "Changed Family", available: true },
        },
        theme: updatedTheme,
      }),
    );
    expect(adapterCloses[0]).not.toHaveBeenCalled();
    expect(adapterCloses[1]).not.toHaveBeenCalled();
    host.dispose();
  });
});

describe("renderer Terminal Window font ownership", () => {
  it("shares a font generation within one window and advances it for new configured-family tabs", async () => {
    const configuration = {
      showTabBar: true,
      transparency: 0,
      fontFamily: "First Family",
      fontSize: 16,
      fontLineHeight: 1,
      fontLigatures: true,
      terminalPadding: { top: 0, right: 8, bottom: 8, left: 8 },
      scrollbackLines: 10_000,
      optionKeyMode: "none",
      nativeTitleInset: 0,
      terminalTheme: DEFAULT_TERMINAL_THEME,
      userFileErrors: [],
    } as const;
    const loadFontData = vi.fn(async (family: string | undefined) => ({
      configured: {
        family: family!,
        data: new Uint8Array([family === "First Family" ? 1 : 2]),
      },
      fallbacks: [],
    }));
    const backings: ArrayBuffer[] = [];
    let commandListener: ((command: { action: "new" }) => void) | undefined;
    let configurationListener:
      ((configuration: TerminalRendererConfiguration) => void) | undefined;
    const host = mountTerminalWindowPage(createPageElements(), {
      createAdapter: createAdapterFactory(),
      configuration,
      page: window,
      loadFontData,
      mount: vi.fn(
        async (
          _container: HTMLElement,
          _adapter: TerminalSessionAdapter,
          options: TerminalSurfaceOptions,
        ) => {
          const lease = await options.acquireFontInputs!(
            options.appearance?.systemFont?.family,
            options.abortSignal,
          );
          backings.push(lease.fonts[0]!.data as ArrayBuffer);
          return createSurface({ dispose: vi.fn(() => lease.release()) });
        },
      ),
      subscribeToTabCommands(listener) {
        commandListener = listener as typeof commandListener;
        return vi.fn();
      },
      subscribeToConfigurationUpdates(listener) {
        configurationListener = listener;
        return vi.fn();
      },
    });
    await host.ready;

    commandListener!({ action: "new" });
    commandListener!({ action: "new" });
    await vi.waitFor(() => expect(backings).toHaveLength(3));
    expect(backings[1]).toBe(backings[0]);
    expect(backings[2]).toBe(backings[0]);
    expect(loadFontData).toHaveBeenCalledOnce();

    configurationListener!({ ...configuration, fontFamily: "Second Family" });
    commandListener!({ action: "new" });
    await vi.waitFor(() => expect(backings).toHaveLength(4));

    expect(backings[3]).not.toBe(backings[0]);
    expect([...new Uint8Array(backings[0]!)]).toEqual([1]);
    expect([...new Uint8Array(backings[3]!)]).toEqual([2]);
    expect(loadFontData.mock.calls.map(([family]) => family)).toEqual([
      "First Family",
      "Second Family",
    ]);

    host.dispose();
  });
});

describe("renderer Terminal Window page host continued", () => {
  it("updates rejection notices without reapplying the last-valid Surface configuration", async () => {
    const errorBanner = document.createElement("aside");
    const surface = createSurface();
    let configurationListener:
      ((configuration: TerminalRendererConfiguration) => void) | undefined;
    const configuration = {
      transparency: 0,
      showTabBar: true,
      fontSize: 16,
      fontLineHeight: 1,
      fontLigatures: true,
      terminalPadding: { top: 0, right: 8, bottom: 8, left: 8 },
      scrollbackLines: 10_000,
      optionKeyMode: "none",
      nativeTitleInset: 0,
      terminalTheme: DEFAULT_TERMINAL_THEME,
      userFileErrors: [],
    } as const;
    const host = mountTerminalWindowPage(createPageElements(), {
      createAdapter: createAdapterFactory(),
      configuration,
      page: window,
      mount: vi.fn(async () => surface),
      userFileErrorBanner: errorBanner,
      subscribeToConfigurationUpdates(listener) {
        configurationListener = listener;
        return vi.fn();
      },
    });
    await host.ready;
    surface.applyConfiguration.mockClear();

    configurationListener!({
      ...configuration,
      userFileErrors: ["reload rejected"],
    });

    expect(surface.applyConfiguration).not.toHaveBeenCalled();
    expect(errorBanner.textContent).toContain("reload rejected");
    host.dispose();
  });

  it("routes native clipboard actions to the selected mounted Surface", async () => {
    let actionListener:
      ((action: "copy" | "paste" | "select-all") => void) | undefined;
    const surface = createSurface();
    const host = mountTerminalWindowPage(createPageElements(), {
      createAdapter: createAdapterFactory(),
      page: window,
      mount: vi.fn(async () => surface),
      subscribeToClipboardActions(listener) {
        actionListener = listener;
        return vi.fn();
      },
    });
    await host.ready;

    actionListener!("copy");
    actionListener!("paste");
    actionListener!("select-all");

    expect(surface.copy).toHaveBeenCalledOnce();
    expect(surface.paste).toHaveBeenCalledOnce();
    expect(surface.selectAll).toHaveBeenCalledOnce();
    host.dispose();
  });

  it("prevents document drop navigation and injects only dropped files into the selected Surface", async () => {
    const elements = createPageElements();
    const first = createSurface();
    const second = createSurface();
    const surfaces = [first, second];
    let commandListener: ((command: { action: "new" }) => void) | undefined;
    let titleListener: ((sessionId: string, title: string) => void) | undefined;
    const droppedFilePathInsertion = vi.fn((files: readonly File[]) =>
      files.length > 0 ? "'/Users/me/A B.txt'" : "",
    );
    const host = mountTerminalWindowPage(elements, {
      createAdapter: createAdapterFactory(),
      page: window,
      mount: vi.fn(async () => surfaces.shift()!),
      droppedFilePathInsertion,
      subscribeToTabCommands(listener) {
        commandListener = listener as typeof commandListener;
        return vi.fn();
      },
      subscribeToTabTitles(listener) {
        titleListener = listener;
        return vi.fn();
      },
    });
    await host.ready;
    commandListener!({ action: "new" });
    await vi.waitFor(() => expect(elements.tabStrip.hidden).toBe(false));
    titleListener!("s1", "one");
    titleListener!("s2", "two");
    elements.tabStrip.querySelector<HTMLButtonElement>("button")!.click();

    const tabButtons = [...elements.tabStrip.querySelectorAll("button")];
    tabButtons.forEach((button, index) =>
      vi.spyOn(button, "getBoundingClientRect").mockReturnValue({
        left: index * 100,
        width: 100,
      } as DOMRect),
    );
    const internalTypes: string[] = [];
    const internalTransfer = {
      files: { length: 0, item: () => null },
      types: internalTypes,
      effectAllowed: "none",
      dropEffect: "none",
      setData: vi.fn((type: string) => internalTypes.push(type)),
    };
    const tabDragStart = new Event("dragstart", { bubbles: true });
    Object.defineProperty(tabDragStart, "dataTransfer", {
      value: internalTransfer,
    });
    tabButtons[0]!.dispatchEvent(tabDragStart);
    expect(internalTypes).toContain(TERMINAL_TAB_DRAG_DATA_TYPE);
    expect(internalTransfer.effectAllowed).toBe("move");
    const tabDrop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperties(tabDrop, {
      clientX: { value: 175 },
      dataTransfer: { value: internalTransfer },
    });
    elements.tabStrip.dispatchEvent(tabDrop);

    expect(internalTypes).toContain(TERMINAL_TAB_DRAG_DATA_TYPE);
    expect(
      [...elements.tabStrip.querySelectorAll("button")].map(
        (button) => button.textContent,
      ),
    ).toEqual(["two", "one"]);
    expect(droppedFilePathInsertion).not.toHaveBeenCalled();
    expect(first.inject).not.toHaveBeenCalled();
    expect(second.inject).not.toHaveBeenCalled();

    const targetDragOver = vi.fn();
    elements.tabStrip.addEventListener("dragover", targetDragOver);
    const dragOver = new Event("dragover", { bubbles: true, cancelable: true });
    elements.tabStrip.dispatchEvent(dragOver);
    expect(dragOver.defaultPrevented).toBe(true);
    expect(targetDragOver).not.toHaveBeenCalled();

    const file = new File([""], "A B.txt");
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", {
      value: {
        files: {
          0: file,
          length: 1,
          item: () => file,
          *[Symbol.iterator]() {
            yield file;
          },
        },
      },
    });
    const targetDrop = vi.fn();
    elements.tabStrip.addEventListener("drop", targetDrop);
    elements.tabStrip.dispatchEvent(drop);

    expect(drop.defaultPrevented).toBe(true);
    expect(targetDrop).not.toHaveBeenCalled();
    expect(droppedFilePathInsertion).toHaveBeenCalledWith([file]);
    expect(first.inject).toHaveBeenCalledExactlyOnceWith("'/Users/me/A B.txt'");
    expect(second.inject).not.toHaveBeenCalled();

    const textDrop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(textDrop, "dataTransfer", {
      value: { files: { length: 0, item: () => null } },
    });
    document.documentElement.dispatchEvent(textDrop);
    expect(textDrop.defaultPrevented).toBe(true);
    expect(droppedFilePathInsertion).toHaveBeenCalledOnce();
    expect(first.inject).toHaveBeenCalledOnce();
    host.dispose();
  });

  it("passes session-tagged title and BEL signals into the portable Surface", async () => {
    const onTitleRequest = vi.fn();
    const onBell = vi.fn();
    const onExternalLink = vi.fn();
    let mountedOptions:
      | {
          onTitleRequest?: (request: string) => void;
          onBell?: () => void;
          onExternalLink?: (url: string) => void;
        }
      | undefined;
    const mount = vi.fn(
      async (_container: unknown, _adapter: unknown, options: unknown) => {
        mountedOptions = options as typeof mountedOptions;
        return createSurface();
      },
    );
    const host = mountTerminalWindowPage(createPageElements(), {
      createAdapter: createAdapterFactory(),
      page: window,
      mount,
      onTitleRequest,
      onBell,
      onExternalLink,
    });
    await host.ready;

    expect(mountedOptions?.onExternalLink).toBe(onExternalLink);
    mountedOptions?.onTitleRequest?.("current directory");
    mountedOptions?.onBell?.();

    expect(onTitleRequest).toHaveBeenCalledExactlyOnceWith(
      "s1",
      "current directory",
    );
    expect(onBell).toHaveBeenCalledExactlyOnceWith("s1");
    host.dispose();
  });

  it("routes tab title updates from main into the strip labels", async () => {
    let titleListener: ((sessionId: string, title: string) => void) | undefined;
    let commandListener: ((command: { action: "new" }) => void) | undefined;
    const removeTabTitleListener = vi.fn();
    const elements = createPageElements();
    const host = mountTerminalWindowPage(elements, {
      createAdapter: createAdapterFactory(),
      page: window,
      mount: vi.fn(async () => createSurface()),
      subscribeToTabCommands: (listener) => {
        commandListener = listener;
        return vi.fn();
      },
      subscribeToTabTitles: (listener) => {
        titleListener = listener;
        return removeTabTitleListener;
      },
    });
    await host.ready;

    commandListener!({ action: "new" });
    await vi.waitFor(() =>
      expect(elements.tabsContainer.children).toHaveLength(2),
    );
    titleListener!("s1", "vim");

    const labels = [...elements.tabStrip.querySelectorAll("button")].map(
      (button) => button.textContent,
    );
    expect(labels).toEqual(["vim", "2"]);

    host.dispose();
    expect(removeTabTitleListener).toHaveBeenCalledOnce();
  });

  it("routes tab bar toggles after mount and removes the subscription on disposal", async () => {
    const elements = createPageElements();
    let toggle!: () => void;
    let command!: (value: TerminalTabCommand) => void;
    const remove = vi.fn();
    const subscribeToTabBarToggle = vi.fn((listener: () => void) => {
      toggle = listener;
      return remove;
    });
    const surface = createSurface();
    const host = mountTerminalWindowPage(elements, {
      createAdapter: createAdapterFactory(),
      mount: async () => surface,
      subscribeToTabBarToggle,
      subscribeToTabCommands(listener) {
        command = listener;
        return vi.fn();
      },
    });
    expect(subscribeToTabBarToggle).not.toHaveBeenCalled();
    await host.ready;
    toggle();
    command({ action: "new" });
    await vi.waitFor(() =>
      expect(elements.tabsContainer.children).toHaveLength(2),
    );
    expect(elements.tabStrip.hidden).toBe(true);
    toggle();
    expect(elements.tabStrip.hidden).toBe(false);
    host.dispose();
    surface.focus.mockClear();
    toggle();
    expect(remove).toHaveBeenCalledOnce();
    expect(elements.tabStrip.hidden).toBe(false);
    expect(surface.focus).not.toHaveBeenCalled();
  });

  it("routes tab commands from main into the Terminal Tabs", async () => {
    let commandListener: ((command: TerminalTabCommand) => void) | undefined;
    const removeTabCommandListener = vi.fn();
    const elements = createPageElements();
    const mount = vi.fn(async () => createSurface());
    const host = mountTerminalWindowPage(elements, {
      createAdapter: createAdapterFactory(),
      page: window,
      mount,
      subscribeToTabCommands(listener) {
        commandListener = listener;
        return removeTabCommandListener;
      },
    });
    await host.ready;

    commandListener!({ action: "new" });
    await vi.waitFor(() =>
      expect(elements.tabsContainer.children).toHaveLength(2),
    );
    expect(elements.tabStrip.hidden).toBe(false);

    host.dispose();
    expect(removeTabCommandListener).toHaveBeenCalledOnce();
  });

  it("injects a chosen snippet into the selected tab's session", async () => {
    const surface = createSurface();
    const elements = createPageElements();
    const snippetsElement = document.createElement("aside");
    snippetsElement.hidden = true;
    document.body.append(snippetsElement);
    let toggleListener: (() => void) | undefined;
    let configurationListener:
      ((configuration: TerminalRendererConfiguration) => void) | undefined;
    const host = mountTerminalWindowPage(elements, {
      createAdapter: createAdapterFactory(),
      page: window,
      mount: vi.fn(async () => surface),
      subscribeToConfigurationUpdates(listener) {
        configurationListener = listener;
        return vi.fn();
      },
      snippets: {
        element: snippetsElement,
        load: vi.fn(async () => ({
          snippets: [{ name: "greet", body: "printf hi", execute: true }],
        })),
        subscribeToToggle: (listener) => {
          toggleListener = listener;
          return vi.fn();
        },
      },
    });
    await host.ready;

    toggleListener!();
    await vi.waitFor(() => {
      expect(snippetsElement.querySelector("li button")).not.toBeNull();
    });
    configurationListener!({
      fontSize: 20,
      fontLineHeight: 1.2,
      fontLigatures: true,
      terminalPadding: { top: 1, right: 2, bottom: 3, left: 4 },
      scrollbackLines: 0,
      optionKeyMode: "both",
      nativeTitleInset: 0,
      transparency: 0,
      showTabBar: true,
      terminalTheme: DEFAULT_TERMINAL_THEME,
      userFileErrors: [],
    });
    expect(snippetsElement.hidden).toBe(false);
    snippetsElement.querySelector<HTMLButtonElement>("li button")!.click();

    expect(surface.inject).toHaveBeenCalledExactlyOnceWith("printf hi", {
      submit: true,
    });
    expect(surface.focus).toHaveBeenCalled();
    host.dispose();
  });
});
