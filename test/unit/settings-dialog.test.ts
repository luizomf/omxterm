// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createSettingsDialog,
  describeSettingsResult,
} from "../../src/renderer/settings/settings-dialog";
import type {
  SettingsBridge,
  SettingsChange,
  SettingsResult,
  SettingsSnapshot,
} from "../../src/shared/settings";

const base: SettingsSnapshot = {
  configurationPath: "/synthetic/omxterm/config.json",
  platform: "linux",
  revision: "r1",
  text: '{\n  "version": 1\n}\n',
  values: {
    confirmClose: true,
    logLevel: "info",
    "font.family": "",
    "font.size": 16,
    "font.lineHeight": 1,
    "font.ligatures": true,
    "theme.path": "",
    "scrollback.lines": 10_000,
    "terminal.padding.top": 0,
    "terminal.padding.right": 8,
    "terminal.padding.bottom": 8,
    "terminal.padding.left": 8,
    "window.showTitleBar": true,
    "window.showTabBar": true,
    "window.alwaysOnTop": false,
  },
};

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});

afterEach(() => {
  document.body.replaceChildren();
});

function saved(
  snapshot: SettingsSnapshot,
  application: Extract<SettingsResult, { status: "saved" }>["application"] = {
    applied: true,
    notices: [],
  },
): SettingsResult {
  return { status: "saved", snapshot, application };
}

async function open(overrides: Partial<SettingsBridge> = {}) {
  const bridge: SettingsBridge = {
    snapshot: vi.fn(async () => base),
    change: vi.fn(async (change: SettingsChange) =>
      saved({
        ...base,
        values: { ...base.values, [change.path]: change.value as unknown },
      }),
    ),
    saveText: vi.fn(async () => saved({ ...base, revision: "r2" })),
    onOpen: () => () => {},
    ...overrides,
  };
  const focusTerminal = vi.fn();
  const onActivityChange = vi.fn();
  const dialog = createSettingsDialog(document, bridge, {
    focusTerminal,
    onActivityChange,
  });
  await dialog.open();
  const query = <Element extends HTMLElement>(selector: string) =>
    document.querySelector<Element>(selector)!;
  const field = (label: string) =>
    [...document.querySelectorAll("label")]
      .find((row) => row.textContent?.startsWith(label))!
      .querySelector<HTMLInputElement & HTMLSelectElement>("input, select")!;
  const status = () => query(".settings-status").textContent;
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  return {
    bridge,
    dialog,
    focusTerminal,
    onActivityChange,
    query,
    field,
    status,
    settle,
  };
}

describe("settings dialog", () => {
  it("opens with tabs reflecting the snapshot and returns focus on close", async () => {
    const view = await open();
    expect(view.onActivityChange).toHaveBeenLastCalledWith(true);
    const tabs = [...document.querySelectorAll('[role="tab"]')].map(
      (tab) => tab.textContent,
    );
    expect(tabs).toEqual([
      "General",
      "Appearance",
      "Terminal",
      "New Windows",
      "Config File",
    ]);
    expect(document.activeElement?.textContent).toBe("General");
    expect(view.field("Confirm before closing").checked).toBe(true);
    expect(view.field("Font size").value).toBe("16");
    expect(view.field("Font family").placeholder).toMatch(/FiraCode/u);
    // Platform-specific fields follow the main-reported platform.
    expect(document.body.textContent).not.toContain("Shell executable");
    expect(document.body.textContent).not.toContain("Option key");

    view.query<HTMLButtonElement>(".settings-close").click();
    expect(view.dialog.isActive()).toBe(false);
    expect(view.focusTerminal).toHaveBeenCalledOnce();
    expect(view.onActivityChange).toHaveBeenLastCalledWith(false);
  });

  it("moves between tabs with arrow keys", async () => {
    const view = await open();
    const first = document.activeElement as HTMLElement;
    first.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    expect(document.activeElement?.textContent).toBe("Appearance");
    expect(view.query("#settings-panel-appearance").hidden).toBe(false);
    expect(view.query("#settings-panel-general").hidden).toBe(true);
  });

  it("saves a changed control at once and says when it takes effect", async () => {
    const view = await open();
    const titleBar = view.field("Show title bar");
    titleBar.checked = false;
    titleBar.dispatchEvent(new Event("change"));
    expect(view.status()).toBe("Saving…");
    await view.settle();
    expect(view.bridge.change).toHaveBeenCalledExactlyOnceWith({
      path: "window.showTitleBar",
      value: false,
    });
    expect(view.status()).toBe("Saved. It applies to new windows.");

    const family = view.field("Font family");
    family.value = "  ";
    family.dispatchEvent(new Event("change"));
    await view.settle();
    expect(view.bridge.change).toHaveBeenLastCalledWith({
      path: "font.family",
      value: null,
    });
    expect(view.status()).toMatch(/restart OMXTerm/u);
  });

  it("keeps invalid numbers local and reverts a rejected change", async () => {
    const view = await open({
      change: vi.fn(async () => ({
        status: "rejected" as const,
        message: "font.family must exactly name an installed font family",
        snapshot: base,
      })),
    });
    const size = view.field("Font size");
    size.value = "4";
    size.dispatchEvent(new Event("change"));
    expect(view.bridge.change).not.toHaveBeenCalled();
    expect(size.value).toBe("16");

    const family = view.field("Font family");
    family.value = "Missing Font";
    family.dispatchEvent(new Event("change"));
    await view.settle();
    expect(view.status()).toMatch(/must exactly name an installed font/u);
    expect(view.query(".settings-status").classList.contains("error")).toBe(
      true,
    );
    expect(family.value).toBe("");
  });

  it("never reports a saved change as applied when application failed", () => {
    expect(
      describeSettingsResult(
        saved(base, { applied: false, notice: "reload failed" }),
        "font.size",
      ),
    ).toEqual({
      text: "Saved to config.json, but it could not be applied: reload failed",
      error: true,
    });
    expect(describeSettingsResult(saved(base), "font.size")).toEqual({
      text: "Saved.",
      error: false,
    });
  });

  it("keeps a dirty JSON draft across other changes and saves it explicitly", async () => {
    const view = await open({
      saveText: vi.fn(async () => ({
        status: "conflict" as const,
        message: "config.json changed since this draft was opened.",
        snapshot: { ...base, revision: "r3" },
      })),
    });
    const editor = view.query<HTMLTextAreaElement>("textarea");
    expect(editor.value).toBe(base.text);
    expect(view.query(".settings-path").textContent).toBe(
      base.configurationPath,
    );
    editor.value = '{ "version": 1, "logLevel": "debug" }';
    editor.dispatchEvent(new Event("input"));

    const ligatures = view.field("Programming ligatures");
    ligatures.checked = false;
    ligatures.dispatchEvent(new Event("change"));
    await view.settle();
    expect(editor.value).toBe('{ "version": 1, "logLevel": "debug" }');

    const save = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Save",
    )!;
    save.click();
    await view.settle();
    expect(view.bridge.saveText).toHaveBeenCalledExactlyOnceWith(
      '{ "version": 1, "logLevel": "debug" }',
      "r1",
    );
    expect(document.body.textContent).toContain("config.json changed");
    expect(editor.value).toBe('{ "version": 1, "logLevel": "debug" }');
  });

  it("edits the focused field with app Copy/Paste and ignores other targets", async () => {
    const view = await open();
    const clipboard = {
      readText: vi.fn(async () => "Installed\nMono"),
      writeText: vi.fn(async () => {}),
    };
    const family = view.field("Font family");
    family.focus();
    family.value = "Font";
    family.setSelectionRange(4, 4);
    view.dialog.editClipboard("paste", clipboard);
    await view.settle();
    // A single-line field drops the line break, as native paste does.
    expect(family.value).toBe("FontInstalledMono");
    view.dialog.editClipboard("select-all", clipboard);
    view.dialog.editClipboard("copy", clipboard);
    await view.settle();
    expect(clipboard.writeText).toHaveBeenCalledWith(family.value);

    view.query<HTMLButtonElement>(".settings-close").focus();
    clipboard.readText.mockClear();
    view.dialog.editClipboard("paste", clipboard);
    expect(clipboard.readText).not.toHaveBeenCalled();
  });

  it("ignores late snapshots after closing", async () => {
    let finish!: (value: SettingsSnapshot) => void;
    const bridge: SettingsBridge = {
      snapshot: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      change: vi.fn(),
      saveText: vi.fn(),
      onOpen: () => () => {},
    };
    const dialog = createSettingsDialog(document, bridge, {
      focusTerminal: vi.fn(),
      onActivityChange: vi.fn(),
    });
    const opening = dialog.open();
    expect(document.querySelector(".settings-status")?.textContent).toBe(
      "Loading settings…",
    );
    dialog.dispose();
    finish(base);
    await opening;
    expect(document.querySelector(".settings-dialog")).toBeNull();
  });
});
