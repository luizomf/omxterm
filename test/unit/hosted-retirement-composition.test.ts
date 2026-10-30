// @vitest-environment jsdom
import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import type {
  BrowserWindow,
  IpcMain,
  IpcMainInvokeEvent,
  Session,
  WebContentsView,
} from "electron";
vi.mock("electron", () => ({
  WebContentsView: class {},
  session: {},
  protocol: {},
}));
import { startExtensionViewHost } from "../../src/main/extension-view-ipc";
import { createHostedContentBridge } from "../../src/preload/extension-view-bridge";
import { createTabsHarness } from "../fixtures/terminal-tabs-harness";
import { deferred } from "../fixtures/settings-dialog-dom";
import {
  extensionViewIpc,
  type HostedContentPresentation,
} from "../../src/shared/extension-view";

let pid = 0;
class Contents extends EventEmitter {
  mainFrame = {};
  id = ++pid;
  dead = false;
  focused = false;
  isDestroyed = () => this.dead;
  getOSProcessId = () => this.id;
  getZoomFactor = () => 1;
  isFocused = () => this.focused;
  focus = () => {
    this.focused = true;
  };
  send = (channel: string, value: unknown) => {
    this.emit(channel, {}, value);
  };
  setWindowOpenHandler = vi.fn();
  close = vi.fn(); // Native destruction is deliberately held by the test.
  async loadURL() {
    this.emit("did-finish-load");
  }
  destroy() {
    this.dead = true;
    this.emit("destroyed");
  }
}
const owners: { dispose(): void }[] = [];
afterEach(() => {
  owners.splice(0).forEach((owner) => owner.dispose());
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.replaceChildren();
});
const settle = async () => {
  for (let i = 0; i < 40; ++i) await Promise.resolve();
};

// Real renderer selection, preload validation, owner-bound IPC and crash
// retirement. Only native I/O and cross-process delivery are controlled.
it.each([
  { selected: "first", separateTurns: false, geometry: false },
  { selected: "first", separateTurns: true, geometry: false },
  { selected: "first", separateTurns: false, geometry: true },
  { selected: "first", separateTurns: true, geometry: true },
  { selected: "terminal", separateTurns: true, geometry: false },
])(
  "recovers presentation after retirement (selected=$selected, separateTurns=$separateTurns, geometry=$geometry)",
  async ({ selected, separateTurns, geometry }) => {
    let frame!: FrameRequestCallback;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 60,
      width: 800,
      height: 500,
    } as DOMRect);
    const parent = new Contents();
    const children: Contents[] = [];
    const retired: Array<() => void> = [];
    const send = parent.send;
    parent.send = (channel, value) => {
      if (channel === extensionViewIpc.retired)
        retired.push(() => send(channel, value));
      else send(channel, value);
    };
    const owner = Object.assign(new EventEmitter(), {
      webContents: parent,
      isDestroyed: () => false,
      isFocused: () => true,
      isVisible: () => true,
      isMinimized: () => false,
      getContentSize: () => [800, 600],
      contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
    });
    const handlers = new Map<
      string,
      (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
    >();
    const ipc = {
      handle: (
        channel: string,
        listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
      ) => handlers.set(channel, listener),
      removeHandler: (channel: string) => handlers.delete(channel),
    } as unknown as IpcMain;
    const requests: Array<{
      input: HostedContentPresentation;
      error?: string;
    }> = [];
    const bridge = createHostedContentBridge({
      on: (channel, listener) => parent.on(channel, listener),
      removeListener: (channel, listener) =>
        parent.removeListener(channel, listener),
      invoke: async (channel, ...args) => {
        const receipt = {
          input: args[0] as HostedContentPresentation,
        } as (typeof requests)[number];
        if (channel === extensionViewIpc.present) requests.push(receipt);
        try {
          return await handlers.get(channel)!(
            {
              sender: parent,
              senderFrame: parent.mainFrame,
            } as unknown as IpcMainInvokeEvent,
            ...args,
          );
        } catch (error) {
          receipt.error = (error as Error).message;
          throw error;
        }
      },
    });
    const session = Object.assign(new EventEmitter(), {
      protocol: { handle: vi.fn(), unhandle: vi.fn() },
      webRequest: { onBeforeRequest: vi.fn() },
      setPermissionCheckHandler: vi.fn(),
      setPermissionRequestHandler: vi.fn(),
      setDevicePermissionHandler: vi.fn(),
      closeAllConnections: async () => {},
      clearData: async () => {},
      clearCache: async () => {},
      clearAuthCache: async () => {},
    });
    const release = vi.fn(async () => {});
    const hostOptions = {
      owner: owner as unknown as BrowserWindow,
      ipcMain: ipc,
      preloadPath: "/app/extension-view.cjs",
      resources: { read: async () => new Uint8Array(), release },
      contentSlot: () => ({ x: 0, y: 60, width: 800, height: 500 }),
      runtime: {
        fromPartition: () => session as unknown as Session,
        createView: () => {
          const child = new Contents();
          child.close.mockImplementation(() => child.destroy());
          children.push(child);
          return {
            webContents: child,
            setVisible: vi.fn(),
            setBackgroundColor: vi.fn(),
            setBounds: vi.fn(),
          } as unknown as WebContentsView;
        },
      },
    };
    const host = startExtensionViewHost(hostOptions);
    let next: ReturnType<typeof startExtensionViewHost> | undefined;
    const h = createTabsHarness({ tabsOptions: { hostedContent: bridge } });
    owners.push(h.tabs);
    try {
      await h.tabs.ready;
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
        x: 0,
        y: 60,
        width: 800,
        height: 500,
      } as DOMRect);
      await host.open({ title: "First", entryResource: "index.html" });
      await settle();
      const second = await host.open({
        title: "Second",
        entryResource: "index.html",
      });
      await settle();
      h.tabs.handleCommand({
        action: "select",
        position: selected === "first" ? 2 : 1,
      });
      await settle();
      expect(requests.filter((receipt) => receipt.error)).toEqual([]);
      expect(document.querySelector('[role="status"]')?.textContent ?? "").toBe(
        "",
      );
      requests.length = 0;
      children[0]!.emit("render-process-gone", {}, { reason: "killed" });
      expect(await host.retire()).toEqual({ status: "settled" });
      expect(children.every((child) => child.dead)).toBe(true);
      expect(release).toHaveBeenCalledOnce();
      expect(retired).toHaveLength(2);
      if (geometry) {
        // Native #746: a layout request rejects before either retirement arrives.
        window.dispatchEvent(new Event("resize"));
        frame(0);
        await settle();
        expect(requests[0]).toMatchObject({ error: "Unknown hosted content" });
        expect(
          document.querySelector('[role="status"]')?.textContent,
        ).toContain("could not");
        const blocked = vi.fn();
        h.tabs.openOverlay(blocked);
        await settle();
        expect(blocked).not.toHaveBeenCalled();
      }
      retired.shift()!();
      if (separateTurns) await settle();
      retired.shift()!();
      await settle();
      expect(document.querySelectorAll(".hosted-content-tab")).toHaveLength(0);
      expect(h.tabs.isTerminalSelected()).toBe(true);
      expect(h.surfaces[0]!.dispose).not.toHaveBeenCalled();
      const errors = requests.filter((receipt) => receipt.error);
      expect(errors).toHaveLength(
        (selected === "first" ? 1 : 0) + (geometry ? 1 : 0),
      );
      if (selected === "first")
        expect(errors.at(-1)).toMatchObject({
          input: { id: null, activeId: second.id },
          error: "Unknown active hosted content",
        });
      expect(document.querySelector('[role="status"]')?.textContent ?? "").toBe(
        "",
      );
      const open = vi.fn();
      h.tabs.openOverlay(open);
      await settle();
      expect(open).toHaveBeenCalledOnce();
      next = startExtensionViewHost(hostOptions);
      const fresh = await next.open({
        title: "Fresh epoch",
        entryResource: "index.html",
      });
      await settle();
      expect(requests.at(-1)?.input.id).toBe(fresh.id);
      expect(requests.at(-1)?.error).toBeUndefined();
      expect(children[2]!.focused).toBe(true);
      const nextOverlay = vi.fn();
      h.tabs.openOverlay(nextOverlay);
      await settle();
      expect(nextOverlay).toHaveBeenCalledOnce();
      expect(requests.at(-1)?.input.id).toBe(fresh.id);
    } finally {
      await next?.retire();
      await host.retire();
      parent.destroy();
    }
  },
);

it.each([
  ...[false, true].flatMap((reject) =>
    [false, true].map((crash) => ({ reject, crash, timeout: "none" })),
  ),
  ...["destruction", "release"].flatMap((timeout) =>
    [false, true].map((crash) => ({ reject: false, crash, timeout })),
  ),
])(
  "keeps final ownership through destruction and release (reject=$reject, crash=$crash, timeout=$timeout)",
  async ({ reject, crash, timeout }) => {
    if (timeout !== "none") vi.useFakeTimers();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 60,
      width: 800,
      height: 500,
    } as DOMRect);
    const parent = new Contents();
    const child = new Contents();
    const owner = Object.assign(new EventEmitter(), {
      webContents: parent,
      isDestroyed: () => false,
      getContentSize: () => [800, 600],
      contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
    });
    const handlers = new Map<
      string,
      (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
    >();
    const ipc = {
      handle: (
        channel: string,
        listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
      ) => handlers.set(channel, listener),
      removeHandler: (channel: string) => handlers.delete(channel),
    } as unknown as IpcMain;
    const bridge = createHostedContentBridge({
      on: (channel, listener) => parent.on(channel, listener),
      removeListener: (channel, listener) =>
        parent.removeListener(channel, listener),
      invoke: async (channel, ...args) =>
        handlers.get(channel)!(
          {
            sender: parent,
            senderFrame: parent.mainFrame,
          } as unknown as IpcMainInvokeEvent,
          ...args,
        ),
    });
    const session = Object.assign(new EventEmitter(), {
      protocol: { handle: vi.fn(), unhandle: vi.fn() },
      webRequest: { onBeforeRequest: vi.fn() },
      setPermissionCheckHandler: vi.fn(),
      setPermissionRequestHandler: vi.fn(),
      setDevicePermissionHandler: vi.fn(),
      closeAllConnections: async () => {},
      clearData: async () => {},
      clearCache: async () => {},
      clearAuthCache: async () => {},
    });
    const pin = deferred<void>();
    const release = vi.fn(async () => {
      await pin.promise;
      if (reject) throw new Error("Pin release unknown");
    });
    const host = startExtensionViewHost({
      owner: owner as unknown as BrowserWindow,
      ipcMain: ipc,
      preloadPath: "/app/extension-view.cjs",
      resources: { read: async () => new Uint8Array(), release },
      contentSlot: () => ({ x: 0, y: 60, width: 800, height: 500 }),
      runtime: {
        fromPartition: () => session as unknown as Session,
        createView: () =>
          ({
            webContents: child,
            setVisible: vi.fn(),
            setBackgroundColor: vi.fn(),
            setBounds: vi.fn(),
          }) as unknown as WebContentsView,
      },
    });
    const notifyEmpty = vi.fn();
    const h = createTabsHarness({
      tabsOptions: { hostedContent: bridge, notifyEmpty },
    });
    owners.push(h.tabs);
    try {
      await h.tabs.ready;
      await host.open({
        title: "Captured package",
        entryResource: "index.html",
      });
      await settle();
      h.tabs.handleCommand({ action: "select", position: 1 });
      await settle();
      h.tabs.handleCommand({ action: "close" }); // Remove the original terminal, not the hosted tab.
      await settle();
      expect(document.querySelectorAll(".hosted-content-tab")).toHaveLength(1);
      if (crash) child.emit("render-process-gone", {}, { reason: "crashed" });
      else h.tabs.handleCommand({ action: "close" });
      await settle();
      expect(child.close).toHaveBeenCalledOnce();
      expect(release).not.toHaveBeenCalled();
      expect(document.querySelectorAll(".hosted-content-tab")).toHaveLength(1);
      expect(notifyEmpty).not.toHaveBeenCalled();
      if (timeout === "destruction")
        // Requested close first bounds its own destruction join, then retires.
        await vi.advanceTimersByTimeAsync(crash ? 5001 : 10001);
      child.destroy();
      await settle();
      expect(release).toHaveBeenCalledOnce();
      if (timeout === "release") await vi.advanceTimersByTimeAsync(5001);
      expect(document.querySelectorAll(".hosted-content-tab")).toHaveLength(1);
      expect(notifyEmpty).not.toHaveBeenCalled();
      pin.resolve();
      const outcome = await host.retire();
      await settle();
      expect(outcome.status).toBe(
        reject || timeout !== "none" ? "failed" : "settled",
      );
      if (timeout !== "none")
        expect(outcome).toEqual({ status: "failed", reason: "timeout" });
      if (reject || timeout !== "none") {
        expect(document.querySelectorAll(".hosted-content-tab")).toHaveLength(
          1,
        );
        expect(
          document.querySelector('[role="status"]')?.textContent,
        ).toContain("Close the window");
        expect(notifyEmpty).not.toHaveBeenCalled();
      } else {
        expect(document.querySelectorAll(".hosted-content-tab")).toHaveLength(
          0,
        );
        expect(notifyEmpty).toHaveBeenCalledOnce();
      }
      expect(release).toHaveBeenCalledOnce();
    } finally {
      child.destroy();
      pin.resolve();
      await host.retire();
      parent.destroy();
    }
  },
);
