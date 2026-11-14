// @vitest-environment jsdom
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { URL as NodeURL } from "node:url";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type { BrowserWindow, Session, WebContentsView } from "electron";
import { createIpcHarness } from "../fixtures/terminal-ipc-harness";
import { semanticInputIpc } from "../../src/shared/semantic-input";
import { extensionViewIpc } from "../../src/shared/extension-view";
import { formatFilePathInsertion } from "../../src/shared/file-path-insertion";
import { createSemanticInputBridge } from "../../src/preload/semantic-input-bridge";
import { createSemanticInput } from "../../src/renderer/semantic-input";
import { subscribeNativeSemanticInput } from "../../src/renderer/native-semantic-input";
import { registerSemanticInputIpc } from "../../src/main/semantic-input-ipc";
import type { SnippetTarget } from "../../src/renderer/snippet-target";

vi.mock("electron", () => ({
  WebContentsView: class {},
  session: {},
  protocol: {},
}));
import { createExtensionViewHost } from "../../src/main/extension-view-host";

let preloadSource = "";
beforeAll(async () => {
  preloadSource = await readFile(
    new NodeURL("../../src/preload/extension-view.cjs", import.meta.url),
    "utf8",
  );
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  document.body.replaceChildren();
});

const pathAction = {
  operation: "terminal.insertPath.v1",
  path: "/first/file name",
};
const presentation = (id: string | null, revision: number) => ({
  id,
  revision,
  bounds: { x: 0, y: 0, width: 400, height: 400 },
  focus: false,
});

type ChildBridge = {
  request(value: unknown, ignored?: unknown): Promise<unknown>;
};
type QueuedRequest = { args: unknown[]; run(): void };

async function fixture() {
  const mainIpc = createIpcHarness();
  const coreHandlers = new Map<
    string,
    (event: unknown, value: unknown) => void
  >();
  const childHandlers = new Map<
    string,
    (event: unknown, value: unknown) => void
  >();
  const childMessages: { channel: string; value: unknown }[] = [];
  const coreMessages: { channel: string; value: unknown }[] = [];
  const requests: QueuedRequest[] = [];
  let rendererRevision = 7;
  let selected = "first";
  let bridge!: ChildBridge;
  let invokeHandler!: (event: unknown, ...args: unknown[]) => Promise<unknown>;
  const ownerContents = Object.assign(new EventEmitter(), {
    mainFrame: {},
    isDestroyed: () => false,
    isFocused: () => true,
    getOSProcessId: () => 100,
    getZoomFactor: () => 1,
    focus: vi.fn(),
    send: (channel: string, value: unknown) =>
      coreMessages.push({ channel, value }),
  });
  const owner = Object.assign(new EventEmitter(), {
    webContents: ownerContents,
    isDestroyed: () => false,
    isFocused: () => true,
    isVisible: vi.fn(() => true),
    isMinimized: vi.fn(() => false),
    getContentSize: () => [800, 600],
    contentView: { addChildView() {}, removeChildView() {} },
  });
  const window = owner as unknown as BrowserWindow;
  const coreEvent = {
    sender: ownerContents,
    senderFrame: ownerContents.mainFrame,
  };
  const service = registerSemanticInputIpc({
    ipc: mainIpc.ipcMain,
    trusted: (event) => event.senderFrame === event.sender.mainFrame,
    quitting: () => false,
  });
  service.register(window);
  const publishSelection = (revision: number) =>
    mainIpc.listeners.get(semanticInputIpc.selection)!(coreEvent, revision);
  publishSelection(7); // Snapshot exists before the child is created.
  const targets = {
    first: {
      live: () => true,
      deliver: vi.fn(),
      deliverAndReport: vi.fn(async () => true),
      isCurrent: () => selected === "first",
      onUnavailable: () => () => {},
    },
    second: {
      live: () => true,
      deliver: vi.fn(),
      deliverAndReport: vi.fn(async () => true),
      isCurrent: () => selected === "second",
      onUnavailable: () => () => {},
    },
  };
  const capture = vi.fn<() => SnippetTarget>(
    () => targets[selected as "first" | "second"],
  );
  const focusCapturedTarget = vi.fn();
  const input = createSemanticInput({
    capture,
    blocked: () => false,
    focusTerminal() {},
    focusCapturedTarget,
  });
  const coreBridge = createSemanticInputBridge({
    on: (channel, listener) => {
      coreHandlers.set(channel, listener);
    },
    removeListener: (channel) => {
      coreHandlers.delete(channel);
    },
    send: (channel, value) =>
      mainIpc.listeners.get(channel)?.(coreEvent, value),
  });
  const unsubscribe = subscribeNativeSemanticInput(
    coreBridge,
    input,
    () => rendererRevision,
    () => selected,
  );
  const child = Object.assign(new EventEmitter(), {
    id: 2,
    mainFrame: {},
    ipc: Object.assign(new EventEmitter(), {
      handle: (_channel: string, handler: typeof invokeHandler) => {
        invokeHandler = handler;
      },
    }),
    isDestroyed: () => false,
    isFocused: () => false,
    getOSProcessId: () => 200,
    setWindowOpenHandler() {},
    send: (channel: string, value: unknown) =>
      childMessages.push({ channel, value }),
    loadURL: async () => {
      child.emit("dom-ready");
      child.emit("did-finish-load");
    },
    close: () => child.emit("destroyed"),
  });
  runInNewContext(preloadSource, {
    process: { isMainFrame: true },
    require: () => ({
      contextBridge: {
        exposeInMainWorld: (_name: string, exposed: ChildBridge) => {
          bridge = exposed;
        },
      },
      ipcRenderer: {
        on: (
          channel: string,
          handler: (event: unknown, value: unknown) => void,
        ) => childHandlers.set(channel, handler),
        invoke: (_channel: string, ...args: unknown[]) =>
          new Promise((resolve, reject) => {
            // Model Electron's invocation-time structured clone, not a later read
            // from mutable package/preload objects.
            const captured = structuredClone(args);
            requests.push({
              args: captured,
              run: () => {
                void invokeHandler(
                  { sender: child, senderFrame: child.mainFrame },
                  ...captured,
                ).then(resolve, reject);
              },
            });
          }),
      },
    }),
  });
  const session = Object.assign(new EventEmitter(), {
    protocol: { handle() {}, unhandle() {} },
    webRequest: { onBeforeRequest() {} },
    setPermissionCheckHandler() {},
    setPermissionRequestHandler() {},
    setDevicePermissionHandler() {},
    closeAllConnections: async () => {},
    clearData: async () => {},
    clearCache: async () => {},
    clearAuthCache: async () => {},
  });
  let admissionGate: Promise<void> | undefined;
  const admit = vi.fn(async (_signal: AbortSignal, commit: () => void) => {
    if (admissionGate) await admissionGate;
    commit();
  });
  const host = createExtensionViewHost({
    owner: window,
    preloadPath: "/app/preload.cjs",
    resources: { read: async () => new Uint8Array(), release: async () => {} },
    contentSlot: () => ({ x: 0, y: 0, width: 800, height: 600 }),
    runtime: {
      fromPartition: () => session as unknown as Session,
      createView: () =>
        ({
          webContents: child,
          setVisible() {},
          setBounds() {},
          setBackgroundColor() {},
        }) as unknown as WebContentsView,
    },
    subscribeSelection: (listener) =>
      service.subscribeSelection(window, listener),
    onRequest: async (value, signal, context) => {
      if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        value.operation !== "terminal.insertPath.v1"
      )
        return { ok: true };
      const text = formatFilePathInsertion([value.path], "linux");
      if (!text) throw new Error("invalid path");
      return service.request(
        window,
        {
          operation: "terminal.semanticInput.v1",
          text,
          title: "File path",
          intent: "insert",
        },
        context,
        signal,
        admit,
        true,
      );
    },
  });
  cleanups.push(async () => {
    unsubscribe();
    input.dispose();
    await host.retire();
    service.dispose();
  });
  const view = await host.open({ entryResource: "index.html", title: "Files" });
  const deliverChild = (channel?: string) => {
    for (let i = 0; i < childMessages.length;) {
      const message = childMessages[i]!;
      if (channel && message.channel !== channel) {
        i++;
        continue;
      }
      childMessages.splice(i, 1);
      childHandlers.get(message.channel)?.({}, message.value);
    }
  };
  const deliverCore = () => {
    for (const message of coreMessages.splice(0))
      coreHandlers.get(message.channel)?.({}, message.value);
  };
  const dispatch = async () => {
    const request = requests.shift();
    if (!request) throw new Error("Missing child request");
    request.run();
    await Promise.resolve();
  };
  const reveal = () => host.present(presentation(view.id, 1));
  return {
    bridge,
    child,
    childMessages,
    coreMessages,
    requests,
    host,
    view,
    owner,
    service,
    targets,
    capture,
    focusCapturedTarget,
    admit,
    publishSelection,
    deliverChild,
    deliverCore,
    dispatch,
    reveal,
    setRenderer(revision: number, pane: "first" | "second") {
      rendererRevision = revision;
      selected = pane;
    },
    holdAdmission(gate: Promise<void>) {
      admissionGate = gate;
    },
    invokeNative(event: unknown, ...args: unknown[]) {
      return invokeHandler(event, ...args);
    },
    emitChild(channel: string, value: unknown) {
      childHandlers.get(channel)?.({}, value);
    },
  };
}

it("replays the preexisting owner selection on load and privately stamps a valid exact-target action", async () => {
  const f = await fixture();
  expect(f.childMessages).toContainEqual({
    channel: extensionViewIpc.actionSelection,
    value: 7,
  });
  await f.reveal();
  f.deliverChild();
  const pending = f.bridge.request(pathAction, {
    selectionRevision: 999,
    admissionGeneration: 999,
  });
  expect(f.requests[0]!.args).toEqual([
    pathAction,
    { selectionRevision: 7, admissionGeneration: 0 },
  ]);
  await f.dispatch();
  expect(f.coreMessages[0]!.value).toMatchObject({
    kind: "request",
    revision: 7,
    waitForDelivery: true,
  });
  f.deliverCore();
  await expect(pending).resolves.toEqual({ ok: true });
  expect(f.capture).toHaveBeenCalledOnce();
  expect(f.targets.first.deliverAndReport).toHaveBeenCalledExactlyOnceWith(
    "'/first/file name'",
  );
  expect(f.focusCapturedTarget).toHaveBeenCalledExactlyOnceWith(
    f.targets.first,
    f.view.id,
  );
});

it("refuses when the child acts at 7 but main receives selection 8 first", async () => {
  const f = await fixture();
  await f.reveal();
  f.deliverChild();
  const pending = f.bridge.request(pathAction);
  f.setRenderer(8, "second");
  f.publishSelection(8);
  f.deliverChild(extensionViewIpc.actionSelection);
  // Even a later child update cannot rewrite the already invoked action.
  expect(f.requests[0]!.args[1]).toEqual({
    selectionRevision: 7,
    admissionGeneration: 0,
  });
  await f.dispatch();
  await expect(pending).resolves.toEqual({
    ok: false,
    reason: "terminal-unavailable",
  });
  expect(f.admit).not.toHaveBeenCalled();
  expect(f.coreMessages).toEqual([]);
  expect(f.capture).not.toHaveBeenCalled();
});

it("refuses in the core renderer when main still has 7 but the renderer already selected 8", async () => {
  const f = await fixture();
  await f.reveal();
  f.deliverChild();
  const pending = f.bridge.request(pathAction);
  f.setRenderer(8, "second"); // Main's selection IPC has not arrived yet.
  await f.dispatch();
  expect(f.coreMessages[0]!.value).toMatchObject({
    kind: "request",
    revision: 7,
  });
  f.deliverCore();
  await expect(pending).resolves.toEqual({
    ok: false,
    reason: "terminal-not-completed",
  });
  expect(f.capture).not.toHaveBeenCalled();
  expect(f.targets.second.deliverAndReport).not.toHaveBeenCalled();
});

it("never revives an action hidden and revealed before its request reaches main", async () => {
  const f = await fixture();
  await f.reveal();
  f.deliverChild();
  const pending = f.bridge.request(pathAction);
  await f.host.present(presentation(null, 2));
  await f.host.present(presentation(f.view.id, 3));
  // The child has not received either new visibility generation yet.
  await f.dispatch();
  await expect(pending).resolves.toEqual({
    ok: false,
    reason: "terminal-unavailable",
  });
  expect(f.admit).not.toHaveBeenCalled();
  expect(f.capture).not.toHaveBeenCalled();
  f.deliverChild();
  const fresh = f.bridge.request(pathAction);
  expect(f.requests[0]!.args[1]).toEqual({
    selectionRevision: 7,
    admissionGeneration: 1,
  });
  await f.dispatch();
  f.deliverCore();
  await expect(fresh).resolves.toEqual({ ok: true });
});

it("refuses hide/reveal after receipt but before asynchronous admission commits", async () => {
  const f = await fixture();
  await f.reveal();
  f.deliverChild();
  let release!: () => void;
  f.holdAdmission(
    new Promise<void>((resolve) => {
      release = resolve;
    }),
  );
  const pending = f.bridge.request(pathAction);
  const refused = expect(pending).resolves.toHaveProperty("ok", false);
  await f.dispatch();
  expect(f.admit).toHaveBeenCalledOnce();
  await f.host.present(presentation(null, 2));
  await f.host.present(presentation(f.view.id, 3));
  release();
  await refused;
  expect(f.coreMessages).toEqual([]);
  expect(f.capture).not.toHaveBeenCalled();
});

it.each(["hide", "minimize"] as const)(
  "revokes gestures across window %s/reveal and admits only a fresh observation",
  async (mode) => {
    const f = await fixture();
    await f.reveal();
    f.deliverChild();
    const old = f.bridge.request(pathAction);
    if (mode === "hide") f.owner.isVisible.mockReturnValue(false);
    else f.owner.isMinimized.mockReturnValue(true);
    f.owner.emit(mode);
    f.deliverChild();
    f.emitChild(extensionViewIpc.actionAdmission, {
      generation: 0,
      visible: true,
    });
    const hidden = f.bridge.request(pathAction);
    expect(f.requests[1]!.args[1]).toEqual({
      selectionRevision: 7,
      admissionGeneration: undefined,
    });
    if (mode === "hide") f.owner.isVisible.mockReturnValue(true);
    else f.owner.isMinimized.mockReturnValue(false);
    f.owner.emit(mode === "hide" ? "show" : "restore");
    await f.dispatch();
    await expect(old).resolves.toEqual({
      ok: false,
      reason: "terminal-unavailable",
    });
    await f.dispatch();
    await expect(hidden).resolves.toEqual({
      ok: false,
      reason: "terminal-unavailable",
    });
    f.deliverChild();
    const fresh = f.bridge.request(pathAction);
    expect(f.requests[0]!.args[1]).toEqual({
      selectionRevision: 7,
      admissionGeneration: 1,
    });
    await f.dispatch();
    f.deliverCore();
    await expect(fresh).resolves.toEqual({ ok: true });
    expect(f.targets.first.deliverAndReport).toHaveBeenCalledOnce();
  },
);

it("keeps an action valid across same-view geometry refresh", async () => {
  const f = await fixture();
  await f.reveal();
  f.deliverChild();
  const pending = f.bridge.request(pathAction);
  await f.host.present({
    ...presentation(f.view.id, 2),
    bounds: { x: 20, y: 20, width: 300, height: 300 },
  });
  await f.dispatch();
  f.deliverCore();
  await expect(pending).resolves.toEqual({ ok: true });
  expect(f.targets.first.deliverAndReport).toHaveBeenCalledOnce();
});

it("replays the latest selection after load and ignores stale preload updates", async () => {
  const f = await fixture();
  await f.reveal();
  f.deliverChild();
  f.publishSelection(8);
  f.publishSelection(9);
  f.deliverChild(extensionViewIpc.actionSelection);
  f.emitChild(extensionViewIpc.actionSelection, 7);
  f.emitChild(extensionViewIpc.actionSelection, NaN);
  f.childMessages.length = 0;
  f.child.emit("did-finish-load");
  expect(f.childMessages).toContainEqual({
    channel: extensionViewIpc.actionSelection,
    value: 9,
  });
  f.setRenderer(9, "second");
  const pending = f.bridge.request(pathAction);
  expect(f.requests[0]!.args[1]).toEqual({
    selectionRevision: 9,
    admissionGeneration: 0,
  });
  await f.dispatch();
  f.deliverCore();
  await expect(pending).resolves.toEqual({ ok: true });
  expect(f.targets.first.deliverAndReport).not.toHaveBeenCalled();
  expect(f.targets.second.deliverAndReport).toHaveBeenCalledOnce();
});

it("rejects missing, stale, malformed and foreign-frame stamps before dispatch", async () => {
  const f = await fixture();
  await f.reveal();
  const event = { sender: f.child, senderFrame: f.child.mainFrame };
  for (const args of [
    [],
    [undefined],
    [{ selectionRevision: 7 }],
    [{ selectionRevision: -1, admissionGeneration: 0 }],
    [{ selectionRevision: 7, admissionGeneration: NaN }],
    [{ selectionRevision: 7, admissionGeneration: 1 }],
    [{ selectionRevision: 7, admissionGeneration: 0, target: "second" }],
  ])
    await expect(f.invokeNative(event, pathAction, ...args)).resolves.toEqual({
      ok: false,
      reason: "terminal-unavailable",
    });
  await expect(
    f.invokeNative(event, pathAction, {
      selectionRevision: 6,
      admissionGeneration: 0,
    }),
  ).resolves.toEqual({ ok: false, reason: "terminal-unavailable" });
  await expect(
    f.invokeNative({ ...event, senderFrame: {} }, pathAction, {
      selectionRevision: 7,
      admissionGeneration: 0,
    }),
  ).rejects.toThrow("unavailable");
  await expect(
    f.invokeNative({ ...event, sender: {} }, pathAction, {
      selectionRevision: 7,
      admissionGeneration: 0,
    }),
  ).rejects.toThrow("unavailable");
  expect(f.admit).not.toHaveBeenCalled();
  expect(f.capture).not.toHaveBeenCalled();
  await f.host.retire();
  await expect(
    f.invokeNative(event, pathAction, {
      selectionRevision: 7,
      admissionGeneration: 0,
    }),
  ).rejects.toThrow("unavailable");
});

it("unsubscribes selection publication when the hosted epoch retires", async () => {
  const f = await fixture();
  await f.reveal();
  f.deliverChild();
  await f.host.retire();
  f.childMessages.length = 0;
  f.publishSelection(8);
  expect(f.childMessages).toEqual([]);
});

it("fails closed before initial stamps arrive while ordinary package requests still work", async () => {
  const f = await fixture();
  await f.reveal();
  const pending = f.bridge.request(pathAction);
  expect(f.requests[0]!.args).toEqual([
    pathAction,
    { selectionRevision: undefined, admissionGeneration: undefined },
  ]);
  await f.dispatch();
  await expect(pending).resolves.toEqual({
    ok: false,
    reason: "terminal-unavailable",
  });
  const ordinary = f.bridge.request({ operation: "home" });
  expect(f.requests[0]!.args).toEqual([{ operation: "home" }]);
  await f.dispatch();
  await expect(ordinary).resolves.toEqual({ ok: true });
  const snippet = { operation: "terminal.semanticInput.v1", text: "example" };
  const ordinarySemantic = f.bridge.request(snippet);
  expect(f.requests[0]!.args).toEqual([snippet]);
  await f.dispatch();
  await expect(ordinarySemantic).resolves.toEqual({ ok: true });
  expect(f.capture).not.toHaveBeenCalled();
});
