// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { emptyThemes } from "../fixtures/settings-themes";
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
import { TERMINAL_ACTION_NAMES } from "../../src/shared/terminal-keybinds";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => document.body.replaceChildren());

const snapshot = (
  find: {
    effective: string | null;
    state: "inherit" | "custom" | "unbound";
  },
  platform = "linux",
): SettingsSnapshot => ({
  configurationPath: "/synthetic/omxterm/config.json",
  platform,
  revision: "r1",
  text: '{ "version": 1 }\n',
  values: {},
  keybinds: {
    find,
    // Like main: an explicit binding drops another action's default.
    newTab: {
      effective:
        find.effective === "Control+Shift+T" ? null : "Control+Shift+T",
      state: "inherit",
    },
    toggleAuxiliaryPanel: { effective: null, state: "inherit" },
    moveAuxiliaryPanel: {
      effective:
        platform === "darwin"
          ? "CommandOrControl+Shift+Alt+P"
          : "Control+Shift+Alt+P",
      state: "inherit",
    },
    toggleFiles: { effective: null, state: "inherit" },
    toggleSshConnect: { effective: null, state: "inherit" },
  },
});

async function open(language?: RendererLanguage, platform = "linux") {
  let current = snapshot(
    { effective: "Control+Shift+F", state: "inherit" },
    platform,
  );
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
        platform,
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
    themes: vi.fn(async () => emptyThemes),
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
      "Unbind shortcut for Find",
    );
    expect(view.button("find", "default").getAttribute("aria-label")).toBe(
      "Use default shortcut for Find",
    );
    record.focus();
    record.click();
    expect(record.getAttribute("aria-label")).toBe(
      "Cancel shortcut recording for Find",
    );
    language.set("pt-BR");
    expect(view.button("find", "record")).toBe(record);
    expect(document.activeElement).toBe(record);
    expect(record.textContent).toBe("Cancelar");
    expect(record.getAttribute("aria-label")).toBe(
      "Cancelar gravação de atalho para Buscar",
    );
    expect(view.button("find", "unbind").getAttribute("aria-label")).toBe(
      "Remover atalho para Buscar",
    );
    expect(view.button("find", "default").getAttribute("aria-label")).toBe(
      "Usar atalho padrão para Buscar",
    );
    record.click();
    expect(record.getAttribute("aria-label")).toBe("Gravar atalho para Buscar");
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
  it("shows each action's effective shortcut and marks only custom or unbound ones", async () => {
    const view = await open();
    expect(view.cells("find")).toEqual(["Ctrl+Shift+F", ""]);
    expect(view.cells("newTab")).toEqual(["Ctrl+Shift+T", ""]);
    expect(view.cells("toggleAuxiliaryPanel")).toEqual(["None", ""]);
    expect(view.cells("moveAuxiliaryPanel")).toEqual(["Ctrl+Alt+Shift+P", ""]);
    expect(
      view.button("moveAuxiliaryPanel", "record").getAttribute("aria-label"),
    ).toBe("Record shortcut for Move Side Panel to Other Side");
    expect(
      view.button("toggleAuxiliaryPanel", "record").getAttribute("aria-label"),
    ).toBe("Record shortcut for Toggle Side Panel");
    for (const [action, title] of [
      ["toggleFiles", "Files"],
      ["toggleSshConnect", "SSH Connect"],
    ]) {
      expect(view.cells(action!)).toEqual(["None", ""]);
      expect(view.button(action!, "record").getAttribute("aria-label")).toBe(
        `Record shortcut for Toggle ${title}`,
      );
    }
    expect(view.cells("quit")).toEqual(["None", ""]);
    expect(view.button("find", "record").getAttribute("aria-label")).toBe(
      "Record shortcut for Find",
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

  it("explains macOS Option recording limits before and after an unsupported key", async () => {
    const view = await open(undefined, "darwin");
    view.button("find", "record").click();
    expect(view.status()).toMatch(
      /^Press the new shortcut, or Escape to cancel\. .*Option/u,
    );
    view.deliver({ invalid: true });
    expect(view.status()).toMatch(
      /^That key combination is not supported\. .*Option/u,
    );
    expect(view.button("find", "record").textContent).toBe("Cancel");
    expect(view.changeKeybind).not.toHaveBeenCalled();
  });

  it("relabels the macOS Option limitation while recording", async () => {
    const language = createRendererLanguage("en-US");
    const view = await open(language, "darwin");
    view.button("find", "record").click();
    language.set("pt-BR");
    expect(view.status()).toContain("teclas mortas podem não ser graváveis");
    expect(view.status()).toContain("afeta apenas a entrada no terminal");
    view.deliver({ invalid: true });
    expect(view.status()).toContain("teclas mortas podem não ser graváveis");
    language.set("en-US");
    expect(view.status()).toContain("dead keys may not be recordable");
  });

  it("shows a default taken by another binding as unbound and keeps it recordable", async () => {
    const view = await open();
    view.button("find", "record").click();
    view.deliver({ accelerator: "Control+Shift+T" });
    await view.settle();
    expect(view.cells("find")).toEqual(["Ctrl+Shift+T", "Custom"]);
    expect(view.cells("newTab")).toEqual(["None", ""]);
    expect(view.button("newTab", "record").disabled).toBe(false);
    view.button("newTab", "record").click();
    view.deliver({ accelerator: "Control+Alt+T" });
    await view.settle();
    expect(view.changeKeybind).toHaveBeenLastCalledWith({
      action: "newTab",
      choice: { state: "custom", accelerator: "Control+Alt+T" },
    });
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
    expect(view.cells("find")).toEqual(["Ctrl+Shift+F", ""]);
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
    expect(view.cells("find")).toEqual(["Ctrl+Shift+F", ""]);
    for (const [action, title] of [
      ["toggleFiles", "Files"],
      ["toggleSshConnect", "SSH Connect"],
    ]) {
      expect(view.cells(action!)).toEqual(["Nenhum", ""]);
      expect(view.button(action!, "record").getAttribute("aria-label")).toBe(
        `Gravar atalho para Alternar ${title}`,
      );
    }
    expect(
      document.querySelector(".settings-shortcuts .settings-hint")!.textContent,
    ).toBe("Atalhos do app recebem a tecla antes dos programas do terminal.");
    expect(view.cells("quit")).toEqual(["Nenhum", ""]);
    expect(view.cells("toggleAuxiliaryPanel")).toEqual(["Nenhum", ""]);
    expect(view.cells("moveAuxiliaryPanel")).toEqual(["Ctrl+Alt+Shift+P", ""]);
    expect(
      view.button("toggleAuxiliaryPanel", "record").getAttribute("aria-label"),
    ).toBe("Gravar atalho para Alternar Barra Lateral");
    expect(view.button("find", "record").textContent).toBe("Gravar");
    expect(
      document.querySelector(
        '[data-action="selectTab3"] .settings-shortcut-name',
      )!.textContent,
    ).toBe("Selecionar Aba 3");
    language.set("en-US");
    expect(
      document.querySelector(".settings-shortcuts .settings-hint")!.textContent,
    ).toBe("App shortcuts get the key before terminal programs do.");
    expect(view.cells("find")).toEqual(["Ctrl+Shift+F", ""]);
    expect(view.button("find", "record").textContent).toBe("Record");
  });
});

describe("Shortcuts filter", () => {
  const field = () =>
    document.querySelector<HTMLInputElement>(
      ".settings-shortcuts input[type=search]",
    )!;
  const type = (query: string) => {
    field().value = query;
    field().dispatchEvent(new Event("input"));
  };
  const press = (key: string) => {
    const event = new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
    });
    field().dispatchEvent(event);
    return event;
  };
  const shown = () =>
    [...document.querySelectorAll<HTMLElement>(".settings-shortcut")]
      .filter((row) => !row.hidden)
      .map((row) => row.dataset.action);
  const noMatch = () =>
    document.querySelector<HTMLElement>(".settings-shortcuts [role=status]")!;

  it("narrows the list by action name and keeps the list's order", async () => {
    await open(createRendererLanguage("en-US"));
    expect(shown()).toEqual([...TERMINAL_ACTION_NAMES]);
    type("split");
    expect(shown()).toEqual(["splitRight", "splitDown"]);
    type("  PANE   swap ");
    expect(shown()).toEqual([
      "swapPaneLeft",
      "swapPaneRight",
      "swapPaneUp",
      "swapPaneDown",
    ]);
    expect(noMatch().hidden).toBe(true);
  });

  it("follows the language and ignores accents", async () => {
    const language = createRendererLanguage("pt-BR");
    await open(language);
    type("dividir a direita");
    expect(shown()).toEqual(["splitRight"]);
    language.set("en-US");
    expect(shown()).toEqual([]);
    expect(noMatch().hidden).toBe(false);
    expect(noMatch().textContent).not.toBe("");
    type("split right");
    expect(shown()).toEqual(["splitRight"]);
  });

  it.each([
    "⌘⌥⇧P",
    "cmd+alt+shift+p",
    "Shift+Option+Command+P",
    "opt cmd p",
    "⌥ p",
    "cmd+",
    "cmd+sh",
  ])("finds a macOS binding by its keys typed as %s", async (query) => {
    await open(createRendererLanguage("en-US"), "darwin");
    type(query);
    expect(shown()).toEqual(["moveAuxiliaryPanel"]);
  });

  it("reads one character as a whole key and more as a key being typed", async () => {
    await open(createRendererLanguage("en-US"));
    type("ctrl+shift");
    expect(shown()).toEqual(["find", "newTab", "moveAuxiliaryPanel"]);
    type("ctrl+shift+t");
    expect(shown()).toEqual(["newTab"]);
    type("ctrl+alt");
    expect(shown()).toEqual(["moveAuxiliaryPanel"]);
    type("ctrl+x");
    expect(shown()).toEqual([]);
    expect(noMatch().hidden).toBe(false);
  });

  it("reads a spelled-out modifier as a key only inside a combination", async () => {
    await open(createRendererLanguage("en-US"), "darwin");
    type("command");
    expect(shown()).toEqual(["commandPalette"]);
    type("win");
    expect(shown()).toContain("newWindow");
    expect(shown()).not.toContain("moveAuxiliaryPanel");
    type("command+");
    expect(shown()).toEqual(["moveAuxiliaryPanel"]);
    type("+");
    expect(shown()).toEqual([]);
  });

  it("finds changed shortcuts by their state", async () => {
    const view = await open(createRendererLanguage("en-US"));
    view.button("find", "unbind").click();
    await view.settle();
    type(view.cells("find")[1]!);
    expect(shown()).toEqual(["find"]);
  });

  it("clears on Escape, and leaves Escape alone when already empty", async () => {
    await open(createRendererLanguage("en-US"));
    type("nothing has this name");
    expect(shown()).toEqual([]);
    expect(press("Escape").defaultPrevented).toBe(true);
    expect(field().value).toBe("");
    expect(shown()).toEqual([...TERMINAL_ACTION_NAMES]);
    expect(noMatch().hidden).toBe(true);
    expect(press("Escape").defaultPrevented).toBe(false);
  });

  it("keeps a row found by its keys in place while those keys change", async () => {
    const view = await open(createRendererLanguage("en-US"));
    type("ctrl+shift+f");
    expect(shown()).toEqual(["find"]);
    view.button("find", "record").click();
    view.deliver({ accelerator: "F2" });
    await view.settle();
    expect(view.cells("find")).toEqual(["F2", "Custom"]);
    expect(shown()).toEqual(["find"]);
    type("f2");
    expect(shown()).toEqual(["find"]);
    type("ctrl+shift+f");
    expect(shown()).toEqual([]);
  });

  it("is named for assistive technology in both languages", async () => {
    const language = createRendererLanguage("en-US");
    await open(language);
    const english = field().getAttribute("aria-label");
    expect(english).toBeTruthy();
    language.set("pt-BR");
    expect(field().getAttribute("aria-label")).toBeTruthy();
    expect(field().getAttribute("aria-label")).not.toBe(english);
  });
});
