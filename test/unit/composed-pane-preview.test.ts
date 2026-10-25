// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  snippetsWindow,
  cleanupSnippetsWindows,
} from "../fixtures/snippets-window";
import { createTabsHarness } from "../fixtures/terminal-tabs-harness";

afterEach(cleanupSnippetsWindows);

it.each([
  "ordinary",
  "signal",
  "rendering",
  "close-pane",
  "close-tab",
  "dispose",
] as const)(
  "invalidates captured pane B once on %s without following focused A or replacement C",
  async (ending) => {
    const f = createTabsHarness();
    try {
      await f.tabs.ready;
      f.sessionAdapters[0]!.resize({ cols: 120, rows: 40 });
      f.tabs.handleCommand({ action: "split", direction: "right" });
      await vi.waitFor(() => expect(f.surfaces).toHaveLength(2));
      const target = f.tabs.captureSnippetTarget()!;
      const unavailable = vi.fn();
      target.onUnavailable(unavailable);
      f.tabs.handleCommand({ action: "prepare-close-pane" });
      f.tabs.handleCommand({ action: "focus-pane", target: "previous" });
      target.deliver("exact B", false);
      expect(f.surfaces[1]!.inject).toHaveBeenCalledExactlyOnceWith("exact B", {
        submit: false,
      });
      expect(f.surfaces[0]!.inject).not.toHaveBeenCalled();
      if (ending === "ordinary" || ending === "signal")
        f.adapters[1]!.handlers!.onExit({
          exitCode: 0,
          signal: ending === "ordinary" ? 0 : 9,
        });
      else if (ending === "rendering")
        f.mountedSurfaceOptions[1]!.onFatalError!({ kind: "backend-loss" });
      else if (ending === "close-pane")
        f.tabs.handleCommand({ action: "resolve-close-pane", confirmed: true });
      else if (ending === "close-tab")
        f.tabs.handleCommand({ action: "close" });
      else f.tabs.dispose();
      expect(target.live()).toBe(false);
      expect(unavailable).toHaveBeenCalledOnce();
      target.deliver("never A", true);
      expect(f.surfaces[1]!.inject).toHaveBeenCalledOnce();
      expect(f.surfaces[0]!.inject).not.toHaveBeenCalled();
      if (ending !== "close-tab" && ending !== "dispose") {
        f.tabs.handleCommand({ action: "close-session", sessionId: "s2" });
        f.tabs.handleCommand({ action: "split", direction: "right" });
        await vi.waitFor(() => expect(f.surfaces).toHaveLength(3));
        target.deliver("never C", true);
        expect(f.surfaces[2]!.inject).not.toHaveBeenCalled();
      }
      f.tabs.dispose();
      expect(unavailable).toHaveBeenCalledOnce();
    } finally {
      f.tabs.dispose();
    }
  },
);

it.each(["signal", "rendering", "remove"] as const)(
  "keeps a translated preview bound to unavailable pane B after %s and surviving A",
  async (ending) => {
    const f = await snippetsWindow();
    f.tabCommand({ action: "split", direction: "right" });
    await vi.waitFor(() => expect(f.surfaces).toHaveLength(2));
    f.toggle();
    await vi.waitFor(() =>
      expect(f.root.querySelector(".snippet-preview-open")).not.toBeNull(),
    );
    f.root.querySelector<HTMLButtonElement>(".snippet-preview-open")!.click();
    const dialog = document.querySelector(".snippet-preview")!;
    const body = dialog.querySelector("pre")!;
    const run = dialog.querySelector<HTMLButtonElement>(
      ".snippet-preview-run",
    )!;
    if (ending === "signal")
      f.sessionHandlers[1]!.onExit({ exitCode: 1, signal: 9 });
    else if (ending === "rendering")
      f.surfaceOptions[1]!.onFatalError!({ kind: "backend-loss" });
    else f.tabCommand({ action: "close-session", sessionId: "s2" });
    f.setLanguage("pt-BR");
    expect(document.querySelector(".snippet-preview")).toBe(dialog);
    expect(dialog.querySelector("pre")).toBe(body);
    expect(body.textContent).toBe(" a  b\n$VALUE\n");
    expect(run.disabled).toBe(true);
    expect(dialog.querySelector(".snippet-preview-closed")!.textContent).toBe(
      "O terminal deste snippet foi encerrado. Nada será enviado.",
    );
    f.tabCommand({ action: "close-session", sessionId: "s2" });
    f.setLanguage("en-US");
    expect(run.disabled).toBe(true);
    run.disabled = false;
    run.click();
    for (const write of f.transportWrites) expect(write).not.toHaveBeenCalled();
    for (const surface of f.surfaces)
      expect(surface.inject).not.toHaveBeenCalled();
    expect(f.surfaces[0]!.dispose).not.toHaveBeenCalled();
    expect(f.load).toHaveBeenCalledOnce();
  },
);

it("does not deliver accepted Protected Paste or Enter after captured B exits while approval is pending", async () => {
  const f = await snippetsWindow();
  let approve!: (value: boolean) => void;
  f.clipboard.confirmPaste.mockImplementation(
    () =>
      new Promise<boolean>((resolve) => {
        approve = resolve;
      }),
  );
  f.tabCommand({ action: "split", direction: "right" });
  await vi.waitFor(() => expect(f.surfaces).toHaveLength(2));
  f.toggle();
  await vi.waitFor(() =>
    expect(f.root.querySelector(".snippet-preview-open")).not.toBeNull(),
  );
  f.root.querySelector<HTMLButtonElement>(".snippet-preview-open")!.click();
  document.querySelector<HTMLButtonElement>(".snippet-preview-run")!.click();
  await vi.waitFor(() =>
    expect(f.clipboard.confirmPaste).toHaveBeenCalledOnce(),
  );
  f.tabCommand({ action: "focus-pane", target: "previous" });
  f.sessionHandlers[1]!.onExit({ exitCode: 0, signal: 0 });
  approve(true);
  await f.surfaces[1]!.inject.mock.results[0]!.value;
  for (const write of f.transportWrites) expect(write).not.toHaveBeenCalled();
  expect(f.surfaces[0]!.inject).not.toHaveBeenCalled();
  expect(f.surfaces[1]!.dispose).toHaveBeenCalledOnce();
});
