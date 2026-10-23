// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createTranslator } from "../../src/shared/i18n";
import {
  configFilePage,
  configurationTextProblem,
} from "../../src/renderer/preferences/config-file-page";
import type { PreferencesSaveResult } from "../../src/shared/preferences";

const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

describe("Preferences config.json editor", () => {
  it("names JSON problems and accepts only objects", () => {
    expect(configurationTextProblem('{"version": 1}')).toBeUndefined();
    expect(configurationTextProblem("[]")).toBe(
      "config.json must hold a JSON object",
    );
    expect(configurationTextProblem("{")).toBeDefined();
  });

  it("loads the file, blocks invalid text and saves with Ctrl+S", async () => {
    const save = vi.fn(
      async () => ({ ok: true }) as unknown as PreferencesSaveResult,
    );
    const page = configFilePage(document, createTranslator("pt-BR"), {
      read: async () => ({
        path: "/home/me/.config/omxterm/config.json",
        text: '{\n  "version": 1\n}\n',
      }),
      save,
      onSaved: () => {},
    });
    document.body.replaceChildren(page);
    await settle();
    const editor = page.querySelector("textarea")!;
    const saveButton = page.querySelector<HTMLButtonElement>(
      ".preferences-config-save",
    )!;
    expect(page.querySelector("code")?.textContent).toBe(
      "/home/me/.config/omxterm/config.json",
    );
    expect(editor.value).toBe('{\n  "version": 1\n}\n');
    expect(saveButton.disabled).toBe(true);

    editor.value = '{"version": 1,';
    editor.dispatchEvent(new Event("input"));
    await settle();
    expect(saveButton.disabled).toBe(true);
    expect(
      page.querySelector(".preferences-config-check")?.className,
    ).toContain("error");

    editor.value = '{"version": 1, "window": {"cornerRadius": 8}}';
    editor.dispatchEvent(new Event("input"));
    await settle();
    expect(saveButton.disabled).toBe(false);
    editor.dispatchEvent(
      new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true }),
    );
    await settle();
    expect(save).toHaveBeenCalledWith(
      '{"version": 1, "window": {"cornerRadius": 8}}',
    );
    expect(page.querySelector(".preferences-config-check")?.textContent).toBe(
      "Salvo e aplicado.",
    );
  });
});
