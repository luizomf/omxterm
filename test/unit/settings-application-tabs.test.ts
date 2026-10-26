// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  createTabsHarness,
  selectedStates,
  dragTabTo,
} from "../fixtures/terminal-tabs-harness";
import { base, deferred, saved } from "../fixtures/settings-dialog-dom";
import type { SettingsBridge, SettingsResult } from "../../src/shared/settings";

const owners: { dispose(): void }[] = [];
afterEach(() => {
  for (const owner of owners.splice(0)) owner.dispose();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});
function settings(overrides: Partial<SettingsBridge> = {}): SettingsBridge {
  return {
    snapshot: vi.fn(async () => base),
    change: vi.fn(async () => saved(base)),
    saveText: vi.fn(async () => saved(base)),
    changeKeybind: vi.fn(),
    captureShortcut: vi.fn(() => () => {}),
    onOpen: () => () => {},
    ...overrides,
  };
}

it("retains one graphical editor in the shared literal order without allocating a terminal", async () => {
  const bridge = settings();
  const h = createTabsHarness({ tabsOptions: { settings: bridge } });
  owners.push(h.tabs);
  await h.tabs.ready;
  h.tabs.openSettings();
  await vi.waitFor(() =>
    expect(document.querySelector("textarea")).not.toBeNull(),
  );
  const editor = document.querySelector("textarea")!;
  document
    .querySelector<HTMLButtonElement>("#settings-tab-config-file")!
    .click();
  editor.value = "synthetic draft";
  editor.dispatchEvent(new Event("input"));
  editor.focus();
  editor.setSelectionRange(3, 8);
  h.tabs.openSettings();
  expect(document.activeElement).toBe(editor);
  expect(editor.selectionStart).toBe(3);
  expect(h.createAdapter).toHaveBeenCalledOnce();
  h.tabs.handleCommand({ action: "new" });
  await vi.waitFor(() => expect(h.surfaces).toHaveLength(2));
  expect(selectedStates(h.strip)).toEqual([
    "1:false",
    "Settings:false",
    "3:true",
  ]);
  dragTabTo(h.strip, 1, 400);
  expect(selectedStates(h.strip)).toEqual([
    "1:false",
    "2:true",
    "Settings:false",
  ]);
  h.tabs.handleCommand({ action: "next" });
  expect(document.querySelector("textarea")).toBe(editor);
  expect(editor.value).toBe("synthetic draft");
  expect(document.activeElement).toBe(editor);
  expect(bridge.snapshot).toHaveBeenCalledOnce();
  h.tabs.handleCommand({ action: "close" });
  expect(document.querySelector("textarea")).toBeNull();
  h.tabs.openSettings();
  await vi.waitFor(() => expect(bridge.snapshot).toHaveBeenCalledTimes(2));
  expect(document.querySelector("textarea")).not.toBe(editor);
});

it.each(["menu", "pointer"] as const)(
  "restores the latest Settings field after pointer-focus-before-click and %s return",
  async (returnBy) => {
    const bridge = settings();
    const h = createTabsHarness({ tabsOptions: { settings: bridge } });
    owners.push(h.tabs);
    await h.tabs.ready;
    h.tabs.openSettings();
    await vi.waitFor(() =>
      expect(document.querySelector("textarea")).not.toBeNull(),
    );
    document
      .querySelector<HTMLButtonElement>("#settings-tab-appearance")!
      .click();
    document.querySelector<HTMLInputElement>(".settings-text input")!.focus();
    h.tabs.handleCommand({ action: "previous" });
    h.tabs.openSettings();
    document
      .querySelector<HTMLButtonElement>("#settings-tab-config-file")!
      .click();
    const editor = document.querySelector("textarea")!;
    const panels = document.querySelector<HTMLElement>(".settings-panels")!;
    const navigation = document.querySelector<HTMLElement>(".settings-tabs")!;
    editor.value = "synthetic retained draft\n".repeat(40);
    editor.dispatchEvent(new Event("input"));
    editor.focus();
    editor.setSelectionRange(2, 15, "backward");
    editor.scrollTop = 72;
    panels.scrollTop = 36;
    navigation.scrollTop = 24;
    const clipboard = deferred<string>();
    h.tabs.editSettingsClipboard("paste", {
      readText: () => clipboard.promise,
      writeText: async () => {},
      confirmPaste: async () => true,
      requestContextMenu() {},
    });
    const terminal = h.strip.querySelector<HTMLButtonElement>("button")!;
    terminal.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    terminal.focus(); // Browser pointer focus precedes the strip's click handler.
    terminal.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    terminal.click();
    if (returnBy === "menu") h.tabs.openSettings();
    else {
      const tab = [...h.strip.querySelectorAll("button")].find(
        (button) => button.textContent === "Settings",
      )!;
      tab.focus();
      tab.click();
    }
    expect(document.activeElement).toBe(editor);
    clipboard.resolve("obsolete clipboard");
    await Promise.resolve();
    await Promise.resolve();
    expect(document.querySelector("textarea")).toBe(editor);
    expect(editor.value).toBe("synthetic retained draft\n".repeat(40));
    expect([
      editor.selectionStart,
      editor.selectionEnd,
      editor.selectionDirection,
    ]).toEqual([2, 15, "backward"]);
    expect([editor.scrollTop, panels.scrollTop, navigation.scrollTop]).toEqual([
      72, 36, 24,
    ]);
    expect(bridge.snapshot).toHaveBeenCalledOnce();
    expect(bridge.saveText).not.toHaveBeenCalled();
  },
);

it("settles hidden saves but rejects paste after leave-and-return, overlay and focus loss", async () => {
  const result = deferred<SettingsResult>();
  const bridge = settings({ change: () => result.promise });
  const h = createTabsHarness({ tabsOptions: { settings: bridge } });
  owners.push(h.tabs);
  await h.tabs.ready;
  h.tabs.openSettings();
  await vi.waitFor(() =>
    expect(document.querySelector("textarea")).not.toBeNull(),
  );
  document
    .querySelector<HTMLButtonElement>("#settings-tab-appearance")!
    .click();
  const field = document.querySelector<HTMLInputElement>(
    ".settings-text input",
  )!;
  field.value = "Saved family";
  field.dispatchEvent(new Event("change"));
  field.focus();
  for (const departure of ["tab", "overlay", "field", "window"] as const) {
    const clipboard = deferred<string>();
    h.tabs.editSettingsClipboard("paste", {
      readText: () => clipboard.promise,
      writeText: async () => {},
      confirmPaste: async () => true,
      requestContextMenu() {},
    });
    if (departure === "tab") {
      h.tabs.handleCommand({ action: "previous" });
      h.tabs.openSettings();
    } else if (departure === "overlay") {
      h.tabs.setBlocked(true);
      h.tabs.setBlocked(false);
    } else if (departure === "field") {
      document.querySelector<HTMLButtonElement>(".settings-close")!.focus();
    } else window.dispatchEvent(new Event("blur"));
    field.focus();
    clipboard.resolve("stale");
    await Promise.resolve();
    await Promise.resolve();
    expect(field.value).toBe("Saved family");
  }
  h.tabs.handleCommand({ action: "previous" });
  result.resolve(
    saved({
      ...base,
      values: { ...base.values, "font.family": "Saved family" },
    }),
  );
  await vi.waitFor(() =>
    expect(document.querySelector(".settings-status")!.textContent).toBe(
      "Saved.",
    ),
  );
  expect(h.surfaces[0]!.paste).not.toHaveBeenCalled();
  h.tabs.openSettings();
  expect(field.value).toBe("Saved family");
});

it.each(["ordinary", "acknowledged-failure"] as const)(
  "keeps Settings after %s terminal exit and commits only final application-tab closure",
  async (kind) => {
    const empty = vi.fn();
    const h = createTabsHarness({
      tabsOptions: { settings: settings(), notifyEmpty: empty },
    });
    owners.push(h.tabs);
    await h.tabs.ready;
    h.tabs.openSettings();
    h.adapters[0]!.handlers!.onExit({
      exitCode: 0,
      signal: kind === "ordinary" ? 0 : 9,
    });
    expect(empty).not.toHaveBeenCalled();
    if (kind !== "ordinary") {
      expect(h.container.children).toHaveLength(2);
      h.tabs.handleCommand({ action: "close-session", sessionId: "s1" });
    }
    expect(h.strip.hidden).toBe(true);
    expect(h.createAdapter).toHaveBeenCalledOnce();
    h.tabs.handleCommand({ action: "close" });
    expect(empty).toHaveBeenCalledOnce();
    h.tabs.openSettings();
    h.tabs.handleCommand({ action: "new" });
    expect(h.container.children).toHaveLength(0);
    expect(h.createAdapter).toHaveBeenCalledOnce();
  },
);

it("closes a captured terminal target after Settings selection without closing the editor", async () => {
  const h = createTabsHarness({ tabsOptions: { settings: settings() } });
  owners.push(h.tabs);
  await h.tabs.ready;
  h.tabs.handleCommand({ action: "prepare-close" });
  h.tabs.openSettings();
  h.tabs.handleCommand({ action: "resolve-close", confirmed: true });
  expect(h.surfaces[0]!.dispose).toHaveBeenCalledOnce();
  expect(h.tabs.isSettingsSelected()).toBe(true);
  expect(h.container.children).toHaveLength(1);
});

it.each(["success", "failure"] as const)(
  "preserves Settings across the first pending mount's %s without false emptiness or focus",
  async (outcome) => {
    const pending = deferred<void>();
    const empty = vi.fn();
    const h = createTabsHarness({
      beforeStart: () => pending.promise,
      tabsOptions: { settings: settings(), notifyEmpty: empty },
    });
    owners.push(h.tabs);
    const ready = h.tabs.ready.then(
      () => "ready",
      () => "failed",
    );
    h.tabs.openSettings();
    await vi.waitFor(() =>
      expect(document.querySelector("textarea")).not.toBeNull(),
    );
    const focus = document.activeElement;
    if (outcome === "failure")
      pending.reject(new Error("synthetic rendering failure"));
    else pending.resolve();
    expect(await ready).toBe(outcome === "failure" ? "failed" : "ready");
    expect(h.tabs.isSettingsSelected()).toBe(true);
    expect(document.activeElement).toBe(focus);
    expect(empty).not.toHaveBeenCalled();
    for (const surface of h.surfaces)
      expect(surface.focus).not.toHaveBeenCalled();
  },
);

it("keeps a disabled strip hidden, isolates terminal actions, and owns Close Enter through release", async () => {
  const h = createTabsHarness({
    tabsOptions: { settings: settings(), showTabBar: false },
  });
  owners.push(h.tabs);
  await h.tabs.ready;
  h.tabs.openSettings();
  await vi.waitFor(() =>
    expect(document.querySelector("textarea")).not.toBeNull(),
  );
  expect(h.strip.hidden).toBe(true);
  h.tabs.zoom("in");
  h.tabs.find();
  h.tabs.injectText("not terminal input");
  h.tabs.handleCommand({ action: "split", direction: "right" });
  expect(h.createAdapter).toHaveBeenCalledOnce();
  expect(h.surfaces[0]!.zoom).not.toHaveBeenCalled();
  expect(h.surfaces[0]!.inject).not.toHaveBeenCalled();
  expect(h.tabs.captureSnippetTarget()).toBeUndefined();
  const close = document.querySelector<HTMLButtonElement>(".settings-close")!;
  close.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      bubbles: true,
    }),
  );
  expect(h.tabs.isSettingsSelected()).toBe(true);
  close.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      bubbles: true,
    }),
  );
  close.click();
  for (const type of ["keydown", "keyup"]) {
    const event = new KeyboardEvent(type, {
      key: "Enter",
      code: "Enter",
      repeat: type === "keydown",
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  }
  const fresh = new KeyboardEvent("keydown", {
    key: "Enter",
    code: "Enter",
    bubbles: true,
    cancelable: true,
  });
  document.body.dispatchEvent(fresh);
  expect(fresh.defaultPrevented).toBe(false);
});

it.each(["tab", "overlay"] as const)(
  "settles Settings loading without taking focus after %s departure",
  async (departure) => {
    const loading = deferred<typeof base>();
    const h = createTabsHarness({
      tabsOptions: { settings: settings({ snapshot: () => loading.promise }) },
    });
    owners.push(h.tabs);
    await h.tabs.ready;
    h.tabs.openSettings();
    if (departure === "tab") h.tabs.handleCommand({ action: "previous" });
    else h.tabs.setBlocked(true);
    const focused = document.activeElement;
    loading.resolve(base);
    await vi.waitFor(() =>
      expect(document.querySelector("textarea")).not.toBeNull(),
    );
    expect(document.activeElement).toBe(focused);
    if (departure === "tab")
      expect(document.querySelector<HTMLElement>(".settings-tab")!.hidden).toBe(
        true,
      );
  },
);

it.each(["tab", "overlay", "close"] as const)(
  "stops unfocused recording on %s and refuses its delayed result",
  async (departure) => {
    const release = vi.fn();
    let captured!: Parameters<SettingsBridge["captureShortcut"]>[0];
    const changeKeybind = vi.fn();
    const bridge = settings({
      changeKeybind,
      captureShortcut: vi.fn<SettingsBridge["captureShortcut"]>((listener) => {
        captured = listener;
        return release;
      }),
    });
    const h = createTabsHarness({ tabsOptions: { settings: bridge } });
    owners.push(h.tabs);
    await h.tabs.ready;
    h.tabs.openSettings();
    await vi.waitFor(() =>
      expect(document.querySelector("#settings-tab-shortcuts")).not.toBeNull(),
    );
    document
      .querySelector<HTMLButtonElement>("#settings-tab-shortcuts")!
      .click();
    const record = document.querySelector<HTMLButtonElement>(
      '[data-action="find"] .settings-shortcut-record',
    )!;
    record.click();
    expect(document.activeElement).not.toBe(record);
    expect(document.querySelector(".settings-status")!.textContent).toBe(
      "Press the new shortcut, or Escape to cancel.",
    );
    if (departure === "tab") h.tabs.handleCommand({ action: "previous" });
    else if (departure === "overlay") h.tabs.setBlocked(true);
    else h.tabs.handleCommand({ action: "close" });
    expect(release).toHaveBeenCalledOnce();
    captured({ accelerator: "F2" });
    expect(changeKeybind).not.toHaveBeenCalled();
    if (departure !== "close") {
      expect(document.querySelector(".settings-status")!.textContent).toBe(
        "Recording cancelled.",
      );
      expect(record.textContent).toBe("Record");
      const focused = document.activeElement;
      record.click();
      expect(document.activeElement).toBe(focused);
      expect(bridge.captureShortcut).toHaveBeenCalledOnce();
      if (departure === "tab") h.tabs.openSettings();
      else h.tabs.setBlocked(false);
      captured({ accelerator: "F3" });
      expect(changeKeybind).not.toHaveBeenCalled();
      expect(document.querySelector(".settings-status")!.textContent).toBe(
        "Recording cancelled.",
      );
    }
  },
);
