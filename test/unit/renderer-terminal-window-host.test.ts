// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { mountTerminalWindowPage } from "../../src/renderer/terminal-window-host";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";
import type {
  TerminalFontZoom,
  TerminalTabCommand,
} from "../../src/shared/terminal-contract";
import type { ElectronTerminalAdapter } from "../../src/renderer/electron-terminal-adapter";
import type { TerminalSurface } from "../../src/terminal-surface/terminal-surface";

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
    inject: vi.fn(async () => {}),
    zoom: vi.fn(),
    copy: vi.fn(async () => undefined),
    paste: vi.fn(async () => undefined),
    selectAll: vi.fn(),
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
      fontSize: 19,
      fontLineHeight: 1.2,
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
        appearance: {
          fontSize: 19,
          lineHeight: 1.2,
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

  it("applies the native title inset and a non-black theme to the page and mount options", async () => {
    const theme = Object.freeze({
      ...DEFAULT_TERMINAL_THEME,
      name: "non-black",
      colors: Object.freeze({
        ...DEFAULT_TERMINAL_THEME.colors,
        background: "#1e1e2e",
      }),
    });
    const elements = createPageElements();
    const mount = vi.fn(async () => createSurface());
    const host = mountTerminalWindowPage(elements, {
      createAdapter: createAdapterFactory(),
      page: window,
      mount,
      configuration: {
        fontSize: 16,
        fontLineHeight: 1,
        terminalPadding: { top: 0, right: 8, bottom: 8, left: 8 },
        scrollbackLines: 10_000,
        optionKeyMode: "none",
        nativeTitleInset: 0,
        terminalTheme: theme,
        userFileErrors: [],
      },
    });
    await host.ready;

    expect(
      document.documentElement.style.getPropertyValue("--native-title-inset"),
    ).toBe("0px");
    expect(
      document.documentElement.style.getPropertyValue("--terminal-background"),
    ).toBe("#1e1e2e");
    expect(document.body.style.getPropertyValue("--terminal-background")).toBe(
      "#1e1e2e",
    );
    expect(
      elements.tabsContainer.style.getPropertyValue("--terminal-background"),
    ).toBe("#1e1e2e");
    expect(mount).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.any(Object),
      expect.objectContaining({ theme }),
    );
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
    });
    await host.ready;
    commandListener!({ action: "new" });
    await vi.waitFor(() => expect(elements.tabStrip.hidden).toBe(false));
    elements.tabStrip.querySelector<HTMLButtonElement>("button")!.click();

    const dragOver = new Event("dragover", { bubbles: true, cancelable: true });
    document.body.dispatchEvent(dragOver);
    expect(dragOver.defaultPrevented).toBe(true);

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
    elements.tabStrip.dispatchEvent(drop);

    expect(drop.defaultPrevented).toBe(true);
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
    const host = mountTerminalWindowPage(elements, {
      createAdapter: createAdapterFactory(),
      page: window,
      mount: vi.fn(async () => surface),
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
    snippetsElement.querySelector<HTMLButtonElement>("li button")!.click();

    expect(surface.inject).toHaveBeenCalledExactlyOnceWith("printf hi", {
      submit: true,
    });
    expect(surface.focus).toHaveBeenCalled();
    host.dispose();
  });
});
