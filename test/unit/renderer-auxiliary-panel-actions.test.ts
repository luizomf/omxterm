// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import type {
  HostedContentBridge,
  HostedContentDescriptor,
} from "../../src/shared/extension-view";
import {
  cleanupSnippetsWindows,
  snippetsWindow,
} from "../fixtures/snippets-window";

afterEach(cleanupSnippetsWindows);
const settle = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

it.each(["builtin", "optional"] as const)(
  "toggles only retained panel visibility in %s mode and guards Settings, modal and disposal",
  async (mode) => {
    const opens = new Set<(descriptor: HostedContentDescriptor) => void>();
    const open = (descriptor: HostedContentDescriptor) => {
      for (const listener of opens) listener(descriptor);
    };
    const bridge: HostedContentBridge = {
      onOpen(listener) {
        opens.add(listener);
        return () => {
          opens.delete(listener);
        };
      },
      onRetired: () => vi.fn(),
      onFailure: () => vi.fn(),
      present: vi.fn(async () => true),
      close: vi.fn(async () => {}),
    };
    const f = await snippetsWindow(
      { hostedContent: bridge },
      mode === "builtin",
    );
    f.panelToggle();
    expect(f.root.hidden).toBe(true);
    expect(f.load).not.toHaveBeenCalled();
    if (mode === "builtin") f.toggle();
    else
      open({
        id: "optional-snippets",
        title: "Snippets",
        presentation: "panel",
      });
    await settle();
    expect(f.root.hidden).toBe(false);
    const view = f.root.querySelector(".auxiliary-body")!.firstElementChild;
    f.panelToggle();
    await settle();
    expect(f.root.hidden).toBe(true);
    f.panelToggle();
    await settle();
    expect(f.root.hidden).toBe(false);
    expect(f.root.querySelector(".auxiliary-body")!.firstElementChild).toBe(
      view,
    );
    expect(bridge.close).not.toHaveBeenCalled();
    f.about();
    await settle();
    f.panelToggle();
    expect(f.root.hidden).toBe(false);
    document.querySelector<HTMLButtonElement>(".about-close")!.click();
    f.settingsOpen();
    await settle();
    expect(f.root.hidden).toBe(true);
    f.panelToggle();
    f.tabCommand({ action: "select", position: 1 });
    await settle();
    expect(f.root.hidden).toBe(false);
    f.host.dispose();
    f.panelToggle(); // A queued stale callback cannot resurrect disposed content.
    expect(f.removePanelToggle).toHaveBeenCalledOnce();
    expect(f.root.children).toHaveLength(0);
  },
);

it("does not reveal a retained panel without a live selected terminal", async () => {
  const f = await snippetsWindow();
  f.toggle();
  await settle();
  f.panelToggle();
  f.settingsOpen();
  await settle();
  f.sessionHandlers[0]!.onExit({ exitCode: 0, signal: 0 });
  f.panelToggle();
  expect(f.root.hidden).toBe(true);
});
