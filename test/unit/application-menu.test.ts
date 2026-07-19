import { describe, expect, it, vi } from "vitest";
import {
  terminalApplicationMenuTemplate,
  terminalClipboardContextMenuTemplate,
} from "../../src/main/application-menu";
import { DEFAULT_TERMINAL_KEYBINDS } from "../../src/shared/terminal-keybinds";

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
    zoomInSelectedWindow: vi.fn(),
    zoomOutSelectedWindow: vi.fn(),
    resetSelectedWindowZoom: vi.fn(),
    copySelectedTerminal: vi.fn(),
    pasteSelectedTerminal: vi.fn(),
    selectAllSelectedTerminal: vi.fn(),
    toggleSelectedSnippets: vi.fn(),
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

it("wires the native context menu to explicit Terminal Surface actions", () => {
  const actions = { copy: vi.fn(), paste: vi.fn(), selectAll: vi.fn() };
  expect(terminalClipboardContextMenuTemplate(actions)).toEqual([
    expect.objectContaining({ label: "Copy", click: actions.copy }),
    expect.objectContaining({ label: "Paste", click: actions.paste }),
    expect.objectContaining({ type: "separator" }),
    expect.objectContaining({ label: "Select All", click: actions.selectAll }),
  ]);
});
