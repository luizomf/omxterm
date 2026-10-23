// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createTranslator } from "../../src/shared/i18n";
import { chooseTerminals } from "../../src/renderer/commands/terminal-picker";
import type { PaneTarget } from "../../src/renderer/terminal-tabs";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

const target = (tabLabel: string, current = false): PaneTarget => ({
  tabLabel,
  paneLabel: tabLabel,
  tabNumber: 1,
  paneNumber: 1,
  paneCount: 1,
  current,
  run: vi.fn(() => true),
});

const buttons = () =>
  document.querySelectorAll<HTMLButtonElement>(".omx-modal-actions button");
const boxes = () =>
  document.querySelectorAll<HTMLInputElement>(
    ".terminal-picker-list input[type=checkbox]",
  );
const selectAll = () =>
  document.querySelector<HTMLInputElement>(".terminal-picker-all input")!;

describe("Run in Multiple Terminals picker", () => {
  it("lists every terminal checked and returns the ones left checked", async () => {
    document.body.innerHTML = "";
    const targets = [target("one", true), target("two"), target("three")];
    const chosen = chooseTerminals(
      document,
      createTranslator("pt-BR"),
      "ls -la",
      targets,
    );
    expect(document.querySelector("h2")?.textContent).toBe(
      "Executar em Múltiplos Terminais",
    );
    expect(
      document.querySelector(".terminal-picker-command")?.textContent,
    ).toBe("ls -la");
    expect([...boxes()].every((box) => box.checked)).toBe(true);
    boxes()[1]!.click();
    expect(selectAll().indeterminate).toBe(true);
    buttons()[1]!.click();
    expect(await chosen).toEqual([targets[0], targets[2]]);
  });

  it("disables Run when nothing is checked and resolves nothing on cancel", async () => {
    document.body.innerHTML = "";
    const chosen = chooseTerminals(document, createTranslator("en"), "ls", [
      target("one"),
      target("two"),
    ]);
    selectAll().click();
    expect([...boxes()].some((box) => box.checked)).toBe(false);
    expect(buttons()[1]!.disabled).toBe(true);
    selectAll().click();
    expect(buttons()[1]!.disabled).toBe(false);
    buttons()[0]!.click();
    expect(await chosen).toBeUndefined();
  });

  it("numbers tabs and the panes of split tabs", async () => {
    document.body.innerHTML = "";
    const split = (paneNumber: number): PaneTarget => ({
      ...target("~/work"),
      tabNumber: 2,
      paneNumber,
      paneCount: 2,
    });
    const chosen = chooseTerminals(document, createTranslator("en"), "ls", [
      target("~"),
      split(1),
      { ...split(2), busy: true },
    ]);
    expect(
      [...document.querySelectorAll(".terminal-picker-list label")].map(
        (label) => label.textContent,
      ),
    ).toEqual([
      "Tab 1: ~",
      "Tab 2, pane 1: ~/work",
      "Tab 2, pane 2: ~/work (a program is running)",
    ]);
    // A pane running a program starts unchecked.
    expect([...boxes()].map((box) => box.checked)).toEqual([true, true, false]);
    buttons()[0]!.click();
    await chosen;
  });
});
