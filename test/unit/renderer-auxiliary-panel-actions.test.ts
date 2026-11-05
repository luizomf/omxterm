// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import type {
  HostedContentBridge,
  HostedContentDescriptor,
} from "../../src/shared/extension-view";
import {
  deferred,
  fixture,
  settle as companionSettle,
} from "../fixtures/companion-content";
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
    if (mode === "builtin") {
      f.panelToggle();
      await settle();
      expect(f.root.hidden).toBe(false);
      expect(f.load).toHaveBeenCalledOnce();
      f.panelToggle();
      await settle();
    }
    expect(f.root.hidden).toBe(true);
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

it("moves the panel per window and resets that choice when its configured side changes", async () => {
  const f = await snippetsWindow();
  f.toggle();
  await settle();
  f.panelSideToggle();
  expect(f.root.parentElement!.dataset.auxiliaryPanelSide).toBe("left");
  f.setLanguage("pt-BR");
  expect(f.root.parentElement!.dataset.auxiliaryPanelSide).toBe("left");
  f.settingsOpen();
  await settle();
  expect(f.root.hidden).toBe(true);
  f.panelSideToggle();
  expect(f.root.parentElement!.dataset.auxiliaryPanelSide).toBe("right");
  expect(f.root.hidden).toBe(true);
  f.about();
  await settle();
  f.panelSideToggle();
  expect(f.root.parentElement!.dataset.auxiliaryPanelSide).toBe("right");
  document.querySelector<HTMLButtonElement>(".about-close")!.click();
  f.tabCommand({ action: "select", position: 1 });
  await settle();
  f.setConfiguredSide("left");
  expect(f.root.parentElement!.dataset.auxiliaryPanelSide).toBe("left");
  f.setConfiguredSide("right");
  expect(f.root.parentElement!.dataset.auxiliaryPanelSide).toBe("right");
  f.host.dispose();
  f.panelSideToggle();
  expect(f.root.parentElement!.dataset.auxiliaryPanelSide).toBeUndefined();
});

it("suppresses side commands while About awaits native hide acknowledgement", async () => {
  const f = await fixture();
  f.open("files");
  await companionSettle();
  // Right is the CSS default until an explicit side change.
  const side = () =>
    f.root.parentElement!.dataset.auxiliaryPanelSide ?? "right";
  const hide = deferred<boolean>();
  vi.mocked(f.bridge.present).mockImplementationOnce(() => hide.promise);
  f.about();
  expect(document.querySelector(".about-dialog")).toBeNull();
  expect(vi.mocked(f.bridge.present).mock.lastCall?.[0].id).toBeNull();
  f.panelSideToggle();
  expect(side()).toBe("right");
  hide.resolve(true);
  await companionSettle();
  expect(document.querySelector(".about-dialog")).not.toBeNull();
  f.panelSideToggle();
  expect(side()).toBe("right");
  document.querySelector<HTMLButtonElement>(".about-close")!.click();
  await companionSettle();
  expect(side()).toBe("right");
  f.panelSideToggle();
  expect(side()).toBe("left");
});

it("still applies live configured side changes during pending and visible overlays", async () => {
  const f = await fixture();
  f.open("files");
  await companionSettle();
  const content = f.root.parentElement!;
  const hide = deferred<boolean>();
  vi.mocked(f.bridge.present).mockImplementationOnce(() => hide.promise);
  f.about();
  f.setConfiguredSide("left");
  expect(content.dataset.auxiliaryPanelSide).toBe("left");
  hide.resolve(true);
  await companionSettle();
  expect(document.querySelector(".about-dialog")).not.toBeNull();
  f.setConfiguredSide("right");
  expect(content.dataset.auxiliaryPanelSide).toBe("right");
});

it("moves a suspended panel from a hosted tab without revealing it", async () => {
  const f = await fixture();
  f.toggle();
  await companionSettle();
  f.panelSideToggle();
  expect(f.root.parentElement!.dataset.auxiliaryPanelSide).toBe("left");
  f.open("general", false);
  await companionSettle();
  expect(document.querySelectorAll(".hosted-content-tab")).toHaveLength(1);
  expect(f.root.hidden).toBe(true);
  f.panelSideToggle();
  expect(f.root.parentElement!.dataset.auxiliaryPanelSide).toBe("right");
  expect(f.root.hidden).toBe(true);
  expect(document.querySelectorAll(".hosted-content-tab")).toHaveLength(1);
});
