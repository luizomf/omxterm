// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createTabsHarness } from "../fixtures/terminal-tabs-harness";
import { base, deferred, saved } from "../fixtures/settings-dialog-dom";
import type {
  SettingsBridge,
  SettingsSnapshot,
} from "../../src/shared/settings";
import type { ExtensionsBridge } from "../../src/shared/extensions";
import { createSettingsView } from "../../src/renderer/settings/settings-dialog";
import { createRendererLanguage } from "../../src/renderer/renderer-language";

const destination = { page: "extensions", reason: "snippets" } as const;
const owners: { dispose(): void }[] = [];
afterEach(() => {
  for (const owner of owners.splice(0)) owner.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});
function settings(
  snapshot: SettingsBridge["snapshot"] = async () => base,
): SettingsBridge {
  return {
    snapshot: vi.fn(snapshot),
    change: vi.fn(async () => saved(base)),
    saveText: vi.fn(async () => saved(base)),
    changeKeybind: vi.fn(),
    captureShortcut: vi.fn(() => () => {}),
    onOpen: () => () => {},
  };
}
function extensions() {
  const request = vi.fn<ExtensionsBridge["request"]>(async () => ({
    ok: false,
    error: "runtime-unavailable",
  }));
  vi.stubGlobal("omxterm", { extensions: { request } });
  return request;
}
const activePage = () =>
  document.querySelector('.settings-tabs [aria-selected="true"]')?.id;

it("navigates a retained Settings tab and preserves its page on ordinary reopen", async () => {
  const request = extensions();
  const bridge = settings();
  const h = createTabsHarness({ tabsOptions: { settings: bridge } });
  owners.push(h.tabs);
  await h.tabs.ready;
  h.tabs.openSettings();
  await vi.waitFor(() =>
    expect(document.querySelector("#settings-tab-extensions")).not.toBeNull(),
  );
  document
    .querySelector<HTMLButtonElement>("#settings-tab-config-file")!
    .click();
  const editor = document.querySelector("textarea")!;
  editor.value = "retained draft";
  h.tabs.handleCommand({ action: "previous" });
  h.tabs.openSettings(destination);
  expect(activePage()).toBe("settings-tab-extensions");
  expect(document.activeElement?.id).toBe("settings-tab-extensions");
  expect(document.querySelector("textarea")).toBe(editor);
  expect(editor.value).toBe("retained draft");
  document
    .querySelector<HTMLButtonElement>("#settings-tab-config-file")!
    .click();
  h.tabs.handleCommand({ action: "previous" });
  h.tabs.openSettings();
  expect(activePage()).toBe("settings-tab-config-file");
  expect(bridge.snapshot).toHaveBeenCalledOnce();
  expect(request.mock.calls.map(([value]) => value.operation)).toEqual([
    "snapshot",
  ]);
});

it.each(["initial", "retained-loading"] as const)(
  "remembers an %s destination across delayed snapshot without stealing later focus",
  async (mode) => {
    extensions();
    const pending = deferred<SettingsSnapshot>();
    const h = createTabsHarness({
      tabsOptions: { settings: settings(() => pending.promise) },
    });
    owners.push(h.tabs);
    await h.tabs.ready;
    h.tabs.openSettings(mode === "initial" ? destination : undefined);
    if (mode === "retained-loading") h.tabs.openSettings(destination);
    const other = document.createElement("button");
    document.body.append(other);
    other.focus();
    pending.resolve(base);
    await vi.waitFor(() =>
      expect(activePage()).toBe("settings-tab-extensions"),
    );
    expect(document.activeElement).toBe(other);
    expect(
      document.querySelector<HTMLElement>(".settings-snippets-notice")!.hidden,
    ).toBe(false);
  },
);

it("keeps localized contextual guidance separate from runtime status without replaying requests", async () => {
  const request = extensions();
  const language = createRendererLanguage();
  const view = createSettingsView(document, settings(), { language });
  owners.push(view);
  await view.open(destination);
  const notice = document.querySelector<HTMLElement>(
    ".settings-snippets-notice",
  )!;
  expect(notice.textContent).toContain("optional extension");
  expect(notice.textContent).toContain("snippets.yaml");
  expect(document.querySelector(".extensions-panel")!.textContent).toContain(
    language.t("extensions.runtime-unavailable"),
  );
  const focused = document.activeElement;
  language.set("pt-BR");
  expect(document.querySelector(".settings-snippets-notice")).toBe(notice);
  expect(notice.textContent).toContain("extensão opcional");
  expect(document.activeElement).toBe(focused);
  document
    .querySelector<HTMLButtonElement>("#settings-tab-config-file")!
    .click();
  view.setBlocked(true);
  view.navigate(destination);
  expect(activePage()).toBe("settings-tab-config-file");
  expect(request.mock.calls.map(([value]) => value.operation)).toEqual([
    "snapshot",
  ]);
});
