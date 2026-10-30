import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { createHostedContentBridge } from "../../src/preload/extension-view-bridge";
import {
  extensionViewIpc,
  isHostedContentDescriptor,
  isHostedContentPresentation,
} from "../../src/shared/extension-view";

const presentation = {
  id: null,
  revision: 1,
  bounds: { x: 0, y: 40, width: 800, height: 500 },
  focus: false,
};
describe("hosted application-tab contract", () => {
  it("rejects extra fields, unsafe numbers, unbounded titles and arbitrary identities", () => {
    expect(isHostedContentDescriptor({ id: "host-1", title: "Files" })).toBe(
      true,
    );
    expect(
      isHostedContentDescriptor({
        id: "host-1",
        title: "Files",
        presentation: "panel",
      }),
    ).toBe(true);
    for (const descriptor of [
      { id: "a", title: "Files", presentation: "arbitrary" },
      { id: "a", title: "Files", presentation: "panel", extra: true },
      { id: "../path", title: "Files" },
      { id: "a", title: "x".repeat(161) },
      { id: "a", title: "a\n" },
      { id: "a", title: "A", url: "file:///private" },
    ])
      expect(isHostedContentDescriptor(descriptor)).toBe(false);
    expect(isHostedContentPresentation(presentation)).toBe(true);
    expect(
      isHostedContentPresentation({
        ...presentation,
        id: "host-1",
        focus: "core",
      }),
    ).toBe(true);
    expect(
      isHostedContentPresentation({
        ...presentation,
        id: "host-1",
        focus: "restore",
        activeId: "host-1",
      }),
    ).toBe(true);
    expect(
      isHostedContentPresentation({ ...presentation, activeId: "host-1" }),
    ).toBe(true);
    expect(
      isHostedContentPresentation({ ...presentation, activeId: null }),
    ).toBe(true);
    for (const activeId of [undefined, "../foreign", "", 1, true, {}])
      expect(isHostedContentPresentation({ ...presentation, activeId })).toBe(
        false,
      );
    expect(
      isHostedContentPresentation({
        ...presentation,
        activeId: "host-1",
        extra: true,
      }),
    ).toBe(false);
    for (const focus of ["core", "restore", "child", null, 1])
      expect(isHostedContentPresentation({ ...presentation, focus })).toBe(
        false,
      );
    for (const revision of [
      0,
      -1,
      Infinity,
      NaN,
      Number.MAX_SAFE_INTEGER + 1,
      1.5,
    ])
      expect(isHostedContentPresentation({ ...presentation, revision })).toBe(
        false,
      );
    for (const width of [-1, Infinity, NaN, 100_001, "1"])
      expect(
        isHostedContentPresentation({
          ...presentation,
          bounds: { ...presentation.bounds, width },
        }),
      ).toBe(false);
    expect(isHostedContentPresentation({ ...presentation, pageZoom: 2 })).toBe(
      false,
    );
    expect(
      isHostedContentPresentation({
        ...presentation,
        bounds: { ...presentation.bounds, extra: 1 },
      }),
    ).toBe(false);
  });

  it("accepts a recoverable refusal only for a core-focus presentation", async () => {
    const bridge = createHostedContentBridge({
      invoke: vi.fn(async () => "focus-unavailable"),
      on: vi.fn(),
      removeListener: vi.fn(),
    });
    await expect(
      bridge.present({ ...presentation, id: "ssh", focus: "core" }),
    ).resolves.toBe("focus-unavailable");
    await expect(bridge.present(presentation)).rejects.toThrow(
      "Invalid hosted presentation result",
    );
  });

  it("validates native focus notifications and removes its subscription", () => {
    let handler:
      ((event: Electron.IpcRendererEvent, value: unknown) => void) | undefined;
    const transport = {
      invoke: vi.fn(),
      on: vi.fn((_channel: string, listener: typeof handler) => {
        handler = listener;
      }),
      removeListener: vi.fn(),
    };
    const bridge = createHostedContentBridge(transport);
    const focus = vi.fn();
    const remove = bridge.onFocus!(focus);
    for (const value of ["host-1", null, {}, "../bad", undefined])
      handler!({} as Electron.IpcRendererEvent, value);
    expect(focus.mock.calls).toEqual([["host-1"], [null]]);
    remove();
    expect(transport.removeListener).toHaveBeenCalledWith(
      extensionViewIpc.focus,
      handler,
    );
  });

  it("validates native companion dismissals and removes the listener", () => {
    let handler!: (event: Electron.IpcRendererEvent, value: unknown) => void;
    const transport = {
      invoke: vi.fn(),
      on: vi.fn((_channel: string, listener: typeof handler) => {
        handler = listener;
      }),
      removeListener: vi.fn(),
    };
    const bridge = createHostedContentBridge(transport);
    const dismiss = vi.fn();
    const remove = bridge.onDismissPanel!(dismiss);
    for (const value of ["ssh", null, {}, "../bad", undefined])
      handler({} as Electron.IpcRendererEvent, value);
    expect(dismiss.mock.calls).toEqual([["ssh"]]);
    remove();
    expect(transport.removeListener).toHaveBeenCalledWith(
      extensionViewIpc.dismissPanel,
      handler,
    );
  });

  it("validates incoming events and acknowledgments, with removable listeners", async () => {
    const handlers = new Map<
      string,
      (event: Electron.IpcRendererEvent, value: unknown) => void
    >();
    const transport = {
      invoke: vi.fn(
        async (_channel: string, ..._args: unknown[]): Promise<unknown> => true,
      ),
      on: vi.fn(
        (
          channel: string,
          handler: (event: Electron.IpcRendererEvent, value: unknown) => void,
        ) => handlers.set(channel, handler),
      ),
      removeListener: vi.fn((channel: string, _handler: unknown) =>
        handlers.delete(channel),
      ),
    };
    const bridge = createHostedContentBridge(transport);
    const opened = vi.fn();
    const retired = vi.fn();
    const offOpen = bridge.onOpen(opened);
    const offRetired = bridge.onRetired(retired);
    const failed = vi.fn();
    const offFailure = bridge.onFailure(failed);
    const event = {} as Electron.IpcRendererEvent;
    handlers.get(extensionViewIpc.open)!(event, {
      id: "a",
      title: "A",
      path: "/private",
    });
    handlers.get(extensionViewIpc.retired)!(event, "../x");
    expect(opened).not.toHaveBeenCalled();
    expect(retired).not.toHaveBeenCalled();
    handlers.get(extensionViewIpc.failure)!(event, { path: "/private" });
    handlers.get(extensionViewIpc.failure)!(event, false);
    expect(failed).not.toHaveBeenCalled();
    handlers.get(extensionViewIpc.failure)!(event, true);
    expect(failed).toHaveBeenCalledOnce();
    handlers.get(extensionViewIpc.open)!(event, { id: "a", title: "A" });
    handlers.get(extensionViewIpc.retired)!(event, "a");
    expect(opened).toHaveBeenCalledWith({ id: "a", title: "A" });
    expect(retired).toHaveBeenCalledWith("a");
    expect(await bridge.present(presentation)).toBe(true);
    expect(transport.invoke).toHaveBeenCalledWith(
      extensionViewIpc.present,
      presentation,
    );
    transport.invoke.mockResolvedValue("true");
    await expect(bridge.present(presentation)).rejects.toThrow("result");
    await expect(
      bridge.present({ ...presentation, revision: 0 }),
    ).rejects.toThrow("Invalid");
    await expect(bridge.close("../x")).rejects.toThrow("Invalid");
    transport.invoke.mockResolvedValue(undefined);
    await bridge.close("a");
    offOpen();
    offRetired();
    offFailure();
    expect(handlers.size).toBe(0);
  });
});

describe("hosted child preload subscriptions and requests", () => {
  it("executes the actual child preload with bounded own-view requests and visibility", async () => {
    const source = await readFile(
      new URL("../../src/preload/extension-view.cjs", import.meta.url),
      "utf8",
    );
    const expose = vi.fn<
      (
        _name: string,
        bridge: {
          onVisibility(listener: unknown): () => void;
          onAppearance(listener: unknown): () => void;
          onActivity(listener: unknown): () => void;
          onLanguage(listener: unknown): () => void;
          onFocusIntent(listener: unknown): () => void;
          request(value: unknown): Promise<unknown>;
        },
      ) => void
    >();
    const on =
      vi.fn<
        (
          _channel: string,
          handler: (event: object, value: unknown) => void,
        ) => void
      >();
    let finish!: (value: unknown) => void;
    const held = new Promise((resolve) => {
      finish = resolve;
    });
    const invoke = vi.fn(() => held);
    const execute = (mainFrame: boolean) => {
      runInNewContext(source, {
        process: { isMainFrame: mainFrame },
        require: (name: string) => {
          expect(name).toBe("electron");
          return {
            contextBridge: { exposeInMainWorld: expose },
            ipcRenderer: { on, invoke },
          };
        },
      });
    };
    execute(false);
    expect(expose).not.toHaveBeenCalled();
    execute(true);
    expect(expose).toHaveBeenCalledTimes(1);
    const [name, bridge] = expose.mock.calls[0]!;
    expect(name).toBe("omxHostedContent");
    expect(Object.keys(bridge).sort()).toEqual([
      "onActivity",
      "onAppearance",
      "onFocusIntent",
      "onLanguage",
      "onVisibility",
      "request",
    ]);
    const subscriptions = [
      {
        subscribe: bridge.onActivity,
        channel: extensionViewIpc.activity,
        initial: false,
        values: [true, false],
        invalid: [null, 1, "true", { active: true }],
        replay: true,
      },
      {
        subscribe: bridge.onLanguage,
        channel: extensionViewIpc.language,
        initial: "en-US",
        values: ["pt-BR", "en-US"],
        invalid: [null, "pt", "fr-FR", { language: "pt-BR" }],
        replay: true,
      },
      {
        subscribe: bridge.onFocusIntent,
        channel: extensionViewIpc.focusIntent,
        initial: undefined,
        values: ["restore", "search"],
        invalid: [null, true, "focus", { intent: "search" }],
        replay: false,
      },
    ];
    for (const subscription of subscriptions) {
      const event = on.mock.calls.find(
        ([channel]) => channel === subscription.channel,
      )![1];
      const listener = vi.fn();
      const off = subscription.subscribe(listener);
      if (subscription.replay)
        expect(listener).toHaveBeenCalledExactlyOnceWith(subscription.initial);
      else expect(listener).not.toHaveBeenCalled();
      listener.mockClear();
      for (const invalid of subscription.invalid) event({}, invalid);
      expect(listener).not.toHaveBeenCalled();
      event({}, subscription.values[0]);
      expect(listener).toHaveBeenCalledExactlyOnceWith(subscription.values[0]);
      const late = vi.fn();
      const offLate = subscription.subscribe(late);
      if (subscription.replay)
        expect(late).toHaveBeenCalledExactlyOnceWith(subscription.values[0]);
      else expect(late).not.toHaveBeenCalled();
      off();
      offLate();
      const offThrowing = subscription.subscribe(() => {
        throw new Error("package listener");
      });
      const survivor = vi.fn();
      const offSurvivor = subscription.subscribe(survivor);
      survivor.mockClear();
      event({}, subscription.values[1]);
      expect(survivor).toHaveBeenCalledExactlyOnceWith(subscription.values[1]);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(late).toHaveBeenCalledTimes(subscription.replay ? 1 : 0);
      offThrowing();
      offSurvivor();
      expect(() => subscription.subscribe(null)).toThrow("Invalid");
      const removals = Array.from({ length: 32 }, () =>
        subscription.subscribe(() => {}),
      );
      expect(() => subscription.subscribe(() => {})).toThrow("Invalid");
      for (const remove of removals) remove();
    }
    const appearanceEvent = on.mock.calls.find(
      ([channel]) => channel === extensionViewIpc.appearance,
    )![1];
    const appearance = vi.fn();
    const offAppearance = bridge.onAppearance(appearance);
    expect(appearance).not.toHaveBeenCalled();
    const snapshot = {
      background: "#102030",
      foreground: "#efefef",
      opacity: 0.25,
    };
    for (const invalid of [
      null,
      [],
      {},
      { ...snapshot, opacity: NaN },
      { ...snapshot, opacity: -1 },
      { ...snapshot, opacity: 2 },
      { ...snapshot, background: "red" },
      { ...snapshot, foreground: "#fff" },
      { ...snapshot, path: "/private" },
    ])
      appearanceEvent({}, invalid);
    expect(appearance).not.toHaveBeenCalled();
    appearanceEvent({}, snapshot);
    expect(appearance).toHaveBeenLastCalledWith(snapshot);
    const replay = vi.fn();
    const offReplay = bridge.onAppearance(replay);
    expect(replay).toHaveBeenCalledExactlyOnceWith(snapshot);
    expect(Object.isFrozen(replay.mock.calls[0]![0])).toBe(true);
    offAppearance();
    offReplay();
    bridge.onAppearance(() => {
      throw new Error("extension callback");
    });
    const later = vi.fn();
    bridge.onAppearance(later);
    appearanceEvent({}, { ...snapshot, opacity: 1 });
    expect(later).toHaveBeenLastCalledWith({ ...snapshot, opacity: 1 });
    expect(appearance).toHaveBeenCalledTimes(1);
    expect(replay).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 30; i++) bridge.onAppearance(() => {});
    expect(() => bridge.onAppearance(() => {})).toThrow("Invalid");
    expect(() => bridge.onAppearance(null)).toThrow("Invalid");
    const calls = Array.from({ length: 32 }, () =>
      bridge.request({ operation: "home" }),
    );
    await expect(bridge.request(null)).rejects.toThrow("capacity");
    expect(invoke).toHaveBeenCalledTimes(32);
    expect(invoke).toHaveBeenLastCalledWith("extension-view:request", {
      operation: "home",
    });
    finish({ ok: true });
    await expect(Promise.all(calls)).resolves.toHaveLength(32);
    const listener = vi.fn();
    const dispose = bridge.onVisibility(listener);
    expect(listener).toHaveBeenLastCalledWith(false);
    const [channel, handler] = on.mock.calls[0]!;
    expect(channel).toBe(extensionViewIpc.visibility);
    handler({}, { visible: true });
    expect(listener).toHaveBeenCalledTimes(1);
    handler({}, true);
    expect(listener).toHaveBeenLastCalledWith(true);
    dispose();
    handler({}, false);
    expect(listener).toHaveBeenCalledTimes(2);
    for (let i = 0; i < 32; i++) bridge.onVisibility(() => {});
    expect(() => bridge.onVisibility(() => {})).toThrow("Invalid");
    expect(() => bridge.onVisibility(null)).toThrow("Invalid");
  });
});
