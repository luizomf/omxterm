// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import {
  button,
  deferred,
  installSettingsDom,
  open,
} from "../fixtures/settings-dialog-dom";
import {
  DEFAULT_TERMINAL_THEME,
  TERMINAL_THEME_COLOR_KEYS,
} from "../../src/shared/terminal-theme";
import type { SettingsThemeDocumentsBridge } from "../../src/shared/settings-theme-documents";
import { createRendererLanguage } from "../../src/renderer/renderer-language";

beforeAll(installSettingsDom);
afterEach(() => document.body.replaceChildren());
function documents(): SettingsThemeDocumentsBridge {
  return {
    openTheme: vi.fn(),
    saveTheme: vi.fn(async () => ({
      status: "saved" as const,
      base: { path: "themes/my-theme.json", revision: "a".repeat(64) },
    })),
    importTheme: vi.fn(),
    exportTheme: vi.fn(),
  };
}
it("creates a complete draft, previews it locally and saves before explicit use", async () => {
  const docs = documents();
  const view = await open({ themeDocuments: docs });
  button("Appearance").click();
  const original = document.documentElement.style.cssText;
  button("New theme").click();
  const select = view.query<HTMLSelectElement>(".settings-theme-editor select");
  expect([...select.options].map((o) => o.value)).toEqual(
    TERMINAL_THEME_COLOR_KEYS,
  );
  const hex = view.query<HTMLInputElement>(".settings-theme-hex");
  select.value = "background";
  select.dispatchEvent(new Event("change"));
  hex.value = "#123456";
  hex.dispatchEvent(new Event("input"));
  expect(
    view.query<HTMLElement>(".settings-theme-specimen").style.backgroundColor,
  ).toBe("rgb(18, 52, 86)");
  expect(document.documentElement.style.cssText).toBe(original);
  expect(view.bridge.change).not.toHaveBeenCalled();
  button("Save copy").click();
  await view.settle();
  expect(docs.saveTheme).toHaveBeenCalledWith({
    theme: {
      ...DEFAULT_TERMINAL_THEME,
      name: "My theme",
      colors: { ...DEFAULT_TERMINAL_THEME.colors, background: "#123456" },
    },
    target: { newFilename: "my-theme.json" },
  });
  expect(view.bridge.change).not.toHaveBeenCalled();
  button("Use saved theme").click();
  await view.settle();
  expect(view.bridge.change).toHaveBeenCalledWith({
    path: "theme.path",
    value: "themes/my-theme.json",
  });
  view.dialog.dispose();
});

const ANSI_PAIRS = [
  ["black", "brightBlack"],
  ["red", "brightRed"],
  ["green", "brightGreen"],
  ["yellow", "brightYellow"],
  ["blue", "brightBlue"],
  ["magenta", "brightMagenta"],
  ["cyan", "brightCyan"],
  ["white", "brightWhite"],
] as const;
const css = (color: string) => {
  const probe = document.createElement("span");
  probe.style.color = color;
  return probe.style.color;
};
const swatch = (label: string) =>
  document.querySelector<HTMLButtonElement>(
    `.settings-theme-ansi button[aria-label="${label}"]`,
  )!;

it.each(["en-US", "pt-BR"] as const)(
  "shows each normal color next to its bright variant and edits the one picked in %s",
  async (locale) => {
    const language = createRendererLanguage(locale);
    const view = await open({ themeDocuments: documents() }, language);
    button(language.t("settings.page.appearance")).click();
    button(language.t("settings.author.new")).click();
    const role = view.query<HTMLSelectElement>(".settings-theme-editor select");
    const hex = view.query<HTMLInputElement>(".settings-theme-hex");
    for (const [normal, bright] of ANSI_PAIRS) {
      const first = swatch(language.t(`settings.author.color.${normal}`));
      const second = swatch(language.t(`settings.author.color.${bright}`));
      // Side by side in the same row, normal first.
      expect(first.nextElementSibling).toBe(second);
      expect(first.style.backgroundColor).toBe(
        css(DEFAULT_TERMINAL_THEME.colors[normal]),
      );
      expect(second.style.backgroundColor).toBe(
        css(DEFAULT_TERMINAL_THEME.colors[bright]),
      );
      second.click();
      expect(role.value).toBe(bright);
      expect(hex.value).toBe(DEFAULT_TERMINAL_THEME.colors[bright]);
      expect(second.getAttribute("aria-pressed")).toBe("true");
      expect(first.getAttribute("aria-pressed")).toBe("false");
    }
    view.dialog.dispose();
  },
);

it("updates exact sample contrast without recoloring names or replacing retained swatches", async () => {
  const docs = documents();
  const language = createRendererLanguage("en-US");
  const view = await open({ themeDocuments: docs }, language);
  button("Appearance").click();
  button("New theme").click();
  const original = document.documentElement.style.cssText;
  const role = view.query<HTMLSelectElement>(".settings-theme-editor select");
  const hex = view.query<HTMLInputElement>(".settings-theme-hex");
  const swatches = [
    ...document.querySelectorAll<HTMLElement>(".settings-theme-ansi button"),
  ];
  expect(swatches).toHaveLength(16);
  const change = (key: string, color: string) => {
    role.value = key;
    role.dispatchEvent(new Event("change"));
    hex.value = color;
    hex.dispatchEvent(new Event("input"));
  };
  // Deliberately invisible samples must remain honest, not contrast-corrected.
  for (const key of TERMINAL_THEME_COLOR_KEYS) change(key, "#123456");
  for (const element of swatches)
    expect(element.style.backgroundColor).toBe("rgb(18, 52, 86)");
  const specimen = view.query<HTMLElement>(".settings-theme-specimen");
  expect(specimen.style.backgroundColor).toBe("rgb(18, 52, 86)");
  expect(specimen.style.color).toBe("rgb(18, 52, 86)");
  const text = [
    ...specimen.querySelectorAll<HTMLElement>(".settings-theme-ansi-text span"),
  ];
  expect(text).toHaveLength(16);
  for (const span of text) expect(span.style.color).toBe("rgb(18, 52, 86)");
  for (const name of document.querySelectorAll<HTMLElement>(
    ".settings-theme-ansi-name",
  ))
    expect(name.style.cssText).toBe("");
  const selection = view.query<HTMLElement>(".settings-theme-selection");
  expect(selection.style.backgroundColor).toBe("rgb(18, 52, 86)");
  expect(selection.style.color).toBe("rgb(18, 52, 86)");
  expect(
    view.query<HTMLElement>(".settings-theme-cursor").style.backgroundColor,
  ).toBe("rgb(18, 52, 86)");
  change("brightWhite", "#12");
  language.set("pt-BR");
  expect([...document.querySelectorAll(".settings-theme-ansi button")]).toEqual(
    swatches,
  );
  expect(swatches.at(-1)!.getAttribute("aria-label")).toBe("Branco claro");
  expect(swatches.at(-1)!.style.backgroundColor).toBe("rgb(18, 52, 86)");
  expect(hex.value).toBe("#12");
  expect(view.bridge.change).not.toHaveBeenCalled();
  expect(docs.saveTheme).not.toHaveBeenCalled();
  expect(document.documentElement.style.cssText).toBe(original);
  view.dialog.dispose();
});

it("retains invalid input per role across categories and blocks saving last-valid colors", async () => {
  const docs = documents();
  const view = await open({ themeDocuments: docs });
  button("Appearance").click();
  button("New theme").click();
  const role = view.query<HTMLSelectElement>(".settings-theme-editor select");
  const hex = view.query<HTMLInputElement>(".settings-theme-hex");
  hex.value = "#12";
  hex.dispatchEvent(new Event("input"));
  role.value = "brightWhite";
  role.dispatchEvent(new Event("change"));
  expect(hex.value).toBe("#ffffff");
  expect(button("Save copy").disabled).toBe(true);
  expect(button("Export JSON…").disabled).toBe(true);
  button("General").click();
  view.dialog.setSelected(false);
  view.dialog.setSelected(true);
  button("Appearance").click();
  role.value = "background";
  role.dispatchEvent(new Event("change"));
  expect(hex.value).toBe("#12");
  expect(hex.getAttribute("aria-invalid")).toBe("true");
  expect(docs.saveTheme).not.toHaveBeenCalled();
  expect(view.bridge.change).not.toHaveBeenCalled();
  button("Cancel").click();
  expect(document.querySelector(".settings-theme-editor")).toBeNull();
  view.dialog.dispose();
});

it("preserves imported appearance and newer typing during Save, then saves to the copy revision", async () => {
  const docs = documents();
  const imported = {
    ...DEFAULT_TERMINAL_THEME,
    appearance: { paneDivider: null, activePaneHighlight: "#aBcDeF" },
  };
  vi.mocked(docs.importTheme).mockResolvedValue({
    status: "opened",
    theme: imported,
  });
  const saved =
    deferred<Awaited<ReturnType<SettingsThemeDocumentsBridge["saveTheme"]>>>();
  vi.mocked(docs.saveTheme).mockReturnValueOnce(saved.promise);
  const view = await open({ themeDocuments: docs });
  button("Appearance").click();
  button("Import theme JSON…").click();
  await view.settle();
  expect(button("Save").disabled).toBe(true);
  button("Save copy").click();
  const name = view.query<HTMLInputElement>(
    ".settings-theme-editor input[type=text]",
  );
  name.value = "Newer draft";
  name.dispatchEvent(new Event("input"));
  saved.resolve({
    status: "saved",
    base: { path: "themes/copied.json", revision: "b".repeat(64) },
  });
  await view.settle();
  expect(name.value).toBe("Newer draft");
  expect(view.query(".settings-theme-authoring").textContent).toContain(
    "Newer edits are not included.",
  );
  expect(button("Use saved theme").disabled).toBe(true);
  button("Save").click();
  await view.settle();
  expect(docs.saveTheme).toHaveBeenLastCalledWith({
    theme: { ...imported, name: "Newer draft" },
    target: { path: "themes/copied.json", revision: "b".repeat(64) },
  });
  expect(view.bridge.change).not.toHaveBeenCalled();
  view.dialog.dispose();
});

it("ignores a retired save result without reopening or replacing another draft", async () => {
  const docs = documents();
  const pending =
    deferred<Awaited<ReturnType<SettingsThemeDocumentsBridge["saveTheme"]>>>();
  vi.mocked(docs.saveTheme).mockReturnValueOnce(pending.promise);
  const view = await open({ themeDocuments: docs });
  button("Appearance").click();
  button("New theme").click();
  button("Save copy").click();
  button("Cancel").click();
  button("New theme").click();
  const name = view.query<HTMLInputElement>(
    ".settings-theme-editor input[type=text]",
  );
  name.value = "Replacement draft";
  name.dispatchEvent(new Event("input"));
  pending.resolve({
    status: "saved",
    base: { path: "themes/retired.json", revision: "c".repeat(64) },
  });
  await view.settle();
  expect(name.value).toBe("Replacement draft");
  expect(button("Save").disabled).toBe(true);
  expect(
    view.query(".settings-theme-editor .settings-path").textContent,
  ).not.toContain("retired");
  view.dialog.dispose();
});

it("edits every color without losing untouched optional fields or selecting a card", async () => {
  const docs = documents();
  const theme = {
    ...DEFAULT_TERMINAL_THEME,
    name: "Synthetic local",
    appearance: {},
  };
  const base = { path: "themes/local.json", revision: "d".repeat(64) };
  vi.mocked(docs.openTheme).mockResolvedValue({
    status: "opened",
    theme,
    base,
  });
  const view = await open({
    themeDocuments: docs,
    themes: vi.fn(async () => ({
      status: "ok" as const,
      themes: [{ path: base.path, name: theme.name, colors: theme.colors }],
      invalid: [],
      truncated: false,
      hasConfiguredTheme: false,
    })),
  });
  button("Appearance").click();
  await view.settle();
  const edit = [
    ...document.querySelectorAll<HTMLButtonElement>(
      ".settings-theme-entry button",
    ),
  ].find((b) => b.getAttribute("aria-label")?.includes("Synthetic local"))!;
  edit.click();
  await view.settle();
  expect(view.bridge.change).not.toHaveBeenCalled();
  const role = view.query<HTMLSelectElement>(".settings-theme-editor select");
  const hex = view.query<HTMLInputElement>(".settings-theme-hex");
  for (const key of TERMINAL_THEME_COLOR_KEYS) {
    role.value = key;
    role.dispatchEvent(new Event("change"));
    hex.value = "#aBcDeF";
    hex.dispatchEvent(new Event("input"));
  }
  button("Save").click();
  await view.settle();
  expect(docs.saveTheme).toHaveBeenCalledWith({
    theme: {
      ...theme,
      colors: Object.fromEntries(
        TERMINAL_THEME_COLOR_KEYS.map((key) => [key, "#aBcDeF"]),
      ),
    },
    target: base,
  });
  expect(view.bridge.change).not.toHaveBeenCalled();
  view.dialog.dispose();
});

it("keeps a conflicting local draft until explicit source reload", async () => {
  const docs = documents();
  vi.mocked(docs.importTheme).mockResolvedValue({
    status: "opened",
    theme: DEFAULT_TERMINAL_THEME,
  });
  const view = await open({ themeDocuments: docs });
  button("Appearance").click();
  button("Import theme JSON…").click();
  await view.settle();
  button("Save copy").click();
  await view.settle();
  vi.mocked(docs.saveTheme).mockResolvedValueOnce({
    status: "failed",
    reason: "conflict",
  });
  const hex = view.query<HTMLInputElement>(".settings-theme-hex");
  hex.value = "#112233";
  hex.dispatchEvent(new Event("input"));
  button("Save").click();
  await view.settle();
  expect(hex.value).toBe("#112233");
  expect(docs.openTheme).not.toHaveBeenCalled();
  expect(view.query(".settings-theme-authoring").textContent).toContain(
    "Nothing was overwritten.",
  );
  vi.mocked(docs.openTheme).mockResolvedValue({
    status: "opened",
    theme: DEFAULT_TERMINAL_THEME,
    base: { path: "themes/my-theme.json", revision: "e".repeat(64) },
  });
  button("Discard draft and reload source").click();
  await view.settle();
  expect(hex.value).toBe("#000000");
  expect(docs.openTheme).toHaveBeenCalledOnce();
  view.dialog.dispose();
});

it("explains new-name export before the chooser and keeps local dirty state on cancel or newer export", async () => {
  const docs = documents();
  vi.mocked(docs.exportTheme).mockResolvedValueOnce({ status: "cancelled" });
  const view = await open({ themeDocuments: docs });
  button("Appearance").click();
  button("New theme").click();
  const exportButton = button("Export JSON…");
  expect(
    document.getElementById(exportButton.getAttribute("aria-describedby")!)!
      .textContent,
  ).toContain("Choose a new filename");
  exportButton.click();
  await view.settle();
  expect(button("Save").disabled).toBe(true);
  expect(button("Use saved theme").disabled).toBe(true);
  const pending =
    deferred<
      Awaited<ReturnType<SettingsThemeDocumentsBridge["exportTheme"]>>
    >();
  vi.mocked(docs.exportTheme).mockReturnValueOnce(pending.promise);
  exportButton.click();
  const hex = view.query<HTMLInputElement>(".settings-theme-hex");
  hex.value = "#112233";
  hex.dispatchEvent(new Event("input"));
  pending.resolve({ status: "exported", warning: "cleanup" });
  await view.settle();
  expect(view.query(".settings-theme-authoring").textContent).toContain(
    "Newer edits are not included.",
  );
  expect(view.query(".settings-theme-authoring").textContent).toContain(
    "published successfully",
  );
  const notice = [
    ...view
      .query(".settings-theme-authoring")
      .querySelectorAll<HTMLElement>(".page-notice"),
  ].find((node) => node.textContent?.includes("published successfully"));
  expect(notice?.dataset.severity).toBe("warning");
  expect(button("Save").disabled).toBe(true);
  expect(view.bridge.change).not.toHaveBeenCalled();
  view.dialog.dispose();
});

it("relabels retained invalid inputs and caret without a read/save and reports bad filenames locally", async () => {
  const docs = documents();
  const language = createRendererLanguage("en-US");
  const view = await open({ themeDocuments: docs }, language);
  button("Appearance").click();
  button("New theme").click();
  const hex = view.query<HTMLInputElement>(".settings-theme-hex");
  hex.value = "#12";
  hex.dispatchEvent(new Event("input"));
  hex.focus();
  hex.setSelectionRange(1, 3);
  language.set("pt-BR");
  expect(view.query(".settings-theme-hex")).toBe(hex);
  expect(hex.value).toBe("#12");
  expect(document.activeElement).toBe(hex);
  expect([hex.selectionStart, hex.selectionEnd]).toEqual([1, 3]);
  expect(button("Salvar cópia").disabled).toBe(true);
  expect(docs.openTheme).not.toHaveBeenCalled();
  expect(docs.saveTheme).not.toHaveBeenCalled();
  language.set("en-US");
  hex.value = "#123456";
  hex.dispatchEvent(new Event("input"));
  view.query<HTMLInputElement>(".settings-theme-copy-fields input").value =
    "../bad.json";
  button("Save copy").click();
  await view.settle();
  expect(view.query(".settings-theme-authoring").textContent).toContain(
    "Invalid theme or filename.",
  );
  expect(docs.saveTheme).not.toHaveBeenCalled();
  view.dialog.dispose();
});

it.each(["edit", "radio", "outside"] as const)(
  "preserves %s focus when a cancelled editor's deferred Save refreshes changed cards",
  async (kind) => {
    const docs = documents();
    const base = { path: "themes/local.json", revision: "f".repeat(64) };
    const theme = { ...DEFAULT_TERMINAL_THEME, name: "Local before save" };
    const other = {
      path: "themes/other.json",
      name: "Other theme",
      colors: theme.colors,
    };
    let local = { path: base.path, name: theme.name, colors: theme.colors };
    let reordered = false;
    const themes = vi.fn(async () => ({
      status: "ok" as const,
      themes: reordered ? [local, other] : [other, local],
      invalid: [],
      truncated: false,
      hasConfiguredTheme: false,
    }));
    vi.mocked(docs.openTheme).mockResolvedValue({
      status: "opened",
      theme,
      base,
    });
    const pending =
      deferred<
        Awaited<ReturnType<SettingsThemeDocumentsBridge["saveTheme"]>>
      >();
    vi.mocked(docs.saveTheme).mockReturnValueOnce(pending.promise);
    const view = await open({ themeDocuments: docs, themes });
    try {
      button("Appearance").click();
      await view.settle();
      const localEntry = () =>
        [
          ...document.querySelectorAll<HTMLElement>(".settings-theme-entry"),
        ].find(
          (entry) =>
            entry.querySelector<HTMLInputElement>("input")!.value === base.path,
        )!;
      const original = localEntry();
      const edit = original.querySelector<HTMLButtonElement>("button")!;
      edit.click();
      await view.settle();
      button("Save").click();
      button("Cancel").click();
      expect(document.activeElement).toBe(edit);
      const outside = button("Refresh themes");
      if (kind === "radio")
        original.querySelector<HTMLInputElement>("input")!.focus();
      if (kind === "outside") outside.focus();
      local = { ...local, name: "Local after save" };
      reordered = true;
      pending.resolve({
        status: "saved",
        base: { ...base, revision: "a".repeat(64) },
      });
      await view.settle();
      expect(themes).toHaveBeenCalledTimes(2);
      expect(original.isConnected).toBe(false);
      const refreshed = localEntry();
      expect(refreshed.textContent).toContain("Local after save");
      expect(document.activeElement).toBe(
        kind === "outside"
          ? outside
          : refreshed.querySelector(kind === "edit" ? "button" : "input"),
      );
      expect(document.querySelector(".settings-theme-editor")).toBeNull();
      expect(view.bridge.change).not.toHaveBeenCalled();
    } finally {
      view.dialog.dispose();
    }
  },
);
