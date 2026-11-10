// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { DEFAULT_USER_CONFIGURATION } from "../../src/main/user-configuration";
import { installSettingsDom, open } from "../fixtures/settings-dialog-dom";

beforeAll(installSettingsDom);
afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

it("keeps the raw draft, its selection and focus when a hidden control changes", async () => {
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
