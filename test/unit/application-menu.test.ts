import { describe, expect, it, vi } from "vitest";
import {
  terminalActionInvocations,
  terminalApplicationMenuTemplate,
  terminalClipboardContextMenuTemplate,
} from "../../src/main/application-menu";
import {
  DEFAULT_TERMINAL_KEYBINDS,
  TERMINAL_ACTION_NAMES,
  terminalDefaultKeybinds,
} from "../../src/shared/terminal-keybinds";

function menuActions() {
  return {
    newWindow: vi.fn(),
    closeSelectedWindow: vi.fn(),
    newTabInSelectedWindow: vi.fn(),
    closeSelectedTab: vi.fn(),
    selectNextTab: vi.fn(),
    selectPreviousTab: vi.fn(),
    selectTabInSelectedWindow: vi.fn(),
    requestQuit: vi.fn(),
    toggleSelectedFullScreen: vi.fn(),
    toggleSelectedAlwaysOnTop: vi.fn(),
    toggleSelectedDevTools: vi.fn(),
    zoomInSelectedWindow: vi.fn(),
    zoomOutSelectedWindow: vi.fn(),
    resetSelectedWindowZoom: vi.fn(),
    copySelectedTerminal: vi.fn(),
    pasteSelectedTerminal: vi.fn(),
    selectAllSelectedTerminal: vi.fn(),
    findInSelectedTerminal: vi.fn(),
    toggleSelectedSnippets: vi.fn(),
    toggleSelectedTabBar: vi.fn(),
    toggleSelectedTitleBar: vi.fn(),
    reloadUserConfiguration: vi.fn(),
    openLocalImage: vi.fn(),
    showAbout: vi.fn(),
    showSettings: vi.fn(),
  };
}

type MenuTemplate = ReturnType<typeof terminalApplicationMenuTemplate>;

function flattenMenuItems(template: MenuTemplate): MenuTemplate {
  const items: MenuTemplate = [];
  const visit = (candidates: MenuTemplate) => {
    for (const item of candidates) {
      items.push(item);
      if (Array.isArray(item.submenu)) visit(item.submenu);
    }
  };
  visit(template);
  return items;
}

describe("native application menu", () => {
  it.each(["OMXTerm", "Electron"])(
    "uses the product About action even when the launcher name is %s",
    (launcherName) => {
      const actions = menuActions();
      const items = flattenMenuItems(
        terminalApplicationMenuTemplate(
          launcherName,
          actions,
          DEFAULT_TERMINAL_KEYBINDS,
        ),
      );
      expect(items.filter((item) => item.id === "about")).toEqual([
        { id: "about", label: "About OMXTerm", click: actions.showAbout },
      ]);
      expect(items.some((item) => item.role === "about")).toBe(false);
      const settings = items.find((item) => item.label === "Settings…")!;
      expect(settings).toEqual({
        label: "Settings…",
        click: actions.showSettings,
      });
      (settings.click as () => void)();
      expect(actions.showSettings).toHaveBeenCalledOnce();
    },
  );
  it("wires native window lifecycle accelerators to application actions", () => {
    const actions = menuActions();
    const template = terminalApplicationMenuTemplate(
      "OMXTerm",
      actions,
      DEFAULT_TERMINAL_KEYBINDS,
    );

    const items = flattenMenuItems(template);
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "New Window",
          accelerator: "CommandOrControl+N",
          click: actions.newWindow,
        }),
        expect.objectContaining({
          label: "New Tab",
          accelerator: "CommandOrControl+T",
          click: actions.newTabInSelectedWindow,
        }),
        expect.objectContaining({
          label: "Close Tab",
          accelerator: "CommandOrControl+W",
          click: actions.closeSelectedTab,
        }),
        expect.objectContaining({
          label: "Close Window",
          accelerator: "CommandOrControl+Shift+W",
          click: actions.closeSelectedWindow,
        }),
        expect.objectContaining({
          label: "Show Next Tab",
          accelerator: "Control+Tab",
          click: actions.selectNextTab,
        }),
        expect.objectContaining({
          label: "Show Previous Tab",
          accelerator: "Control+Shift+Tab",
          click: actions.selectPreviousTab,
        }),
        expect.objectContaining({
          label: "Quit OMXTerm",
          accelerator: "CommandOrControl+Q",
          click: actions.requestQuit,
        }),
        expect.objectContaining({
          label: "Toggle Full Screen",
          accelerator: "Control+Command+F",
          click: actions.toggleSelectedFullScreen,
        }),
        expect.objectContaining({
          label: "Zoom In",
          accelerator: "CommandOrControl+Plus",
          click: actions.zoomInSelectedWindow,
        }),
        expect.objectContaining({
          label: "Zoom Out",
          accelerator: "CommandOrControl+-",
          click: actions.zoomOutSelectedWindow,
        }),
        expect.objectContaining({
          label: "Actual Size",
          accelerator: "CommandOrControl+0",
          click: actions.resetSelectedWindowZoom,
        }),
        expect.objectContaining({
          label: "Always on Top",
          click: actions.toggleSelectedAlwaysOnTop,
        }),
        expect.objectContaining({
          label: "Copy",
          accelerator: "CommandOrControl+C",
          click: actions.copySelectedTerminal,
        }),
        expect.objectContaining({
          label: "Paste",
          accelerator: "CommandOrControl+V",
          click: actions.pasteSelectedTerminal,
        }),
        expect.objectContaining({
          label: "Select All",
          accelerator: "CommandOrControl+A",
          click: actions.selectAllSelectedTerminal,
        }),
        expect.objectContaining({
          label: "Toggle Snippets",
          accelerator: "CommandOrControl+Shift+S",
          click: actions.toggleSelectedSnippets,
        }),
      ]),
    );
  });

  it.each([
    ["darwin", "CommandOrControl+Shift+B"],
    ["linux", "Control+Shift+B"],
    ["win32", "Control+Shift+B"],
  ])(
    "offers Toggle Tab Bar beside Snippets with shared delivery on %s",
    (platform, accelerator) => {
      const actions = menuActions();
      const template = terminalApplicationMenuTemplate(
        "OMXTerm",
        actions,
        terminalDefaultKeybinds(platform!),
      );
      const view = template.find((item) => item.label === "View")!
        .submenu as MenuTemplate;
      const index = view.findIndex((item) => item.label === "Toggle Snippets");
      expect(view[index + 1]).toEqual({
        label: "Toggle Tab Bar",
        accelerator,
        click: actions.toggleSelectedTabBar,
      });
      (view[index + 1]!.click as () => void)();
      expect(actions.toggleSelectedTabBar).toHaveBeenCalledOnce();
      actions.toggleSelectedTabBar.mockClear();
      terminalActionInvocations(actions).toggleTabBar();
      expect(actions.toggleSelectedTabBar).toHaveBeenCalledOnce();
      const title = view.find((item) => item.label === "Toggle Title Bar")!;
      expect(title).toEqual({
        label: "Toggle Title Bar",
        accelerator: terminalDefaultKeybinds(platform!).toggleTitleBar,
        click: actions.toggleSelectedTitleBar,
      });
      (title.click as () => void)();
      expect(actions.toggleSelectedTitleBar).toHaveBeenCalledOnce();
      actions.toggleSelectedTitleBar.mockClear();
      terminalActionInvocations(actions).toggleTitleBar();
      expect(actions.toggleSelectedTitleBar).toHaveBeenCalledOnce();
    },
  );

  it.each([
    ["darwin", "CommandOrControl+F"],
    ["linux", "Control+Shift+F"],
    ["win32", "Control+Shift+F"],
  ])(
    "offers Find after Select All with shared delivery on %s",
    (platform, accelerator) => {
      const actions = menuActions();
      const template = terminalApplicationMenuTemplate(
        "OMXTerm",
        actions,
        terminalDefaultKeybinds(platform!),
      );
      const edit = template.find((item) => item.label === "Edit")!
        .submenu as MenuTemplate;
      const index = edit.findIndex((item) => item.label === "Select All");
      expect(edit[index + 1]).toEqual({ type: "separator" });
      expect(edit[index + 2]).toEqual({
        label: "Find…",
        accelerator,
        click: actions.findInSelectedTerminal,
      });
      (edit[index + 2]!.click as () => void)();
      expect(actions.findInSelectedTerminal).toHaveBeenCalledOnce();
      actions.findInSelectedTerminal.mockClear();
      terminalActionInvocations(actions).find();
      expect(actions.findInSelectedTerminal).toHaveBeenCalledOnce();
    },
  );

  it("keeps a disabled keybind's menu item without an accelerator", () => {
    const actions = menuActions();
    const items = flattenMenuItems(
      terminalApplicationMenuTemplate("OMXTerm", actions, {
        ...terminalDefaultKeybinds("linux"),
        toggleFullScreen: null,
      }),
    );
    const fullScreen = items.find(
      (item) => item.label === "Toggle Full Screen",
    )!;
    expect(fullScreen).toEqual({
      label: "Toggle Full Screen",
      click: actions.toggleSelectedFullScreen,
    });
    (fullScreen.click as () => void)();
    expect(actions.toggleSelectedFullScreen).toHaveBeenCalledOnce();
  });

  it("offers a menu-only local image picker without adding shortcut vocabulary", () => {
    const actions = menuActions();
    const item = flattenMenuItems(
      terminalApplicationMenuTemplate(
        "OMXTerm",
        actions,
        DEFAULT_TERMINAL_KEYBINDS,
      ),
    ).find((candidate) => candidate.label === "Open Local Image…");

    expect(item).toEqual({
      label: "Open Local Image…",
      click: actions.openLocalImage,
    });
    (item?.click as () => void)();
    expect(actions.openLocalImage).toHaveBeenCalledOnce();
    expect(TERMINAL_ACTION_NAMES).not.toContain("openLocalImage");
  });

  it("offers a menu-only Developer Tools toggle for the selected Terminal Window", () => {
    const actions = menuActions();
    const item = flattenMenuItems(
      terminalApplicationMenuTemplate(
        "OMXTerm",
        actions,
        DEFAULT_TERMINAL_KEYBINDS,
      ),
    ).find((candidate) => candidate.label === "Toggle Developer Tools");

    expect(item).toEqual({
      label: "Toggle Developer Tools",
      click: actions.toggleSelectedDevTools,
    });
    (item?.click as () => void)();
    expect(actions.toggleSelectedDevTools).toHaveBeenCalledOnce();
  });

  it("adds an always-available remappable User Configuration reload action", () => {
    const actions = menuActions();
    const item = flattenMenuItems(
      terminalApplicationMenuTemplate(
        "OMXTerm",
        actions,
        DEFAULT_TERMINAL_KEYBINDS,
      ),
    ).find((candidate) => candidate.label === "Reload User Configuration");

    expect(item).toEqual({
      label: "Reload User Configuration",
      accelerator: "CommandOrControl+Shift+,",
      click: actions.reloadUserConfiguration,
    });
    (item?.click as () => void)();
    expect(actions.reloadUserConfiguration).toHaveBeenCalledOnce();
  });

  it("registers one literal-position accelerator per selectable tab", () => {
    const actions = menuActions();
    const template = terminalApplicationMenuTemplate(
      "OMXTerm",
      actions,
      DEFAULT_TERMINAL_KEYBINDS,
    );
    const items = flattenMenuItems(template);

    for (let position = 1; position <= 9; position += 1) {
      const item = items.find(
        (candidate) => candidate.label === `Tab ${position}`,
      );
      expect(item?.accelerator).toBe(`CommandOrControl+${position}`);
      (item?.click as () => void)();
    }
    expect(actions.selectTabInSelectedWindow.mock.calls).toEqual(
      Array.from({ length: 9 }, (_, index) => [index + 1]),
    );
  });

  it("displays the remapped accelerator instead of the default for remapped actions only", () => {
    const actions = menuActions();
    const template = terminalApplicationMenuTemplate("OMXTerm", actions, {
      ...DEFAULT_TERMINAL_KEYBINDS,
      newWindow: "CommandOrControl+G",
    });

    const items = flattenMenuItems(template);
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "New Window",
          accelerator: "CommandOrControl+G",
          click: actions.newWindow,
        }),
        expect.objectContaining({
          label: "Close Tab",
          accelerator: "CommandOrControl+W",
          click: actions.closeSelectedTab,
        }),
      ]),
    );
    expect(
      items.some((item) => item.accelerator === "CommandOrControl+N"),
    ).toBe(false);
  });
});

describe("keybind action invocations", () => {
  it("invokes the same application action as the menu item for every keybind action", () => {
    const actions = menuActions();
    const invocations = terminalActionInvocations(actions);

    invocations.nextTab();
    expect(actions.selectNextTab).toHaveBeenCalledOnce();
    invocations.previousTab();
    expect(actions.selectPreviousTab).toHaveBeenCalledOnce();
    invocations.newTab();
    expect(actions.newTabInSelectedWindow).toHaveBeenCalledOnce();
    invocations.closeTab();
    expect(actions.closeSelectedTab).toHaveBeenCalledOnce();
    invocations.newWindow();
    expect(actions.newWindow).toHaveBeenCalledOnce();
    invocations.closeWindow();
    expect(actions.closeSelectedWindow).toHaveBeenCalledOnce();
    invocations.quit();
    expect(actions.requestQuit).toHaveBeenCalledOnce();
    invocations.copy();
    expect(actions.copySelectedTerminal).toHaveBeenCalledOnce();
    invocations.paste();
    expect(actions.pasteSelectedTerminal).toHaveBeenCalledOnce();
    invocations.selectAll();
    expect(actions.selectAllSelectedTerminal).toHaveBeenCalledOnce();
    invocations.find();
    expect(actions.findInSelectedTerminal).toHaveBeenCalledOnce();
    invocations.zoomIn();
    expect(actions.zoomInSelectedWindow).toHaveBeenCalledOnce();
    invocations.zoomOut();
    expect(actions.zoomOutSelectedWindow).toHaveBeenCalledOnce();
    invocations.actualSize();
    expect(actions.resetSelectedWindowZoom).toHaveBeenCalledOnce();
    invocations.toggleFullScreen();
    expect(actions.toggleSelectedFullScreen).toHaveBeenCalledOnce();
    invocations.toggleSnippets();
    expect(actions.toggleSelectedSnippets).toHaveBeenCalledOnce();
    invocations.reloadConfig();
    expect(actions.reloadUserConfiguration).toHaveBeenCalledOnce();

    for (let position = 1; position <= 9; position += 1)
      invocations[`selectTab${position}` as keyof typeof invocations]();
    expect(actions.selectTabInSelectedWindow.mock.calls).toEqual(
      Array.from({ length: 9 }, (_, index) => [index + 1]),
    );
  });

  it("covers the whole keybind action vocabulary", () => {
    const invocations = terminalActionInvocations(menuActions());
    for (const action of TERMINAL_ACTION_NAMES)
      expect(invocations[action]).toBeTypeOf("function");
  });
});

it("wires the native context menu to explicit Terminal Surface actions", () => {
  const actions = { copy: vi.fn(), paste: vi.fn(), selectAll: vi.fn() };
  expect(terminalClipboardContextMenuTemplate(actions)).toEqual([
    expect.objectContaining({ label: "Copy", click: actions.copy }),
    expect.objectContaining({ label: "Paste", click: actions.paste }),
    expect.objectContaining({ type: "separator" }),
    expect.objectContaining({ label: "Select All", click: actions.selectAll }),
  ]);
});
