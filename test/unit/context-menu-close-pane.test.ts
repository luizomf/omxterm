// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { terminalClipboardContextMenuTemplate } from "../../src/main/application-menu";
import { createClipboardRequests } from "../../src/main/terminal-ipc-boundaries";
import { withClosePane } from "../../src/main/terminal-context-menu";
import { isTerminalContextMenuRequest } from "../../src/shared/terminal-contract";
import { createTabsHarness } from "../fixtures/terminal-tabs-harness";

const forgedOffers = [
  { closePane: false },
  { closePane: "yes" },
  { closePane: true, extra: 1 },
  [true],
];

describe("Close Pane in the terminal context menu", () => {
  it("focuses a right-clicked pane and offers Close Pane only while split", async () => {
    const clipboard = {
      writeText: vi.fn(async () => {}),
      readText: vi.fn(async () => ""),
      confirmPaste: vi.fn(async () => false),
      requestContextMenu: vi.fn(),
    };
    const harness = createTabsHarness({ surfaceOptions: { clipboard } });
    await harness.tabs.ready;
    const menu = (index: number) =>
      harness.mountedSurfaceOptions[index]!.clipboard!.requestContextMenu();

    menu(0);
    expect(clipboard.requestContextMenu).toHaveBeenLastCalledWith(undefined);

    harness.tabs.handleCommand({ action: "split", direction: "right" });
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(2));
    expect(harness.notifySelection.mock.calls.at(-1)?.[0]).toBe("s2");
    menu(0);
    expect(clipboard.requestContextMenu).toHaveBeenLastCalledWith({
      closePane: true,
    });
    expect(harness.notifySelection.mock.calls.at(-1)?.[0]).toBe("s1");

    // Main answers the menu item with the ordinary Close Pane command.
    harness.tabs.handleCommand({ action: "close-pane" });
    expect(harness.surfaces[0]!.dispose).toHaveBeenCalled();
    expect(harness.surfaces[1]!.dispose).not.toHaveBeenCalled();
    clipboard.requestContextMenu.mockClear();
    menu(0);
    expect(clipboard.requestContextMenu).not.toHaveBeenCalled();
    menu(1);
    expect(clipboard.requestContextMenu).toHaveBeenLastCalledWith(undefined);
    harness.tabs.dispose();
  });

  it("adds Close Pane after Save Output with the current keybind", () => {
    const actions = {
      copy: vi.fn(),
      paste: vi.fn(),
      selectAll: vi.fn(),
      saveOutput: vi.fn(),
    };
    const labels = {
      copy: "Copiar",
      paste: "Colar",
      selectAll: "Selecionar Tudo",
      saveOutput: "Salvar Saída em Arquivo…",
    };
    const base = terminalClipboardContextMenuTemplate(actions, labels);
    const click = vi.fn();
    const template = withClosePane(base, "Fechar Painel", {
      click,
      accelerator: "Control+Shift+W",
    });
    expect(template.map((item) => item.label ?? item.type)).toEqual([
      "Copiar",
      "Colar",
      "separator",
      "Selecionar Tudo",
      "separator",
      "Salvar Saída em Arquivo…",
      "separator",
      "Fechar Painel",
    ]);
    expect(template.at(-1)).toMatchObject({
      accelerator: "Control+Shift+W",
      click,
    });
    expect(
      withClosePane(base, "Fechar Painel", { click, accelerator: null }).at(-1),
    ).not.toHaveProperty("accelerator");
    expect(withClosePane(base, "Fechar Painel")).toBe(base);
  });

  it("reaches main's menu only as the exact offer", () => {
    for (const forged of forgedOffers)
      expect(isTerminalContextMenuRequest(forged)).toBe(false);
    const showClipboardContextMenu = vi.fn();
    const reject = vi.fn();
    const requests = createClipboardRequests(
      {
        writeClipboardText: vi.fn(),
        readClipboardText: () => "",
        confirmPaste: async () => false,
        showClipboardContextMenu,
      } as never,
      reject,
    );
    for (const forged of forgedOffers)
      requests.showClipboardContextMenu(forged);
    expect(showClipboardContextMenu).not.toHaveBeenCalled();
    expect(reject).toHaveBeenCalledTimes(forgedOffers.length);
    requests.showClipboardContextMenu();
    expect(showClipboardContextMenu).toHaveBeenLastCalledWith();
    requests.showClipboardContextMenu({ closePane: true });
    expect(showClipboardContextMenu).toHaveBeenLastCalledWith({
      closePane: true,
    });
  });
});
