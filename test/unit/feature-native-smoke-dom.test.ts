// @vitest-environment jsdom
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { DEFAULT_USER_CONFIGURATION } from "../../src/main/user-configuration";
import { terminalWindowOptions } from "../../src/main/terminal-window";
import { createTabsHarness } from "../fixtures/terminal-tabs-harness";
import { installSettingsDom, open } from "../fixtures/settings-dialog-dom";
import {
  FEATURE_SMOKE_SPLIT_SCRIPT,
  FEATURE_SMOKE_SPLIT_EXPECTED,
} from "../fixtures/feature-native-smoke-contract";

beforeAll(installSettingsDom);
afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

// Electron returns this plain snapshot into main's realm. JSDOM's eval uses
// another realm, so round-trip only the primitive snapshot before Node assert.
function assertNativeSplitOracle() {
  const result: unknown = window.eval(FEATURE_SMOKE_SPLIT_SCRIPT);
  const serialized = JSON.stringify(result);
  if (typeof serialized !== "string") throw new Error("Missing DOM snapshot");
  assert.deepEqual(
    JSON.parse(serialized) as unknown,
    FEATURE_SMOKE_SPLIT_EXPECTED,
  );
}

it("accepts the native smoke's one-tab/two-pane oracle with the actual auto-hidden production strip", async () => {
  const html = new DOMParser().parseFromString(
    await readFile("src/renderer/index.html", "utf8"),
    "text/html",
  );
  const native = terminalWindowOptions(
    "/synthetic/preload.cjs",
    DEFAULT_USER_CONFIGURATION,
    process.platform,
  );
  expect(DEFAULT_USER_CONFIGURATION.showTabBar).toBe(true);
  const h = createTabsHarness({
    tabSize: { width: native.width!, height: native.height! },
    tabsOptions: { showTabBar: DEFAULT_USER_CONFIGURATION.showTabBar },
  });
  h.strip.id = html.querySelector("#tab-strip")!.id;
  h.container.id = html.querySelector("#terminal-tabs")!.id;
  try {
    await h.tabs.ready;
    // One pane is not enough, even though its strip is already hidden/empty.
    expect(assertNativeSplitOracle).toThrow();
    h.sessionAdapters[0]!.resize({ cols: 120, rows: 40 });
    h.tabs.handleCommand({ action: "split", direction: "right" });
    await vi.waitFor(() => expect(h.surfaces).toHaveLength(2));
    expect(h.container.querySelectorAll(".terminal-tab")).toHaveLength(1);
    expect(h.container.querySelectorAll(".terminal-surface")).toHaveLength(2);
    expect(h.adapters.map((adapter) => adapter.sessionId())).toEqual([
      "s1",
      "s2",
    ]);
    for (const adapter of h.adapters)
      expect(adapter.start).toHaveBeenCalledOnce();
    expect(h.notifySelection).toHaveBeenLastCalledWith("s2", ["s1", "s2"]);
    expect(h.strip.hidden).toBe(true);
    expect(h.strip.querySelectorAll('[role="tab"]')).toHaveLength(0);
    assertNativeSplitOracle();
    // Negative control: a visible strip must not masquerade as this contract.
    h.strip.hidden = false;
    expect(assertNativeSplitOracle).toThrow();
  } finally {
    h.tabs.dispose();
  }
});

it("matches the smoke's actual Settings selectors and hidden-control change path without replacing the dialog", async () => {
  const view = await open();
  try {
    const rawTab = view.query<HTMLButtonElement>("#settings-tab-config-file");
    rawTab.click();
    const editor = view.query<HTMLTextAreaElement>(
      ".settings-config-file textarea",
    );
    const dialog = view.query(".settings-dialog");
    const selector = [
      ...document.querySelectorAll<HTMLSelectElement>(
        ".settings-dialog select",
      ),
    ].find((select) =>
      [...select.options].some((option) => option.value === "pt-BR"),
    )!;
    expect(selector.value).toBe(DEFAULT_USER_CONFIGURATION.language);
    expect(selector.closest<HTMLElement>('[role="tabpanel"]')!.hidden).toBe(
      true,
    );
    expect(view.query("#settings-title").textContent).toBe("Settings");
    expect(view.query(".settings-config-file button").textContent).toBe("Save");
    editor.value = "Synthetic dirty raw draft";
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    editor.focus();
    editor.setSelectionRange(3, 12, "backward");
    selector.value = "pt-BR";
    selector.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() =>
      expect(view.bridge.change).toHaveBeenCalledExactlyOnceWith({
        path: "language",
        value: "pt-BR",
      }),
    );
    expect(view.query(".settings-dialog")).toBe(dialog);
    expect(view.query(".settings-config-file textarea")).toBe(editor);
    expect(editor.value).toBe("Synthetic dirty raw draft");
    expect([
      editor.selectionStart,
      editor.selectionEnd,
      editor.selectionDirection,
    ]).toEqual([3, 12, "backward"]);
    expect(document.activeElement).toBe(editor);
    expect(rawTab.getAttribute("aria-selected")).toBe("true");
  } finally {
    view.dialog.dispose();
  }
});
