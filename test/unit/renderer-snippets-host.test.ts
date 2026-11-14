// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import type { TerminalSnippetsResponse } from "../../src/shared/terminal-snippets";
import {
  snippetsWindow as fixture,
  cleanupSnippetsWindows,
} from "../fixtures/snippets-window";

afterEach(cleanupSnippetsWindows);

it("relabels retained rows in place and shows the body as the row tooltip", async () => {
  const f = await fixture();
  f.toggle();
  await vi.waitFor(() =>
    expect(f.root.querySelector(".snippet-activate")).not.toBeNull(),
  );
  const row = f.root.querySelector<HTMLButtonElement>(".snippet-activate")!;
  expect(row.title).toBe("literal\n\n a  b\n$VALUE\n");
  expect(row.closest("li")!.querySelectorAll("button")).toHaveLength(1);
  row.focus();
  f.setLanguage("pt-BR");
  expect(document.activeElement).toBe(row);
  expect(f.root.querySelector(".snippet-activate")).toBe(row);
  expect(f.root.querySelector(".snippet-intent")!.textContent).toBe(
    "Executar · adiciona Enter",
  );
  expect(f.load).toHaveBeenCalledOnce();
});

it("deactivates Snippets on Settings, and keeps its clipboard field-only", async () => {
  const f = await fixture();
  f.toggle();
  await vi.waitFor(() =>
    expect(f.root.querySelector(".snippet-activate")).not.toBeNull(),
  );
  f.settingsOpen();
  await vi.waitFor(() =>
    expect(document.querySelector(".settings-dialog textarea")).not.toBeNull(),
  );
  const settings = document.querySelector<HTMLElement>(".settings-dialog")!;
  settings
    .querySelector<HTMLButtonElement>("#settings-tab-appearance")!
    .click();
  const family = settings.querySelector<HTMLInputElement>(
    ".settings-text input",
  )!;
  family.focus();
  f.clipboardAction("paste");
  await vi.waitFor(() => expect(f.settingsChange).toHaveBeenCalledOnce());
  expect(f.settingsChange).toHaveBeenCalledWith({
    path: "font.family",
    value: "pastedquery",
  });
  f.about();
  f.image();
  expect(document.querySelector(".about-dialog")).not.toBeNull();
  expect(f.root.hidden).toBe(true);
  expect(settings.inert).toBe(true);
  expect(f.loadImage).not.toHaveBeenCalled();
  document.querySelector<HTMLButtonElement>(".about-close")!.click();
  expect(document.activeElement).toBe(family);
  f.toggle();
  expect(f.root.hidden).toBe(true);
  expect(f.transportWrites[0]).not.toHaveBeenCalled();
  f.setLanguage("pt-BR");
  expect(settings.querySelector("h2")!.textContent).toBe("Configurações");
});

it("deactivates Snippets and restores Settings when selected terminal exit chooses graphical fallback", async () => {
  const f = await fixture();
  f.settingsOpen();
  await vi.waitFor(() =>
    expect(document.querySelector("#settings-tab-general")).not.toBeNull(),
  );
  f.tabCommand({ action: "previous" });
  f.toggle();
  expect(f.root.hidden).toBe(false);
  f.sessionHandlers[0]!.onExit({ exitCode: 0, signal: 0 });
  expect(f.root.hidden).toBe(true);
  expect(document.activeElement).toBe(
    document.querySelector("#settings-tab-general"),
  );
});

it("routes native action subscriptions to panel text, retains passive focus, and preserves exact selected injection", async () => {
  const f = await fixture();
  f.tabCommand({ action: "new" });
  await vi.waitFor(() => expect(f.surfaces).toHaveLength(2));
  f.toggle();
  const input = f.root.querySelector("input")!;
  expect(document.activeElement).toBe(input);
  window.dispatchEvent(new Event("focus"));
  f.tabBar();
  expect(document.activeElement).toBe(input);
  input.value = "query";
  input.select();
  f.clipboardAction("copy");
  expect(f.clipboard.writeText).toHaveBeenCalledWith("query");
  f.clipboardAction("paste");
  await vi.waitFor(() => expect(input.value).toBe("pasted query"));
  f.clipboardAction("select-all");
  expect(input.selectionEnd).toBe(input.value.length);
  for (const surface of f.surfaces) {
    expect(surface.copy).not.toHaveBeenCalled();
    expect(surface.paste).not.toHaveBeenCalled();
    expect(surface.selectAll).not.toHaveBeenCalled();
    expect(surface.inject).not.toHaveBeenCalled();
  }
  input.value = "";
  input.dispatchEvent(new Event("input"));
  await vi.waitFor(() =>
    expect(f.root.querySelector("li button")).not.toBeNull(),
  );
  f.root.querySelector<HTMLButtonElement>("li button")!.click();
  expect(f.surfaces[1]!.inject).toHaveBeenCalledExactlyOnceWith(
    " a  b\n$VALUE\n",
    { submit: true },
  );
  expect(f.surfaces[0]!.inject).not.toHaveBeenCalled();
  expect(f.adapters).toHaveBeenCalledTimes(2);
  f.clipboardAction("paste");
  expect(f.surfaces[1]!.paste).toHaveBeenCalledOnce();
});

it.each(["About", "image"])(
  "retains loading panel inert under %s and preserves overlay focus/cancellation",
  async (kind) => {
    const f = await fixture();
    let complete!: (value: TerminalSnippetsResponse) => void;
    f.load.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    let cancelImage!: (value: null) => void;
    f.loadImage.mockImplementation(
      () =>
        new Promise((resolve) => {
          cancelImage = resolve;
        }),
    );
    f.toggle();
    await vi.waitFor(() => expect(complete).toBeDefined());
    const focusCalls = f.surfaces[0]!.focus.mock.calls.length;
    if (kind === "About") f.about();
    else f.image();
    expect(f.root.inert).toBe(true);
    expect(f.root.hidden).toBe(false);
    complete({ snippets: [{ name: "fresh", body: "fresh", execute: false }] });
    await vi.waitFor(() =>
      expect(f.root.querySelector("li button")).not.toBeNull(),
    );
    f.root.querySelector<HTMLButtonElement>("li button")!.click();
    f.root.querySelector<HTMLButtonElement>("header button")!.click();
    f.toggle();
    f.clipboardAction("paste");
    window.dispatchEvent(new Event("focus"));
    expect(f.root.hidden).toBe(false);
    expect(f.surfaces[0]!.inject).not.toHaveBeenCalled();
    expect(f.surfaces[0]!.paste).not.toHaveBeenCalled();
    expect(f.surfaces[0]!.focus).toHaveBeenCalledTimes(focusCalls);
    if (kind === "About")
      document.querySelector<HTMLButtonElement>(".about-close")!.click();
    else cancelImage(null);
    await vi.waitFor(() => expect(f.root.inert).toBe(false));
    expect(f.surfaces[0]!.focus).toHaveBeenCalledTimes(focusCalls + 1);
    expect(f.load).toHaveBeenCalledOnce();
  },
);

it.each(["signal", "rendering", "startup"] as const)(
  "refuses row delivery after retained %s failure",
  async (kind) => {
    const f = await fixture();
    f.toggle();
    await vi.waitFor(() =>
      expect(f.root.querySelector(".snippet-activate")).not.toBeNull(),
    );
    if (kind === "rendering")
      f.surfaceOptions[0]!.onFatalError!({ kind: "backend-loss" });
    else
      f.sessionHandlers[0]!.onExit({
        exitCode: 1,
        signal: kind === "signal" ? 9 : 0,
        ...(kind === "startup" ? { startupFailed: true } : {}),
      });
    expect(document.querySelectorAll("main.terminal-surface")).toHaveLength(1);
    f.root.querySelector<HTMLButtonElement>(".snippet-activate")!.click();
    expect(f.surfaces[0]!.inject).not.toHaveBeenCalled();
  },
);

it.each([
  [false, false],
  [true, true],
] as const)(
  "delivers exact bytes (execute=%s) through Protected Paste",
  async (execute, submit) => {
    const f = await fixture();
    f.load.mockResolvedValue({
      snippets: [{ name: "literal", body: " a  b\n$VALUE\n", execute }],
    });
    f.clipboard.confirmPaste.mockResolvedValue(true);
    f.toggle();
    await vi.waitFor(() =>
      expect(f.root.querySelector(".snippet-activate")).not.toBeNull(),
    );
    f.surfaces[0]!.focus.mockClear();
    f.root.querySelector<HTMLButtonElement>(".snippet-activate")!.click();
    expect(f.surfaces[0]!.focus).toHaveBeenCalledOnce();
    await f.surfaces[0]!.inject.mock.results[0]!.value;
    expect(f.clipboard.confirmPaste).toHaveBeenCalledExactlyOnceWith(
      " a  b\n$VALUE\n",
    );
    expect(f.transportWrites[0]!.mock.calls).toEqual(
      submit ? [[" a  b\n$VALUE\n"], ["\r"]] : [[" a  b\n$VALUE\n"]],
    );
  },
);

it.each(["decline", "target-exit"] as const)(
  "does not deliver or refocus after Protected Paste %s",
  async (kind) => {
    const f = await fixture();
    let confirm!: (approved: boolean) => void;
    f.clipboard.confirmPaste.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          confirm = resolve;
        }),
    );
    f.toggle();
    await vi.waitFor(() =>
      expect(f.root.querySelector(".snippet-activate")).not.toBeNull(),
    );
    f.surfaces[0]!.focus.mockClear();
    f.root.querySelector<HTMLButtonElement>(".snippet-activate")!.click();
    expect(f.surfaces[0]!.focus).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(confirm).toBeDefined());
    if (kind === "target-exit") {
      f.sessionHandlers[0]!.onExit({ exitCode: 0, signal: 9 });
      f.tabCommand({ action: "new" });
      await vi.waitFor(() => expect(f.surfaces[1]?.focus).toHaveBeenCalled());
    }
    for (const surface of f.surfaces) surface.focus.mockClear();
    confirm(kind === "target-exit");
    await f.surfaces[0]!.inject.mock.results[0]!.value;
    for (const write of f.transportWrites) expect(write).not.toHaveBeenCalled();
    for (const surface of f.surfaces)
      expect(surface.focus).not.toHaveBeenCalled();
  },
);
