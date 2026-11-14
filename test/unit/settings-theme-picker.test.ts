// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createRendererLanguage } from "../../src/renderer/renderer-language";
import type { SettingsThemesResult } from "../../src/shared/settings-themes";
import {
  base,
  button,
  deferred,
  installSettingsDom,
  open,
  saved,
} from "../fixtures/settings-dialog-dom";

beforeAll(installSettingsDom);
afterEach(() => document.body.replaceChildren());

const colors = {
  background: "#102030",
  foreground: "#fefefe",
  red: "#aa0000",
  green: "#00aa00",
  yellow: "#aaaa00",
  blue: "#0000aa",
  magenta: "#aa00aa",
  cyan: "#00aaaa",
};
const choices: SettingsThemesResult = {
  status: "ok",
  themes: [
    { path: "themes/a.json", name: "Shared name", colors },
    { path: "themes/b.json", name: "Shared name", colors },
  ],
  invalid: [
    {
      path: "themes/broken.json",
      reason: "invalid",
      detail: "Theme: is not valid JSON",
    },
  ],
  truncated: false,
  hasConfiguredTheme: true,
  selectedPath: "themes/b.json",
};
const input = (path: string) =>
  [
    ...document.querySelectorAll<HTMLInputElement>(".settings-themes input"),
  ].find((candidate) => candidate.value === path)!;

async function picker(result: SettingsThemesResult = choices) {
  const view = await open({
    themes: vi.fn(async () => result),
    snapshot: vi.fn(async () => ({
      ...base,
      values: {
        ...base.values,
        "theme.path": "/synthetic/omxterm/themes/b.json",
      },
    })),
  });
  view.query<HTMLButtonElement>("#settings-tab-appearance").click();
  await view.settle();
  return view;
}

describe("local theme picker", () => {
  it("shows identifiable palette cards, duplicate filenames and the configured selection without writing", async () => {
    const view = await picker();
    expect(view.bridge.change).not.toHaveBeenCalled();
    const cards = [...document.querySelectorAll(".settings-theme-card")];
    expect(cards).toHaveLength(3);
    expect(cards[1]!.textContent).toContain("Shared name");
    expect(cards[1]!.textContent).toContain("themes/a.json");
    expect(cards[2]!.textContent).toContain("themes/b.json");
    expect(input("themes/b.json").checked).toBe(true);
    expect(input("themes/a.json").checked).toBe(false);
    expect(input("themes/a.json").type).toBe("radio");
    expect(input("themes/a.json").name).toBe(input("themes/b.json").name);
    const preview = cards[1]!.querySelector<HTMLElement>(
      ".settings-theme-preview",
    )!;
    expect(preview.style.backgroundColor).toBe("rgb(16, 32, 48)");
    expect(preview.querySelectorAll(".settings-theme-dots span")).toHaveLength(
      6,
    );
    expect(view.query(".settings-themes-invalid").textContent).toContain(
      "themes/broken.json",
    );
    expect(button("Refresh themes").classList.contains("page-control")).toBe(
      true,
    );
    expect(view.query(".settings-themes-invalid").textContent).not.toContain(
      "These theme files couldn't be used",
    );
    expect(view.query(".settings-themes-message").textContent).toContain(
      "These theme files couldn't be used",
    );
    expect(view.field("Theme file").value).toContain("themes/b.json");
  });

  it("uses the existing change route and preserves saved-but-not-applied feedback", async () => {
    const next = { ...choices, selectedPath: "themes/a.json" };
    const themes = vi
      .fn()
      .mockResolvedValueOnce(choices)
      .mockResolvedValue(next);
    const view = await open({
      themes,
      snapshot: vi.fn(async () => ({
        ...base,
        values: { ...base.values, "theme.path": "themes/b.json" },
      })),
      change: vi.fn(async () =>
        saved(
          {
            ...base,
            values: { ...base.values, "theme.path": "themes/a.json" },
          },
          { applied: false, notice: "reload failed" },
        ),
      ),
    });
    await view.settle();
    input("themes/a.json").click();
    expect(view.bridge.change).toHaveBeenCalledExactlyOnceWith({
      path: "theme.path",
      value: "themes/a.json",
    });
    await view.settle();
    expect(view.status()).toContain(
      "Saved to config.json, but it couldn't be applied: reload failed",
    );
    expect(input("themes/a.json").checked).toBe(true);
    expect(themes).toHaveBeenCalledTimes(2);
  });

  it("restores the previous selection when validation rejects a choice", async () => {
    const view = await open({
      themes: vi.fn(async () => choices),
      snapshot: vi.fn(async () => ({
        ...base,
        values: { ...base.values, "theme.path": "themes/b.json" },
      })),
      change: vi.fn(async () => ({
        status: "rejected" as const,
        message: "theme file no longer exists",
        snapshot: {
          ...base,
          values: { ...base.values, "theme.path": "themes/b.json" },
        },
      })),
    });
    await view.settle();
    input("themes/a.json").click();
    await view.settle();
    expect(view.status()).toContain("theme file no longer exists");
    expect(input("themes/b.json").checked).toBe(true);
    expect(input("themes/a.json").checked).toBe(false);
  });

  it("keeps newer selection requests while earlier saves are pending", async () => {
    const first =
      deferred<import("../../src/shared/settings").SettingsResult>();
    const second =
      deferred<import("../../src/shared/settings").SettingsResult>();
    const view = await open({
      themes: vi.fn(async () => choices),
      snapshot: vi.fn(async () => ({
        ...base,
        values: { ...base.values, "theme.path": "themes/b.json" },
      })),
      change: vi
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise),
    });
    await view.settle();
    input("themes/a.json").click();
    expect(input("themes/a.json").checked).toBe(true);
    expect(input("themes/a.json").parentElement?.textContent).toContain(
      "Saving…",
    );
    input("themes/b.json").click();
    expect(view.bridge.change).toHaveBeenNthCalledWith(1, {
      path: "theme.path",
      value: "themes/a.json",
    });
    expect(view.bridge.change).toHaveBeenNthCalledWith(2, {
      path: "theme.path",
      value: "themes/b.json",
    });
    first.resolve(
      saved({
        ...base,
        values: { ...base.values, "theme.path": "themes/a.json" },
      }),
    );
    await view.settle();
    expect(input("themes/b.json").checked).toBe(true);
    second.resolve(
      saved({
        ...base,
        values: { ...base.values, "theme.path": "themes/b.json" },
      }),
    );
    await view.settle();
    expect(input("themes/b.json").checked).toBe(true);
  });

  it("brings the whole card into view when its radio gains focus", async () => {
    const view = await picker();
    const theme = input("themes/b.json");
    const card = theme.closest("label")!;
    card.scrollIntoView = vi.fn();
    theme.focus();
    expect(card.scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      inline: "nearest",
    });
    view.dialog.dispose();
  });

  it("does not paste into a focused theme radio or request a configuration write", async () => {
    const view = await picker();
    const theme = input("themes/b.json");
    const readText = vi.fn(async () => "clipboard content");
    theme.focus();
    view.dialog.editClipboard("paste", { readText, writeText: vi.fn() });
    await view.settle();
    expect(readText).not.toHaveBeenCalled();
    expect(view.bridge.change).not.toHaveBeenCalled();
    expect(theme.value).toBe("themes/b.json");
    expect(theme.checked).toBe(true);
  });

  it("distinguishes filenames containing controls and literal escapes", async () => {
    const view = await picker({
      status: "ok",
      invalid: [],
      truncated: false,
      hasConfiguredTheme: false,
      themes: [
        { path: "themes/a\n.json", name: "Same", colors },
        { path: "themes/a\t.json", name: "Same", colors },
        { path: "themes/a\\u{a}.json", name: "Same", colors },
      ],
    });
    const paths = [...document.querySelectorAll(".settings-theme-path")].map(
      (item) => item.textContent,
    );
    expect(new Set(paths).size).toBe(4);
    expect(paths).toContain("themes/a\\u{a}.json");
    expect(paths).toContain("themes/a\\u{9}.json");
    expect(paths).toContain("themes/a\\\\u{a}.json");
    view.dialog.dispose();
  });
});

describe("theme discovery feedback", () => {
  it("offers the bundled default separately and removes theme.path on explicit selection", async () => {
    const view = await picker();
    input("").click();
    expect(view.bridge.change).toHaveBeenCalledWith({
      path: "theme.path",
      value: null,
    });
  });

  it("distinguishes missing, empty, invalid, limited and custom cases", async () => {
    const themes = vi
      .fn()
      .mockResolvedValueOnce({
        status: "missing",
        themes: [],
        invalid: [],
        truncated: false,
        hasConfiguredTheme: false,
      })
      .mockResolvedValueOnce({
        status: "ok",
        themes: [],
        invalid: [],
        truncated: false,
        hasConfiguredTheme: false,
      })
      .mockResolvedValueOnce({
        status: "ok",
        themes: [],
        invalid: choices.invalid,
        truncated: true,
        hasConfiguredTheme: true,
      });
    const view = await open({ themes });
    await view.settle();
    expect(view.query(".settings-themes-message").textContent).toContain(
      "No themes folder",
    );
    expect(input("").checked).toBe(true);
    button("Refresh themes").click();
    await view.settle();
    expect(view.query(".settings-themes-message").textContent).toContain(
      "No theme files",
    );
    button("Refresh themes").click();
    await view.settle();
    expect(view.query(".settings-themes-message").textContent).toContain(
      "some files may not be shown",
    );
    expect(view.query(".settings-themes-message").textContent).toContain(
      "outside this list or unavailable",
    );
    expect(view.query(".settings-themes-invalid").textContent).toContain(
      "valid JSON",
    );
    expect(view.query(".settings-themes-message").textContent).toContain(
      "couldn't be used",
    );
    expect(input("").checked).toBe(false);
  });

  it("does not call a truncated scan an empty folder", async () => {
    const view = await open({
      themes: vi.fn(async () => ({
        status: "ok" as const,
        themes: [],
        invalid: [],
        truncated: true,
        hasConfiguredTheme: false,
      })),
    });
    await view.settle();
    expect(view.query(".settings-themes-message").textContent).toContain(
      "some files may not be shown",
    );
    expect(view.query(".settings-themes-message").textContent).not.toContain(
      "No theme files",
    );
  });

  it("ignores stale refresh results and late responses after closing", async () => {
    const first = deferred<SettingsThemesResult>();
    const second = deferred<SettingsThemesResult>();
    const themes = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const view = await open({ themes });
    button("Refresh themes").click();
    button("Refresh themes").click();
    button("Refresh themes").click();
    expect(themes).toHaveBeenCalledTimes(1);
    first.resolve({
      status: "missing",
      themes: [],
      invalid: [],
      truncated: false,
      hasConfiguredTheme: false,
    });
    await view.settle();
    expect(themes).toHaveBeenCalledTimes(2);
    second.resolve(choices);
    await view.settle();
    expect(input("themes/b.json").checked).toBe(true);
    expect(view.query(".settings-themes-message").textContent).not.toContain(
      "No themes folder",
    );
    view.dialog.dispose();
  });

  it("updates labels in place when the interface language changes", async () => {
    const language = createRendererLanguage();
    const view = await open(
      {
        themes: vi.fn(async () => ({
          ...choices,
          invalid: [{ path: "themes/broken.json", reason: "type" as const }],
        })),
      },
      language,
    );
    await view.settle();
    const theme = input("themes/b.json");
    theme.focus();
    language.set("pt-BR");
    expect(document.activeElement).toBe(theme);
    expect(view.query("#settings-themes-title").textContent).toBe(
      "Temas do terminal",
    );
    expect(view.query(".settings-themes-message").textContent).toContain(
      "Não foi possível usar",
    );
    expect(view.query(".settings-themes-invalid").textContent).toContain(
      "O destino não é um arquivo comum.",
    );
  });
});
