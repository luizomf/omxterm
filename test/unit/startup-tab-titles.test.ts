// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTerminalWindowTitleController } from "../../src/main/terminal-window-title";
import { mountTerminalWindowPage } from "../../src/renderer/terminal-window-host";
import {
  createElectronTerminalAdapter,
  type ElectronTerminalAdapter,
} from "../../src/renderer/electron-terminal-adapter";
import type { TerminalBridge } from "../../src/shared/terminal-bridge";
import type { TerminalTabCommand } from "../../src/shared/terminal-contract";
import { createFakeSurface } from "../fixtures/terminal-tabs-harness";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}
const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function harness() {
  const titleListeners = new Set<(id: string, title: string) => void>();
  const starts: Array<ReturnType<typeof deferred<string>>> = [];
  const adapters: ElectronTerminalAdapter[] = [];
  const surfaces: ReturnType<typeof createFakeSurface>[] = [];
  let command!: (command: TerminalTabCommand) => void;
  const publish = (id: string, title: string) => {
    for (const listener of titleListeners) listener(id, title);
  };
  const sent = vi.fn(publish);
  const nativeTitle = vi.fn();
  const controller = createTerminalWindowTitleController(
    {
      isFocused: () => false,
      setTitle: nativeTitle,
      on() {},
      removeListener() {},
    },
    {
      fallbackSessionTitle: "synthetic-shell",
      requestAttention: () => () => {},
      sendSessionTitle: sent,
    },
  );
  const sync = vi.fn((id: string) => {
    // The unfixed candidate never requests reconciliation. Keep baseline runs
    // on the original lost-label assertion, not a missing-method exception.
    if ("syncSessionTitle" in controller)
      (controller.syncSessionTitle as (id: string) => void)(id);
  });
  const close = vi.fn((id: string) => controller.sessionEnded(id));
  const bridge = {
    start() {
      const start = deferred<string>();
      starts.push(start);
      controller.sessionStarted(`s${starts.length}`);
      return start.promise;
    },
    onOutput: () => () => {},
    onExit: () => () => {},
    acknowledgeOutput() {},
    input() {},
    resize() {},
    close,
  } as unknown as TerminalBridge;
  const tabStrip = document.createElement("nav");
  const tabsContainer = document.createElement("div");
  document.body.replaceChildren(tabStrip, tabsContainer);
  const host = mountTerminalWindowPage(
    { tabStrip, tabsContainer },
    {
      page: window,
      createAdapter() {
        const adapter = createElectronTerminalAdapter(bridge);
        adapters.push(adapter);
        return adapter;
      },
      async mount(_container, adapter) {
        await adapter.start({ onOutput() {}, onExit() {} });
        const surface = createFakeSurface();
        surface.dispose.mockImplementation(() => adapter.close());
        surfaces.push(surface);
        return surface;
      },
      subscribeToTabTitles(listener) {
        titleListeners.add(listener);
        return () => {
          titleListeners.delete(listener);
        };
      },
      subscribeToTabCommands(listener) {
        command = listener;
        return () => {};
      },
      notifyTabSelection: controller.selectSession,
      syncTabTitle: sync,
    },
  );
  cleanups.push(() => {
    host.dispose();
    controller.dispose();
  });
  return {
    host,
    starts,
    adapters,
    surfaces,
    controller,
    sent,
    sync,
    close,
    nativeTitle,
    titleListeners,
    publish,
    tabsContainer,
    command: (value: TerminalTabCommand) => command(value),
    labels: () =>
      [...tabStrip.querySelectorAll("button")].map((tab) => tab.textContent),
    async finish(index: number) {
      expect(adapters[index]!.sessionId()).toBeUndefined();
      starts[index]!.resolve(`s${index + 1}`);
      await vi.waitFor(() => expect(surfaces).toHaveLength(index + 1));
    },
  };
}

describe("startup title reconciliation through host, real Adapter and tab labels", () => {
  it("delivers the real controller fallback emitted before both start responses", async () => {
    const h = harness();
    expect(h.sent).toHaveBeenCalledWith("s1", "synthetic-shell");
    await h.finish(0);
    await h.host.ready;
    h.command({ action: "new" });
    expect(h.sent).toHaveBeenCalledWith("s2", "synthetic-shell");
    await h.finish(1);
    expect(h.labels()).toEqual(["synthetic-shell", "synthetic-shell"]);
    expect(h.nativeTitle).toHaveBeenLastCalledWith("synthetic-shell");
  });

  it("reconciles the latest sanitized title and BEL, including a background pending tab", async () => {
    const h = harness();
    h.controller.requestTitle("s1", "first\n\u202etitle");
    await h.finish(0);
    await h.host.ready;
    h.command({ action: "new" });
    h.controller.requestTitle("s2", "newer\n\u202etitle");
    h.controller.ringBell("s2");
    h.command({ action: "select", position: 1 });
    await h.finish(1);
    expect(h.labels()).toEqual(["firsttitle", "🔔 newertitle"]);
    expect(h.nativeTitle).toHaveBeenLastCalledWith("firsttitle");
    h.controller.requestTitle("s2", "latest");
    expect(h.labels()).toEqual(["firsttitle", "🔔 latest"]);
  });

  it("never reconciles a removed pending owner or retargets its late title", async () => {
    const h = harness();
    await h.finish(0);
    await h.host.ready;
    h.command({ action: "new" });
    h.command({ action: "close" });
    await h.finish(1);
    expect(h.close).toHaveBeenCalledExactlyOnceWith("s2", undefined);
    expect(h.sync).not.toHaveBeenCalledWith("s2");
    h.publish("s2", "removed");
    h.command({ action: "new" });
    await h.finish(2);
    expect(h.labels()).toEqual(["synthetic-shell", "synthetic-shell"]);
    expect(h.tabsContainer.children).toHaveLength(2);
  });

  it("does not replay a start-time snapshot over an OSC update preceding a delayed sync", async () => {
    const h = harness();
    const pending: string[] = [];
    h.sync.mockImplementation((id) => {
      pending.push(id);
    });
    await h.finish(0);
    await h.host.ready;
    h.command({ action: "new" });
    await h.finish(1);
    h.controller.requestTitle("s1", "first-newer");
    h.controller.requestTitle("s2", "second-newer");
    for (const id of pending) h.controller.syncSessionTitle(id);
    expect(h.labels()).toEqual(["first-newer", "second-newer"]);
  });

  it("unsubscribes and closes exactly once when the first owner is cancelled during start", async () => {
    const h = harness();
    h.host.dispose();
    expect(h.titleListeners.size).toBe(0);
    await h.finish(0);
    await h.host.ready;
    expect(h.sync).not.toHaveBeenCalled();
    expect(h.close).toHaveBeenCalledExactlyOnceWith("s1", undefined);
  });

  it("ignores arbitrary unknown titles rather than replaying retained state into future owners", async () => {
    const h = harness();
    await h.finish(0);
    await h.host.ready;
    for (let index = 2; index < 10_002; index += 1)
      h.publish(`s${index}`, "foreign");
    h.command({ action: "new" });
    h.publish("s2", "foreign");
    await h.finish(1);
    expect(h.labels()).toEqual(["synthetic-shell", "synthetic-shell"]);
    h.host.dispose();
    expect(h.titleListeners.size).toBe(0);
    h.publish("s1", "after-disposal");
    expect(h.sync).toHaveBeenCalledTimes(2);
  });
});
