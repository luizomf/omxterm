// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createSettingsView as createSettingsDialog,
  describeSettingsResult,
} from "../../src/renderer/settings/settings-dialog";
import type {
  SettingsBridge,
  SettingsResult,
  SettingsSnapshot,
} from "../../src/shared/settings";

import {
  base,
  button,
  deferred,
  installSettingsDom,
  open,
  saved,
} from "../fixtures/settings-dialog-dom";

beforeAll(installSettingsDom);

it("edits shared panel placement on the Window page with live feedback", async () => {
  const view = await open();
  view.query<HTMLButtonElement>("#settings-tab-window").click();
  const choice = view.field("Auxiliary panel side");
  expect(choice.value).toBe("right");
  expect([...choice.options].map((option) => option.textContent)).toEqual([
    "Left",
    "Right",
  ]);
  choice.value = "left";
  choice.dispatchEvent(new Event("change"));
  await view.settle();
  expect(view.bridge.change).toHaveBeenCalledWith({
    path: "window.auxiliaryPanelSide",
    value: "left",
  });
  expect(choice.value).toBe("left");
  expect(view.status()).not.toContain("new windows");
});

afterEach(() => {
  document.body.replaceChildren();
});

it("keeps typing after raw submission and saves the newer draft from the submitted base", async () => {
  const pending = deferred<SettingsResult>();
  const view = await open({ saveText: vi.fn(() => pending.promise) });
  const editor = view.query<HTMLTextAreaElement>("textarea");
  const submitted = '{"version":1,"logLevel":"debug"}';
  const newer = '{"version":1,"logLevel":"error"}';
  editor.value = submitted;
  editor.dispatchEvent(new Event("input"));
  button("Save").click();
  button("Save").click();
  editor.value = newer;
  editor.dispatchEvent(new Event("input"));
  pending.resolve(saved({ ...base, text: submitted, revision: "r2" }));
  await view.settle();
  expect(editor.value).toBe(newer);
  expect(
    view.query(".settings-config-file [role=status]").textContent,
  ).toContain("Newer edits are not saved.");
  expect(view.bridge.saveText).toHaveBeenCalledOnce();
  button("Save").click();
  expect(view.bridge.saveText).toHaveBeenLastCalledWith(newer, "r2");
});

it("keeps the raw draft until Reload File completes and retains typing during that read", async () => {
  const pending = deferred<SettingsSnapshot>();
  const view = await open({
    snapshot: vi
      .fn()
      .mockResolvedValueOnce(base)
      .mockReturnValue(pending.promise),
  });
  const editor = view.query<HTMLTextAreaElement>("textarea");
  editor.value = "draft A";
  editor.dispatchEvent(new Event("input"));
  button("Reload File").click();
  view.field("Font size").value = "18";
  view.field("Font size").dispatchEvent(new Event("change"));
  await view.settle();
  expect(editor.value).toBe("draft A");
  expect(button("Save").disabled).toBe(true);
  editor.value = "draft B";
  editor.dispatchEvent(new Event("input"));
  pending.resolve({ ...base, revision: "external", text: "external bytes" });
  await view.settle();
  expect(editor.value).toBe("draft B");
  button("Save").click();
  expect(view.bridge.saveText).toHaveBeenLastCalledWith("draft B", "r1");
});

it.each(["saved", "rejected", "transport"])(
  "preserves same-field and unrelated typing after an older graphical %s result",
  async (outcome) => {
    const pending = deferred<SettingsResult>();
    const view = await open({ change: vi.fn(() => pending.promise) });
    const size = view.field("Font size");
    size.value = "18";
    size.dispatchEvent(new Event("change"));
    await view.settle();
    const family = view.field("Font family");
    family.value = "Typing another font";
    family.dispatchEvent(new Event("input"));
    size.value = "19";
    size.dispatchEvent(new Event("input"));
    if (outcome === "transport") pending.reject(new Error("transport"));
    else
      pending.resolve(
        outcome === "saved"
          ? saved({ ...base, values: { ...base.values, "font.size": 18 } })
          : { status: "rejected", snapshot: base, message: "invalid font" },
      );
    await view.settle();
    expect(family.value).toBe("Typing another font");
    expect(size.value).toBe("19");
  },
);

it.each(["saved", "rejected", "transport"])(
  "shows pending feedback after the earlier queued change is %s",
  async (outcome) => {
    const first = deferred<SettingsResult>();
    const second = deferred<SettingsResult>();
    const view = await open({
      change: vi
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise),
    });
    view.field("Font size").value = "18";
    view.field("Font size").dispatchEvent(new Event("change"));
    view.field("Font family").value = "Installed Mono";
    view.field("Font family").dispatchEvent(new Event("change"));
    await view.settle();
    if (outcome === "transport") first.reject(new Error("transport"));
    else
      first.resolve(
        outcome === "saved"
          ? saved(base)
          : { status: "rejected", snapshot: base, message: "invalid" },
      );
    await view.settle();
    expect(view.bridge.change).toHaveBeenCalledTimes(2);
    expect(view.status()).toContain("Saving…");
    expect(view.status()).not.toContain("Saved.");
    expect(view.field("Font family").value).toBe("Installed Mono");
    second.resolve(
      saved({
        ...base,
        values: { ...base.values, "font.family": "Installed Mono" },
      }),
    );
    await view.settle();
    expect(view.status()).toBe("Saved.");
  },
);

it.each([
  ["Font family", "Installed Mono", "font.family", "Installed Mono"],
  ["Font size", "20", "font.size", 20],
] as const)(
  "commits application Paste in %s without saving raw keystrokes",
  async (label, pasted, path, value) => {
    const view = await open();
    const field = view.field(label);
    field.focus();
    if (label === "Font family") field.select();
    view.dialog.editClipboard("paste", {
      readText: async () => pasted,
      writeText: async () => {},
    });
    await view.settle();
    expect(view.bridge.change).toHaveBeenCalledExactlyOnceWith({ path, value });
    const editor = view.query<HTMLTextAreaElement>("textarea");
    editor.focus();
    view.dialog.editClipboard("paste", {
      readText: async () => "raw draft",
      writeText: async () => {},
    });
    await view.settle();
    expect(editor.value).toContain("raw draft");
    expect(view.bridge.saveText).not.toHaveBeenCalled();
    expect(view.bridge.change).toHaveBeenCalledOnce();
  },
);

it("ignores a clipboard read after the focused field's draft or selection changes", async () => {
  const pending = deferred<string>();
  const view = await open();
  const family = view.field("Font family");
  family.focus();
  view.dialog.editClipboard("paste", {
    readText: () => pending.promise,
    writeText: async () => {},
  });
  family.value = "New typing";
  family.dispatchEvent(new Event("input"));
  pending.resolve("stale clipboard");
  await view.settle();
  expect(family.value).toBe("New typing");
  expect(view.bridge.change).not.toHaveBeenCalled();
});

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
      "Window",
      "Shortcuts",
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
      ),
    ).toEqual({
      text: "Saved to config.json, but it could not be applied: reload failed",
      error: true,
      severity: "error",
    });
    expect(describeSettingsResult(saved(base))).toEqual({
      text: "Saved.",
      error: false,
      severity: "success",
    });
  });

  it("shows application warnings and deferrals for raw saves", () => {
    expect(
      describeSettingsResult(
        saved(base, {
          applied: true,
          notices: [
            "Restart OMXTerm for existing fonts.",
            "A shortcut shadows terminal input.",
          ],
        }),
      ),
    ).toEqual({
      text: "Saved. Restart OMXTerm for existing fonts. A shortcut shadows terminal input.",
      error: false,
      severity: "warning",
    });
  });

  it("describes raw deferred lifetimes without treating a no-op as deferred", () => {
    expect(
      describeSettingsResult({
        ...saved(base),
        lifetimes: ["new-tabs", "new-windows", "restart"],
      }).text,
    ).toBe(
      "Saved. New tabs use it. It applies to new windows. New tabs use it; restart OMXTerm to apply it to open tabs.",
    );
    expect(describeSettingsResult(saved(base)).text).toBe("Saved.");
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
      changeKeybind: vi.fn(),
      captureShortcut: vi.fn(() => () => {}),
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
