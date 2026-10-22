// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createTranslator } from "../../src/shared/i18n";
import {
  DEFAULT_HIGHLIGHT_SETTINGS,
  type HighlightSettings,
} from "../../src/shared/highlight-settings";
import type { HighlightsBridge } from "../../src/shared/terminal-bridge";
import { openHighlightEditor } from "../../src/renderer/highlighting/highlight-editor";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

describe("highlight rule editor", () => {
  it("edits switches, rule sets and custom rules, refusing unsafe patterns", async () => {
    document.body.innerHTML = "";
    const save = vi.fn(async (settings: HighlightSettings) => settings);
    const bridge: HighlightsBridge = {
      get: async () => DEFAULT_HIGHLIGHT_SETTINGS,
      save,
      onChanged: () => () => {},
      onOpenEditor: () => () => {},
    };
    const done = openHighlightEditor(document, {
      translator: createTranslator("en"),
      bridge,
    });
    const dialog = await vi.waitFor(() => {
      const element = document.querySelector<HTMLDialogElement>("dialog");
      if (!element) throw new Error("no dialog");
      return element;
    });
    const boxes = [
      ...dialog.querySelectorAll<HTMLLabelElement>("label.omx-checkbox"),
    ];
    const box = (label: string) =>
      boxes.find((item) => item.textContent === label)!.querySelector("input")!;
    box("Highlight terminal output").click();
    box("ping").click();
    [...dialog.querySelectorAll("button")]
      .find((button) => button.textContent === "Add Rule")!
      .click();
    const [name, pattern] = dialog.querySelectorAll<HTMLInputElement>(
      ".highlight-custom-rule input[type=text]",
    );
    name!.value = "Ticket";
    pattern!.value = "(a+)+$";
    const saveButton = dialog.querySelector<HTMLButtonElement>(
      ".omx-modal-actions button:last-child",
    )!;
    saveButton.click();
    await vi.waitFor(() =>
      expect(dialog.textContent).toContain(
        "The pattern is too expensive to run on terminal output.",
      ),
    );
    expect(save).not.toHaveBeenCalled();
    pattern!.value = "TICKET-\\d+";
    saveButton.click();
    await expect(done).resolves.toBe(true);
    expect(save.mock.lastCall![0]).toMatchObject({
      enabled: true,
      disabledContexts: ["ping"],
      customRules: [
        { name: "Ticket", pattern: "TICKET-\\d+", colors: ["red"] },
      ],
    });
  });
});
