// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createSettingsView as createSettingsDialog } from "../../src/renderer/settings/settings-dialog";
import {
  createRendererLanguage,
  type RendererLanguage,
} from "../../src/renderer/renderer-language";
import type {
  SettingsBridge,
  SettingsResult,
  SettingsSnapshot,
} from "../../src/shared/settings";
import type {
  CapturedShortcut,
  SettingsKeybindChange,
} from "../../src/shared/settings-keybinds";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => document.body.replaceChildren());

const snapshot = (find: {
  effective: string | null;
  state: "inherit" | "custom" | "unbound";
}): SettingsSnapshot => ({
  configurationPath: "/synthetic/omxterm/config.json",
  platform: "linux",
  revision: "r1",
  text: '{ "version": 1 }\n',
  values: {},
  keybinds: {
    find,
    newTab: { effective: "Control+Shift+T", state: "inherit" },
  },
});

async function open(language?: RendererLanguage) {
  let current = snapshot({ effective: "Control+Shift+F", state: "inherit" });
  let deliver: ((shortcut: CapturedShortcut) => void) | undefined;
  const stopCapture = vi.fn();
  const changeKeybind = vi.fn(
    async (change: SettingsKeybindChange): Promise<SettingsResult> => {
      const { choice } = change;
      current = snapshot(
        choice.state === "custom"
          ? { effective: choice.accelerator, state: "custom" }
          : choice.state === "unbound"
            ? { effective: null, state: "unbound" }
            : { effective: "Control+Shift+F", state: "inherit" },
      );
      return {
        status: "saved",
        snapshot: current,
        application: { applied: true, notices: [] },
        lifetimes: [],
      };
    },
  );
  const bridge: SettingsBridge = {
    snapshot: async () => current,
    change: vi.fn(),
    saveText: vi.fn(),
    changeKeybind,
    captureShortcut: vi.fn((listener: (shortcut: CapturedShortcut) => void) => {
      deliver = listener;
      return stopCapture;
    }),
    onOpen: () => () => {},
  };
  const dialog = createSettingsDialog(document, bridge, {
    focusTerminal: vi.fn(),
    onActivityChange: vi.fn(),
    ...(language ? { language } : {}),
  });
  await dialog.open();
  document.querySelector<HTMLButtonElement>("#settings-tab-shortcuts")!.click();
  const row = (action: string) =>
    document.querySelector<HTMLElement>(
      `.settings-shortcut[data-action="${action}"]`,
    )!;
  const cells = (action: string) =>
    [".settings-shortcut-value", ".settings-shortcut-state"].map(
      (selector) => row(action).querySelector(selector)!.textContent,
    );
  const button = (action: string, kind: "record" | "unbind" | "default") =>
    row(action).querySelector<HTMLButtonElement>(`.settings-shortcut-${kind}`)!;
  const settle = async () => {
    for (let index = 0; index < 4; index += 1) await Promise.resolve();
  };
  const status = () => document.querySelector(".settings-status")!.textContent;
  return {
    dialog,
    bridge,
    changeKeybind,
    stopCapture,
    deliver: (shortcut: CapturedShortcut) => deliver!(shortcut),
    cells,
    button,
    settle,
    status,
  };
}

describe("Shortcuts page", () => {
  it("names the current operation and action accessibly through live relabel", async () => {
    const language = createRendererLanguage("en-US");
    const view = await open(language);
    const record = view.button("find", "record");
    expect(view.button("find", "unbind").getAttribute("aria-label")).toBe(
      "Unbind shortcut for Find…",
    );
    expect(view.button("find", "default").getAttribute("aria-label")).toBe(
      "Use default shortcut for Find…",
    );
    record.focus();
    record.click();
    expect(record.getAttribute("aria-label")).toBe(
      "Cancel shortcut recording for Find…",
    );
    language.set("pt-BR");
    expect(view.button("find", "record")).toBe(record);
    expect(document.activeElement).toBe(record);
    expect(record.textContent).toBe("Cancelar");
    expect(record.getAttribute("aria-label")).toBe(
      "Cancelar gravação de atalho para Buscar…",
    );
    expect(view.button("find", "unbind").getAttribute("aria-label")).toBe(
      "Remover atalho para Buscar…",
    );
    expect(view.button("find", "default").getAttribute("aria-label")).toBe(
      "Usar atalho padrão para Buscar…",
    );
    record.click();
    expect(record.getAttribute("aria-label")).toBe(
      "Gravar atalho para Buscar…",
    );
    expect(view.status()).toBe("Gravação cancelada.");
  });
  it("releases capture on page departure even when activation never focused Record", async () => {
    const view = await open();
    view.button("find", "record").click();
    expect(document.activeElement).not.toBe(view.button("find", "record"));
    document.querySelector<HTMLButtonElement>("#settings-tab-general")!.click();
    expect(
      document
        .querySelector("#settings-panel-shortcuts")!
        .hasAttribute("hidden"),
    ).toBe(true);
    expect(view.stopCapture).toHaveBeenCalledOnce();
    expect(view.status()).toBe("Recording cancelled.");
    view.deliver({ accelerator: "F2" });
    expect(view.changeKeybind).not.toHaveBeenCalled();
    document
      .querySelector<HTMLButtonElement>("#settings-tab-shortcuts")!
      .click();
    expect(view.button("find", "record").textContent).toBe("Record");
  });
  it.each(["cancel", "blur"])(
    "replaces recording instructions after %s",
    async (reason) => {
      const view = await open();
      const record = view.button("find", "record");
      if (reason === "blur") record.focus();
      record.click();
      expect(view.status()).toBe(
        "Press the new shortcut, or Escape to cancel.",
      );
      if (reason === "cancel") record.click();
      else record.blur();
      expect(view.status()).toBe("Recording cancelled.");
      expect(record.textContent).toBe("Record");
      expect(view.stopCapture).toHaveBeenCalledOnce();
      view.deliver({ accelerator: "F2" });
      expect(view.changeKeybind).not.toHaveBeenCalled();
    },
  );
  it("shows each action's effective shortcut and state", async () => {
    const view = await open();
    expect(view.cells("find")).toEqual(["Ctrl+Shift+F", "Default"]);
    expect(view.cells("newTab")).toEqual(["Ctrl+Shift+T", "Default"]);
    expect(view.cells("quit")).toEqual(["None", ""]);
    expect(view.button("find", "record").getAttribute("aria-label")).toBe(
      "Record shortcut for Find…",
    );
    expect(view.button("find", "default").disabled).toBe(true);
  });

  it("records a shortcut from main and saves it as custom", async () => {
    const view = await open();
    view.button("find", "record").click();
    expect(view.cells("find")[0]).toBe("Press a shortcut…");
    view.deliver({ invalid: true });
    expect(view.status()).toContain("key combination is not supported");
    expect(view.changeKeybind).not.toHaveBeenCalled();
    view.deliver({ accelerator: "F2" });
    await view.settle();
    expect(view.changeKeybind).toHaveBeenCalledExactlyOnceWith({
      action: "find",
      choice: { state: "custom", accelerator: "F2" },
    });
    expect(view.cells("find")).toEqual(["F2", "Custom"]);
    expect(view.status()).toBe("Saved.");
  });

  it("cancels recording without saving and unbinds or restores the default", async () => {
    const view = await open();
    view.button("find", "record").click();
    view.deliver({ cancelled: true });
    expect(view.status()).toBe("Recording cancelled.");
    expect(view.changeKeybind).not.toHaveBeenCalled();

    view.button("find", "unbind").click();
    await view.settle();
    expect(view.cells("find")).toEqual(["None", "Unbound"]);
    view.button("find", "default").click();
    await view.settle();
    expect(
      view.changeKeybind.mock.calls.map(([change]) => change.choice),
    ).toEqual([{ state: "unbound" }, { state: "inherit" }]);
    expect(view.cells("find")).toEqual(["Ctrl+Shift+F", "Default"]);
  });

  it("ends capture when recording is toggled off or the dialog closes", async () => {
    const view = await open();
    view.button("find", "record").click();
    view.button("find", "record").click();
    expect(view.stopCapture).toHaveBeenCalledOnce();
    view.button("newTab", "record").click();
    view.dialog.dispose();
    expect(view.stopCapture).toHaveBeenCalledTimes(2);
    view.deliver({ accelerator: "F3" });
    await view.settle();
    expect(view.changeKeybind).not.toHaveBeenCalled();
  });
  it("relabels names, states and controls when the language changes", async () => {
    const language = createRendererLanguage("pt-BR");
    const view = await open(language);
    expect(document.querySelector("#settings-tab-shortcuts")!.textContent).toBe(
      "Atalhos",
    );
    expect(view.cells("find")).toEqual(["Ctrl+Shift+F", "Padrão"]);
    expect(view.cells("quit")).toEqual(["Nenhum", ""]);
    expect(view.button("find", "record").textContent).toBe("Gravar");
    expect(
      document.querySelector(
        '[data-action="selectTab3"] .settings-shortcut-name',
      )!.textContent,
    ).toBe("Selecionar Aba 3");
    language.set("en-US");
    expect(view.cells("find")).toEqual(["Ctrl+Shift+F", "Default"]);
    expect(view.button("find", "record").textContent).toBe("Record");
  });
});
