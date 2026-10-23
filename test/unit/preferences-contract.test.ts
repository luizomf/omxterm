import { describe, expect, it, vi } from "vitest";
import {
  isCapturedKeyPress,
  isPreferencesPatch,
} from "../../src/shared/preferences";
import {
  acceleratorFromKeyEvent,
  displayAccelerator,
} from "../../src/renderer/preferences/shortcut-recorder";
import {
  deliverKeybindsFromKeyEvents,
  type KeybindKeyboardInput,
  type KeybindKeyEvent,
} from "../../src/main/keybind-delivery";
import { applyPreferencesPatch } from "../../src/main/preferences-document";
import {
  TERMINAL_ACTION_NAMES,
  terminalDefaultKeybinds,
} from "../../src/shared/terminal-keybinds";
import { englishMessages } from "../../src/shared/locales/en";
import { missingTranslations } from "../../src/shared/i18n";
import {
  TERMINAL_SCHEMES,
  terminalScheme,
} from "../../src/shared/terminal-schemes";
import { isTerminalTheme } from "../../src/shared/terminal-theme";

const key = (
  code: string,
  modifiers: Partial<
    Record<"ctrlKey" | "altKey" | "shiftKey" | "metaKey", boolean>
  > = {},
  value = "",
) => ({
  key: value,
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...modifiers,
});

describe("Preferences contract", () => {
  it("accepts in-range patches of known settings only", () => {
    expect(isPreferencesPatch({ fontSize: 18 })).toBe(true);
    expect(
      isPreferencesPatch({
        scheme: "file:My Theme.json",
        padding: { top: 2 },
        keybinds: { copy: "Control+Shift+Y" },
      }),
    ).toBe(true);
    for (const patch of [
      {},
      { fontSize: 7 },
      { fontSize: 16.5 },
      { transparency: 2 },
      { scheme: "../../etc/passwd" },
      { scheme: "file:../x.json" },
      { padding: { middle: 1 } },
      { keybinds: { rm: "Control+R" } },
      { logLevel: "trace" },
      { windowsShell: "C:\\evil\0.exe" },
      { windowsShell: 5 },
      { fontFamily: "x".repeat(300) },
    ])
      expect(isPreferencesPatch(patch), JSON.stringify(patch)).toBe(false);
  });

  it("accepts only the captured key shape", () => {
    const press = {
      key: "t",
      code: "KeyT",
      control: true,
      meta: false,
      alt: false,
      shift: true,
    };
    expect(isCapturedKeyPress(press)).toBe(true);
    expect(isCapturedKeyPress({ ...press, extra: 1 })).toBe(false);
    expect(isCapturedKeyPress({ ...press, shift: "yes" })).toBe(false);
  });

  it("spells key presses as Electron accelerators", () => {
    expect(
      acceleratorFromKeyEvent(
        key("KeyT", { ctrlKey: true, shiftKey: true }, "T"),
        "linux",
      ),
    ).toBe("Control+Shift+T");
    expect(
      acceleratorFromKeyEvent(key("Comma", { metaKey: true }, ","), "darwin"),
    ).toBe("Command+,");
    expect(
      acceleratorFromKeyEvent(key("ArrowLeft", { altKey: true }), "linux"),
    ).toBe("Alt+Left");
    expect(acceleratorFromKeyEvent(key("F5"), "linux")).toBe("F5");
    expect(
      acceleratorFromKeyEvent(
        key("ShiftLeft", { shiftKey: true }, "Shift"),
        "linux",
      ),
    ).toBeUndefined();
    expect(
      acceleratorFromKeyEvent(key("IntlRo", { ctrlKey: true }), "linux"),
    ).toBeUndefined();
  });

  it("shows accelerators in each platform's style", () => {
    expect(displayAccelerator("CommandOrControl+Shift+P", "linux")).toBe(
      "Ctrl+Shift+P",
    );
    expect(displayAccelerator("Command+Shift+P", "darwin")).toBe("⌘⇧P");
  });

  it("names every keybind action in every catalog", () => {
    for (const action of TERMINAL_ACTION_NAMES.filter(
      (name) => !name.startsWith("selectTab"),
    ))
      expect(englishMessages).toHaveProperty(`action.${action}`);
    expect(missingTranslations("pt-BR")).toEqual([]);
  });

  it("ships valid, uniquely named built-in schemes", () => {
    expect(TERMINAL_SCHEMES).toHaveLength(14);
    expect(new Set(TERMINAL_SCHEMES.map((scheme) => scheme.id)).size).toBe(14);
    for (const scheme of TERMINAL_SCHEMES)
      expect(isTerminalTheme(scheme.theme), scheme.id).toBe(true);
    expect(terminalScheme("nord")!.theme.colors.background).toBe("#2e3440");
  });

  it("removes emptied sections when a patch clears them", () => {
    const document = applyPreferencesPatch(
      { version: 1, font: { family: "Mono Test" }, keybinds: { copy: "F9" } },
      {
        fontFamily: "",
        keybinds: { copy: terminalDefaultKeybinds("linux").copy },
      },
      terminalDefaultKeybinds("linux"),
      undefined,
    );
    expect(document).toEqual({ version: 1 });
  });
});

describe("shortcut capture in keybind delivery", () => {
  it("sends every key to the recorder instead of running keybinds", () => {
    let listener!: (
      event: KeybindKeyEvent,
      input: KeybindKeyboardInput,
    ) => void;
    const invoke = vi.fn();
    const send = vi.fn();
    let capturing = true;
    deliverKeybindsFromKeyEvents(
      {
        on: (_event, handler) => {
          listener = handler;
        },
      },
      () => terminalDefaultKeybinds("linux"),
      invoke,
      "linux",
      { active: () => capturing, send },
    );
    const event = { preventDefault: vi.fn() };
    const input = {
      type: "keyDown",
      key: "T",
      code: "KeyT",
      control: true,
      meta: false,
      alt: false,
      shift: true,
    };
    listener(event, input);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith({
      key: "T",
      code: "KeyT",
      control: true,
      meta: false,
      alt: false,
      shift: true,
    });
    expect(invoke).not.toHaveBeenCalled();
    capturing = false;
    listener({ preventDefault: vi.fn() }, input);
    expect(invoke).toHaveBeenCalledWith("newTab");
  });
});
