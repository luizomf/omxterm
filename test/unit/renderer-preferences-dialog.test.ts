// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { openPreferencesDialog } from "../../src/renderer/preferences/preferences-dialog";
import { preferencesValues } from "../../src/main/preferences-document";
import { DEFAULT_USER_CONFIGURATION } from "../../src/main/user-configuration";
import { createTranslator } from "../../src/shared/i18n";
import type {
  CapturedKeyPress,
  PreferencesPatch,
  PreferencesSaveResult,
  PreferencesSnapshot,
} from "../../src/shared/preferences";
import type { PreferencesBridge } from "../../src/shared/terminal-bridge";
import { terminalDefaultKeybinds } from "../../src/shared/terminal-keybinds";

function snapshot(values = {}): PreferencesSnapshot {
  const defaults = preferencesValues(
    {
      ...DEFAULT_USER_CONFIGURATION,
      keybinds: terminalDefaultKeybinds("linux"),
    },
    "omtheme",
    { restoreWindows: false, highlightOutput: false },
  );
  return {
    values: { ...defaults, ...values },
    defaults,
    schemes: [
      {
        id: "omtheme",
        name: "omtheme",
        builtIn: true,
        background: "#000000",
        foreground: "#ffffff",
        palette: ["#ff0000"],
      },
      {
        id: "dracula",
        name: "Dracula",
        builtIn: true,
        background: "#282a36",
        foreground: "#f8f8f2",
        palette: ["#ff5555"],
      },
    ],
    fontFamilies: ["Mono Test"],
    platform: "linux",
  };
}

function bridge(answer: (patch: PreferencesPatch) => PreferencesSaveResult) {
  let captured: ((key: CapturedKeyPress) => void) | undefined;
  const fake = {
    get: vi.fn(async () => snapshot()),
    save: vi.fn(async (patch: PreferencesPatch) => answer(patch)),
    reset: vi.fn(async () => ({ ok: true as const, snapshot: snapshot() })),
    captureShortcut: vi.fn(async () => {}),
    onCapturedKey: vi.fn((listener: (key: CapturedKeyPress) => void) => {
      captured = listener;
      return () => {
        captured = undefined;
      };
    }),
    onOpen: vi.fn(() => () => {}),
    readFile: vi.fn(async () => ({
      path: "/home/me/.config/omxterm/config.json",
      text: '{\n  "version": 1\n}\n',
    })),
    writeFile: vi.fn(async () => ({ ok: true as const, snapshot: snapshot() })),
  } satisfies PreferencesBridge;
  return { fake, press: (key: CapturedKeyPress) => captured?.(key) };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function open(fake: PreferencesBridge) {
  const closed = openPreferencesDialog(document, {
    translator: createTranslator("en"),
    bridge: fake,
  });
  for (let tries = 0; tries < 50; tries += 1) {
    if (document.querySelector(".preferences-dialog")) break;
    await flush();
  }
  // Wrapped: returning the promise itself would wait for the dialog to close.
  return { closed };
}

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("Preferences dialog", () => {
  it("lists its pages and shows one at a time", async () => {
    const { fake } = bridge(() => ({ ok: true, snapshot: snapshot() }));
    await open(fake);
    const tabs = [
      ...document.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    ];
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Appearance",
      "Terminal",
      "Window and Tabs",
      "Shortcuts",
      "Advanced",
      "config.json",
    ]);
    const panels = document.querySelectorAll<HTMLElement>('[role="tabpanel"]');
    expect([...panels].filter((panel) => !panel.hidden)).toHaveLength(1);
    tabs[3]!.click();
    expect(panels[3]!.hidden).toBe(false);
    expect(panels[0]!.hidden).toBe(true);
  });

  it("saves a change at once and marks the selected scheme", async () => {
    const { fake } = bridge((patch) => ({
      ok: true,
      snapshot: snapshot(patch as object),
    }));
    await open(fake);
    const dracula = document.querySelector<HTMLButtonElement>(
      '[data-scheme="dracula"]',
    )!;
    expect(dracula.getAttribute("aria-checked")).toBe("false");
    dracula.click();
    await flush();
    expect(fake.save).toHaveBeenCalledWith({ scheme: "dracula" });
    expect(dracula.getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector(".preferences-status")!.textContent).toBe(
      "Saved. Changes are applied to every window.",
    );
  });

  it("shows why a change was refused and restores the saved value", async () => {
    const { fake } = bridge(() => ({
      ok: false,
      error: "font.family: must exactly name an installed font family",
      snapshot: snapshot(),
    }));
    await open(fake);
    const family = document.querySelector<HTMLInputElement>(
      'input[list="preferences-font-families"]',
    )!;
    family.value = "Missing";
    family.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    await flush();
    expect(fake.save).toHaveBeenCalledWith({ fontFamily: "Missing" });
    expect(family.value).toBe("");
    const status = document.querySelector(".preferences-status")!;
    expect(status.textContent).toBe(
      "Not saved. font.family: must exactly name an installed font family",
    );
    expect(status.classList.contains("error")).toBe(true);
    // Enter committed the field without closing the dialog.
    expect(document.querySelector(".preferences-dialog")).not.toBeNull();
  });

  it("rejects out-of-range numbers before saving", async () => {
    const { fake } = bridge(() => ({ ok: true, snapshot: snapshot() }));
    await open(fake);
    const size = [
      ...document.querySelectorAll<HTMLInputElement>('input[type="number"]'),
    ][0]!;
    size.value = "200";
    size.dispatchEvent(new Event("change"));
    expect(fake.save).not.toHaveBeenCalled();
    expect(size.closest(".omx-field")!.textContent).toContain(
      "Enter a value from 8 to 72.",
    );
  });

  it("records a shortcut from keys routed through main", async () => {
    const { fake, press } = bridge((patch) => ({
      ok: true,
      snapshot: snapshot({
        keybinds: {
          ...terminalDefaultKeybinds("linux"),
          ...(patch.keybinds ?? {}),
        },
      }),
    }));
    const { closed } = await open(fake);
    const copy = document.querySelectorAll<HTMLButtonElement>(
      ".preferences-accelerator",
    )[1]!;
    expect(copy.textContent).toBe("Ctrl+Shift+C");
    copy.click();
    expect(fake.captureShortcut).toHaveBeenLastCalledWith(true);
    expect(copy.textContent).toBe("Press keys…");
    press({
      key: "Y",
      code: "KeyY",
      control: true,
      meta: false,
      alt: false,
      shift: true,
    });
    await flush();
    expect(fake.save).toHaveBeenCalledWith({
      keybinds: { copy: "Control+Shift+Y" },
    });
    expect(fake.captureShortcut).toHaveBeenLastCalledWith(false);
    expect(copy.textContent).toBe("Ctrl+Shift+Y");
    const reset =
      copy.parentElement!.querySelector<HTMLButtonElement>(".omx-icon-button")!;
    expect(reset.hidden).toBe(false);

    copy.click();
    press({
      key: "Escape",
      code: "Escape",
      control: false,
      meta: false,
      alt: false,
      shift: false,
    });
    expect(fake.save).toHaveBeenCalledOnce();
    expect(fake.captureShortcut).toHaveBeenLastCalledWith(false);

    copy.click();
    document.querySelector<HTMLButtonElement>(".omx-button-primary")!.click();
    await closed;
    expect(fake.captureShortcut).toHaveBeenLastCalledWith(false);
  });
});
