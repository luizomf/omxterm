import { describe, expect, it, vi } from "vitest";
import {
  terminalApplicationMenuTemplate,
  terminalClipboardContextMenuTemplate,
} from "../../src/main/application-menu";

describe("native application menu", () => {
  it("wires native window lifecycle accelerators to application actions", () => {
    const actions = {
      newWindow: vi.fn(),
      closeSelectedWindow: vi.fn(),
      requestQuit: vi.fn(),
      toggleSelectedFullScreen: vi.fn(),
      toggleSelectedAlwaysOnTop: vi.fn(),
      zoomInSelectedWindow: vi.fn(),
      zoomOutSelectedWindow: vi.fn(),
      resetSelectedWindowZoom: vi.fn(),
      copySelectedTerminal: vi.fn(),
      pasteSelectedTerminal: vi.fn(),
      selectAllSelectedTerminal: vi.fn(),
    };
    const template = terminalApplicationMenuTemplate("OMXTerm", actions);

    const items = template.flatMap((menu) =>
      Array.isArray(menu.submenu) ? menu.submenu : [],
    );
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "New Window",
          accelerator: "CommandOrControl+N",
          click: actions.newWindow,
        }),
        expect.objectContaining({
          label: "Close Window",
          accelerator: "CommandOrControl+W",
          click: actions.closeSelectedWindow,
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
      ]),
    );
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
