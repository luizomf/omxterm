// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  modalSelectionWindow,
  selectedImage,
} from "../fixtures/pane-modal-selection";
import { createTabsHarness } from "../fixtures/terminal-tabs-harness";
import type { TerminalTabCommand } from "../../src/shared/terminal-contract";

type Scene = Awaited<ReturnType<typeof modalSelectionWindow>>;
const phases = ["picker", "loading", "decode", "open"] as const;
type Phase = (typeof phases)[number];
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});
async function fixture() {
  const f = await modalSelectionWindow();
  cleanups.push(f.dispose);
  return f;
}
async function begin(f: Scene, phase: Phase) {
  if (phase === "loading") {
    const source = {
      source: "native-path",
      path: "/synthetic/image.png",
    } as const;
    f.mountedOptions[1]!.onLocalImageActivation!(source);
    expect(f.loadImage).toHaveBeenCalledExactlyOnceWith(source);
  } else f.openImage();
  if (phase === "decode" || phase === "open") {
    f.loaded.resolve(selectedImage);
    await vi.waitFor(() => expect(f.decode).toHaveBeenCalledOnce());
  }
  if (phase === "open") {
    f.decoded.resolve();
    await vi.waitFor(() => expect(dialog().open).toBe(true));
  } else expect(dialog().open).toBe(false);
}
function dialog() {
  return document.querySelector<HTMLDialogElement>(".local-image-preview")!;
}
async function dismiss(f: Scene, phase: Phase) {
  if (phase === "picker") f.loaded.resolve(null);
  else {
    f.loaded.resolve(selectedImage);
    f.decoded.resolve();
    await vi.waitFor(() => expect(dialog().open).toBe(true));
    dialog().querySelector<HTMLButtonElement>("button")!.click();
  }
  await vi.waitFor(() => expect(f.tabsContainer.inert).toBe(false));
  expect(f.tabStrip.inert).toBe(false);
}
function selection(f: Scene) {
  return [...f.tabStrip.querySelectorAll("button")].map((button) =>
    button.getAttribute("aria-selected"),
  );
}

it("keeps pane B selected when sibling search gains DOM focus while image decode is pending", async () => {
  const f = await fixture();
  await begin(f, "decode");
  expect(f.notifySelection).toHaveBeenLastCalledWith("s2", ["s1", "s2"]);
  const notifications = f.notifySelection.mock.calls.length;
  f.fields[0]!.search.focus();
  expect(f.notifySelection).toHaveBeenCalledTimes(notifications);
  expect(
    f.fields[1]!.terminal.closest(".terminal-surface")!.classList.contains(
      "pane-focused",
    ),
  ).toBe(true);
});
it("keeps the original tab visible when another tab button is activated during decode", async () => {
  const f = await fixture();
  await begin(f, "decode");
  const notifications = f.notifySelection.mock.calls.length;
  f.tabStrip.querySelectorAll<HTMLButtonElement>("button")[1]!.click();
  expect(selection(f)).toEqual(["true", "false"]);
  expect(f.notifySelection).toHaveBeenCalledTimes(notifications);
  expect((f.tabsContainer.children[0] as HTMLElement).hidden).toBe(false);
  expect((f.tabsContainer.children[1] as HTMLElement).hidden).toBe(true);
});
it("makes terminal and tab controls inert before the picker can settle", async () => {
  const f = await fixture();
  f.openImage();
  expect(f.tabsContainer.inert).toBe(true);
  expect(f.tabStrip.inert).toBe(true);
});
it("releases DOM ownership before restoring the original pane after picker cancellation", async () => {
  const f = await fixture();
  f.openImage();
  f.loaded.resolve(null);
  await vi.waitFor(() => expect(f.surfaces[1]!.focus).toHaveBeenCalledOnce());
  expect(f.blockedAtFocus).toEqual([false]);
  expect(f.tabsContainer.inert).toBe(false);
  expect(f.tabStrip.inert).toBe(false);
  expect(document.activeElement).toBe(f.fields[1]!.terminal);
});

it.each(phases)(
  "freezes direct pointer/keyboard/programmatic selection throughout %s and releases it afterward",
  async (phase) => {
    const f = await fixture();
    await begin(f, phase);
    const notifications = f.notifySelection.mock.calls.length;
    for (const route of [
      "pointer",
      "keyboard-enter",
      "keyboard-space",
      "programmatic",
    ] as const) {
      const keyboard = route === "keyboard-enter" || route === "keyboard-space";
      const field = keyboard ? f.fields[0]!.search : f.fields[0]!.terminal;
      if (route === "pointer")
        field.dispatchEvent(
          new MouseEvent("pointerdown", { button: 0, bubbles: true }),
        );
      if (keyboard)
        document.activeElement!.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
        );
      // JSDOM has no native pointer/Tab defaults: deliver the resulting actual DOM
      // focus event. Inertness itself is a browser/native qualification boundary.
      field.focus();
      field.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      const tab = f.tabStrip.querySelectorAll<HTMLButtonElement>("button")[1]!;
      if (keyboard) {
        const key = route === "keyboard-enter" ? "Enter" : " ";
        tab.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
        tab.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
      }
      if (route === "pointer")
        tab.dispatchEvent(
          new MouseEvent("click", { button: 0, bubbles: true }),
        );
      else tab.click(); // Includes script/native-keyboard activation of a tab button.
      expect(selection(f)).toEqual(["true", "false"]);
      expect(f.notifySelection).toHaveBeenCalledTimes(notifications);
    }
    for (const command of [
      { action: "next" },
      { action: "previous" },
      { action: "select", position: 2 },
      { action: "focus-pane", target: "previous" },
    ] as const)
      f.command(command);
    expect(f.notifySelection).toHaveBeenCalledTimes(notifications);
    expect(f.tabsContainer.inert).toBe(true);
    expect(f.tabStrip.inert).toBe(true);
    for (const surface of f.surfaces)
      expect(surface.focus).not.toHaveBeenCalled();
    await dismiss(f, phase);
    expect(f.blockedAtFocus).toEqual([false]);
    expect(document.activeElement).toBe(f.fields[1]!.terminal);
    f.fields[0]!.search.focus();
    expect(f.notifySelection).toHaveBeenLastCalledWith("s1", ["s1", "s2"]);
    f.tabStrip.querySelectorAll<HTMLButtonElement>("button")[1]!.click();
    expect(selection(f)).toEqual(["false", "true"]);
    expect(f.notifySelection).toHaveBeenLastCalledWith("s3", ["s3"]);
    f.command({ action: "select", position: 1 });
    f.command({ action: "focus-pane", target: "next" });
    expect(f.notifySelection).toHaveBeenLastCalledWith("s2", ["s1", "s2"]);
  },
);

it("establishes the first lifecycle owner even when input is already blocked", async () => {
  const f = createTabsHarness({ tabsOptions: { canFocus: () => false } });
  cleanups.push(async () => f.tabs.dispose());
  await f.tabs.ready;
  expect(f.notifySelection).toHaveBeenLastCalledWith("s1", ["s1"]);
  expect(f.tabs.captureSnippetTarget()).toBeDefined();
  expect(f.surfaces[0]!.focus).not.toHaveBeenCalled();
});

it.each<TerminalTabCommand>([
  { action: "next" },
  { action: "previous" },
  { action: "select", position: 2 },
  { action: "focus-pane", target: "previous" },
  { action: "focus-pane", target: "next" },
])(
  "guards public TerminalTabs selection $action without relying on the host command filter",
  async (command) => {
    let blocked = false;
    const f = createTabsHarness({ tabsOptions: { canFocus: () => !blocked } });
    cleanups.push(async () => f.tabs.dispose());
    await f.tabs.ready;
    f.sessionAdapters[0]!.resize({ cols: 120, rows: 40 });
    f.tabs.handleCommand({ action: "split", direction: "right" });
    await vi.waitFor(() => expect(f.surfaces).toHaveLength(2));
    f.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(f.surfaces).toHaveLength(3));
    f.tabs.handleCommand({ action: "select", position: 1 });
    const notifications = f.notifySelection.mock.calls.length;
    blocked = true;
    f.tabs.handleCommand(command);
    expect(f.notifySelection).toHaveBeenCalledTimes(notifications);
    expect(f.notifySelection).toHaveBeenLastCalledWith("s2", ["s1", "s2"]);
    blocked = false;
    f.tabs.handleCommand(command);
    expect(f.notifySelection).toHaveBeenLastCalledWith(
      command.action === "focus-pane" ? "s1" : "s3",
      command.action === "focus-pane" ? ["s1", "s2"] : ["s3"],
    );
  },
);

it.each(
  phases.flatMap((phase) =>
    (["pane", "tab", "failure-ack", "ordinary", "dispose"] as const).map(
      (ending) => ({ phase, ending }),
    ),
  ),
)(
  "delivers $ending lifecycle cleanup during $phase without stealing modal focus",
  async ({ phase, ending }) => {
    const f = await fixture();
    f.command({ action: "prepare-close" });
    f.command({ action: "prepare-close-pane" });
    await begin(f, phase);
    const paneB = f.fields[1]!.terminal.closest(".terminal-surface")!;
    if (ending === "pane")
      f.command({ action: "resolve-close-pane", confirmed: true });
    else if (ending === "tab")
      f.command({ action: "resolve-close", confirmed: true });
    else if (ending === "failure-ack") {
      f.mountedOptions[1]!.onFatalError!({ kind: "backend-loss" });
      f.handlers[1]!.onExit({ exitCode: 1, signal: 9 });
      expect(paneB.isConnected).toBe(true);
      expect(f.notifySelection).toHaveBeenLastCalledWith(null, ["s1"]);
      f.command({ action: "close-session", sessionId: "s2" });
    } else if (ending === "ordinary")
      f.handlers[1]!.onExit({ exitCode: 0, signal: 0 });
    else f.host.dispose();
    expect(f.surfaces[1]!.dispose).toHaveBeenCalled();
    for (const surface of f.surfaces)
      expect(surface.focus).not.toHaveBeenCalled();
    if (ending === "dispose") {
      const notifications = f.notifySelection.mock.calls.length;
      f.tabStrip.querySelectorAll<HTMLButtonElement>("button")[1]?.click();
      f.fields[0]!.search.focus();
      expect(f.notifySelection).toHaveBeenCalledTimes(notifications);
      for (const surface of f.surfaces)
        expect(surface.dispose).toHaveBeenCalled();
      return;
    }
    expect(paneB.isConnected).toBe(false);
    expect(f.tabsContainer.inert).toBe(true);
    const survivor = ending === "tab" ? 2 : 0;
    expect(f.notifySelection).toHaveBeenLastCalledWith(
      ending === "tab" ? "s3" : "s1",
      [ending === "tab" ? "s3" : "s1"],
    );
    expect(f.surfaces[survivor]!.dispose).not.toHaveBeenCalled();
    await dismiss(f, phase);
    expect(document.activeElement).toBe(f.fields[survivor]!.terminal);
    expect(f.blockedAtFocus).toEqual([false]);
  },
);

it("still commits last-tab closure while the image decoder is pending", async () => {
  const f = await fixture();
  await begin(f, "decode");
  for (const sessionId of ["s1", "s2", "s3"])
    f.command({ action: "close-session", sessionId });
  expect(f.notifyEmpty).toHaveBeenCalledOnce();
  for (const surface of f.surfaces) expect(surface.dispose).toHaveBeenCalled();
  const notifications = f.notifySelection.mock.calls.length;
  f.command({ action: "new" });
  f.command({ action: "next" });
  expect(f.surfaces).toHaveLength(3);
  expect(f.notifySelection).toHaveBeenCalledTimes(notifications);
});
