// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountTerminalWindowPage } from "../../src/renderer/terminal-window-host";
import { createFakeSurface } from "../fixtures/terminal-tabs-harness";
import type { WindowChromeState } from "../../src/shared/window-chrome";
import type { WindowChromeBridge } from "../../src/renderer/window-chrome";
import type { TerminalTabCommand } from "../../src/shared/terminal-contract";
import type { TerminalRendererConfiguration } from "../../src/shared/user-configuration";
import { terminalRendererConfiguration } from "../../src/main/active-user-configuration";
import { DEFAULT_USER_CONFIGURATION } from "../../src/main/user-configuration";

function chromeBridge(initial: Partial<WindowChromeState> = {}) {
  let state: WindowChromeState = {
    style: "native",
    titleBarVisible: true,
    fullScreen: false,
    maximized: false,
    handleVisible: false,
    title: "OMXTerm",
    ...initial,
  };
  let update!: (state: WindowChromeState) => void;
  let toggle!: () => void;
  const removeState = vi.fn();
  const removeToggle = vi.fn();
  const command = vi.fn();
  const bridge: WindowChromeBridge = {
    windowChrome: command,
    onWindowChrome(listener) {
      update = listener;
      listener(state);
      return removeState;
    },
    onTitleBarToggle(listener) {
      toggle = listener;
      return removeToggle;
    },
  };
  return {
    bridge,
    command,
    removeState,
    removeToggle,
    toggle: () => toggle(),
    update(next: Partial<WindowChromeState>) {
      state = { ...state, ...next };
      update(state);
    },
  };
}

async function setup(
  initial: Partial<WindowChromeState> = {},
  showTabBar = true,
) {
  document.body.innerHTML =
    '<nav id="tab-strip" hidden></nav><div id="terminal-tabs"></div>';
  document.body.className = "";
  const chrome = chromeBridge(initial);
  const tabStrip = document.querySelector<HTMLElement>("#tab-strip")!;
  const tabsContainer = document.querySelector<HTMLElement>("#terminal-tabs")!;
  const configuration = terminalRendererConfiguration(
    {
      configuration: { ...DEFAULT_USER_CONFIGURATION, showTabBar },
      userFileErrors: [],
    },
    30,
  );
  let configure!: (value: TerminalRendererConfiguration) => void;
  let tab!: (value: TerminalTabCommand) => void;
  let toggleTab!: () => void;
  let title!: (id: string, text: string) => void;
  const surfaces: ReturnType<typeof createFakeSurface>[] = [];
  const adapters: Array<{
    close: ReturnType<typeof vi.fn>;
    resize: ReturnType<typeof vi.fn>;
  }> = [];
  const mount = vi.fn(async () => {
    const surface = createFakeSurface();
    surfaces.push(surface);
    return surface;
  });
  const host = mountTerminalWindowPage(
    { tabStrip, tabsContainer },
    {
      configuration,
      chrome: chrome.bridge,
      page: window,
      mount,
      createAdapter() {
        const id = `s${adapters.length + 1}`;
        const adapter = {
          start: vi.fn(async () => {}),
          sessionId: () => id,
          write: vi.fn(),
          resize: vi.fn(),
          close: vi.fn(),
        };
        adapters.push(adapter);
        return adapter;
      },
      subscribeToConfigurationUpdates(listener) {
        configure = listener;
        return () => {};
      },
      subscribeToTabCommands(listener) {
        tab = listener;
        return () => {};
      },
      subscribeToTabBarToggle(listener) {
        toggleTab = listener;
        return () => {};
      },
      subscribeToTabTitles(listener) {
        title = listener;
        return () => {};
      },
    },
  );
  await host.ready;
  return {
    chrome,
    host,
    surfaces,
    adapters,
    configure,
    configuration,
    tab,
    toggleTab,
    title,
    tabStrip,
    tabsContainer,
    mount,
  };
}

const inset = () =>
  document.documentElement.style.getPropertyValue("--native-title-inset");
const row = () => document.querySelector<HTMLElement>(".window-title-bar")!;
const handle = () =>
  document.querySelector<HTMLElement>(".window-drag-handle")!;
afterEach(() => vi.restoreAllMocks());

describe("Window Chrome through the mounted window host", () => {
  it("keeps macOS blended with a native inset and no replacement right controls", async () => {
    const view = await setup();
    expect(row().hidden).toBe(true);
    expect(handle().hidden).toBe(true);
    expect(inset()).toBe("30px");
    const nodes = [...view.tabsContainer.children];
    view.chrome.toggle();
    expect(view.chrome.command).toHaveBeenLastCalledWith("toggle-title-bar");
    view.chrome.update({ titleBarVisible: false });
    expect(inset()).toBe("0px");
    expect(row().hidden).toBe(true);
    view.chrome.update({ titleBarVisible: true });
    expect(inset()).toBe("30px");
    expect([...view.tabsContainer.children]).toEqual(nodes);
    expect(view.mount).toHaveBeenCalledOnce();
    expect(view.surfaces[0]!.dispose).not.toHaveBeenCalled();
    expect(view.adapters[0]!.close).not.toHaveBeenCalled();
    view.host.dispose();
  });

  it("shows only the custom platform row, its selected title, and native action requests", async () => {
    const view = await setup({
      style: "custom",
      title: "<b>sanitized title</b>",
    });
    expect(inset()).toBe("0px");
    expect(row().hidden).toBe(false);
    expect(row().querySelector(".window-title")!.textContent).toBe(
      "<b>sanitized title</b>",
    );
    expect(row().querySelector("b")).toBeNull();
    for (const label of ["Minimize", "Maximize", "Close Window"])
      row()
        .querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!
        .click();
    expect(view.chrome.command.mock.calls).toEqual([
      ["minimize"],
      ["maximize"],
      ["close"],
    ]);
    view.chrome.update({ maximized: true, title: "🔔 other selected session" });
    expect(row().querySelector('[aria-label="Restore"]')).not.toBeNull();
    expect(row().textContent).toContain("🔔 other selected session");
    view.host.dispose();
  });

  it.each(["Minimize", "Maximize", "Restore", "Close Window"])(
    "keeps input focus when the pointer activates %s",
    async (label) => {
      const view = await setup({
        style: "custom",
        maximized: label === "Restore",
      });
      const input = document.createElement("textarea");
      view.tabsContainer.append(input);
      input.focus();
      const control = row().querySelector<HTMLButtonElement>(
        `[aria-label="${label}"]`,
      )!;
      const press = new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button: 0,
      });
      // jsdom omits the browser's uncanceled mousedown focus default.
      if (control.dispatchEvent(press)) control.focus();
      control.click();
      view.chrome.update({ maximized: label === "Maximize" });
      expect(document.activeElement).toBe(input);
      expect(view.chrome.command).toHaveBeenCalledOnce();
      // Pointer focus preservation must not remove keyboard accessibility.
      control.focus();
      expect(document.activeElement).toBe(control);
      view.host.dispose();
    },
  );

  it("honors initial tab visibility but ignores future-default changes while applying live themes", async () => {
    const view = await setup({ titleBarVisible: false }, false);
    view.tab({ action: "new" });
    await vi.waitFor(() => expect(view.surfaces).toHaveLength(2));
    const nodes = [...view.tabsContainer.children];
    expect(view.tabStrip.hidden).toBe(true);
    view.configure({
      ...view.configuration,
      showTabBar: true,
      nativeTitleInset: 30,
      terminalTheme: {
        ...view.configuration.terminalTheme,
        colors: {
          ...view.configuration.terminalTheme.colors,
          background: "#123456",
        },
      },
    });
    expect(view.tabStrip.hidden).toBe(true);
    expect(inset()).toBe("0px");
    expect(
      document.documentElement.style.getPropertyValue("--terminal-background"),
    ).toBe("#123456");
    view.title("s1", "first");
    view.title("s2", "second");
    view.tab({ action: "previous" });
    view.chrome.update({ title: "first" });
    expect(inset()).toBe("0px");
    expect(view.tabStrip.hidden).toBe(true);
    view.toggleTab();
    expect(view.tabStrip.hidden).toBe(false);
    expect(
      [...view.tabStrip.children].map((child) => child.textContent),
    ).toEqual(["first", "second"]);
    view.configure({ ...view.configuration, showTabBar: false });
    expect(view.tabStrip.hidden).toBe(false);
    expect([...view.tabsContainer.children]).toEqual(nodes);
    expect(view.mount).toHaveBeenCalledTimes(2);
    for (const surface of view.surfaces)
      expect(surface.dispose).not.toHaveBeenCalled();
    for (const adapter of view.adapters) {
      expect(adapter.resize).not.toHaveBeenCalled();
      expect(adapter.close).not.toHaveBeenCalled();
    }
    view.host.dispose();
  });

  it("hover only reveals the small out-of-flow target and never focuses or reconfigures Surfaces", async () => {
    const view = await setup({ titleBarVisible: false });
    view.surfaces[0]!.focus.mockClear();
    view.surfaces[0]!.applyConfiguration.mockClear();
    expect(handle().hidden).toBe(true);
    for (const visible of [true, false, true]) {
      view.chrome.update({ handleVisible: visible });
      expect(handle().hidden).toBe(!visible);
      expect(handle().children).toHaveLength(3);
      expect(inset()).toBe("0px");
    }
    expect(view.surfaces[0]!.focus).not.toHaveBeenCalled();
    expect(view.surfaces[0]!.applyConfiguration).not.toHaveBeenCalled();
    expect(view.adapters[0]!.resize).not.toHaveBeenCalled();
    view.host.dispose();
    expect(view.chrome.removeState).toHaveBeenCalledOnce();
    expect(view.chrome.removeToggle).toHaveBeenCalledOnce();
    view.chrome.toggle();
    view.chrome.update({ titleBarVisible: true });
    expect(view.chrome.command).not.toHaveBeenCalled();
    expect(document.querySelector(".window-drag-handle")).toBeNull();
    expect(inset()).toBe("0px");
  });

  it("keeps the native drag handle after the overlapping no-drag tab strip", async () => {
    const view = await setup({
      style: "custom",
      titleBarVisible: false,
      handleVisible: true,
    });
    view.tab({ action: "new" });
    await vi.waitFor(() => expect(view.surfaces).toHaveLength(2));
    expect(view.tabStrip.hidden).toBe(false);
    expect(handle().hidden).toBe(false);
    // Native regions are applied in layout order, not visual z-index order.
    expect(
      view.tabStrip.compareDocumentPosition(handle()) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    view.host.dispose();
  });

  it.each(["native", "custom"] as const)(
    "suppresses fullscreen chrome and restores the choice on %s",
    async (style) => {
      const view = await setup({ style });
      view.chrome.update({ fullScreen: true, handleVisible: true });
      expect(inset()).toBe("0px");
      expect(row().hidden).toBe(true);
      expect(handle().hidden).toBe(true);
      view.chrome.update({ fullScreen: false, handleVisible: false });
      expect(inset()).toBe(style === "native" ? "30px" : "0px");
      expect(row().hidden).toBe(style === "native");
      view.chrome.update({ titleBarVisible: false, fullScreen: true });
      view.chrome.update({ fullScreen: false, handleVisible: true });
      expect(row().hidden).toBe(true);
      expect(handle().hidden).toBe(false);
      expect(inset()).toBe("0px");
      view.host.dispose();
    },
  );
  it("keeps the auto-hiding title bar in full screen and opens it in flow", async () => {
    const view = await setup({ style: "custom" });
    document.documentElement.setAttribute("data-title-bar-autohide", "");
    try {
      await vi.waitFor(() => expect(row().hidden).toBe(false));
      view.chrome.update({ fullScreen: true });
      expect(row().hidden).toBe(false);
      expect(document.body.classList.contains("window-filled")).toBe(true);
      expect(row().classList.contains("revealed")).toBe(false);
      document.dispatchEvent(
        new MouseEvent("mousemove", { clientX: 200, clientY: 4 }),
      );
      expect(row().classList.contains("revealed")).toBe(true);
      // The row stays in the body's flow, ahead of the tab strip.
      expect(getComputedStyle(row()).position).not.toBe("fixed");
      expect(
        row().compareDocumentPosition(view.tabStrip) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      view.chrome.update({ fullScreen: false });
      expect(document.body.classList.contains("window-filled")).toBe(false);
    } finally {
      document.documentElement.removeAttribute("data-title-bar-autohide");
      view.host.dispose();
    }
  });
});
