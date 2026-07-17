import { describe, expect, it, vi } from "vitest";
import { terminalApplicationMenuTemplate } from "../../src/main/application-menu";

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
      ]),
    );
  });
});
