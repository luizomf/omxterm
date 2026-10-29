/* eslint-disable max-lines -- Keep the shared native adapter and its lifetime/IPC failure matrix together. */
import { EventEmitter } from "node:events";
import { mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  BrowserWindow,
  Session,
  WebContentsView,
  IpcMain,
  IpcMainInvokeEvent,
  WebContentsViewConstructorOptions,
  CustomScheme,
} from "electron";
vi.mock("electron", () => ({
  WebContentsView: class {},
  session: {},
  protocol: {},
}));
import {
  createExtensionViewHost,
  registerExtensionViewScheme,
  type ExtensionViewRuntime,
} from "../../src/main/extension-view-host";
import { extensionResourceLimits } from "../../src/main/extension-view-resources";
import {
  startExtensionViewHost,
  sendExtensionAwareClipboard,
} from "../../src/main/extension-view-ipc";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import {
  extensionViewIpc,
  type HostedContentPresentation,
} from "../../src/shared/extension-view";

it.each([
  [true, true],
  [false, true],
  [true, false],
])(
  "returns native focus only from the selected child of a focused owner (%s, %s)",
  async (windowFocused, childFocused) => {
    const f = await fixture();
    const tab = await f.host!.open({
      entryResource: "index.html",
      title: "SSH",
    });
    await f.host!.present(present(tab.id));
    f.owner.isFocused.mockReturnValue(windowFocused);
    f.views[0]!.webContents.focused = childFocused;
    f.views[0]!.setVisible.mockImplementation((visible: boolean) => {
      if (!visible) f.views[0]!.webContents.focused = false;
    });
    expect(await f.host!.present(present(null, 2))).toBe(true);
    expect(f.owner.webContents.focus).toHaveBeenCalledTimes(
      windowFocused && childFocused ? 1 : 0,
    );
    await f.host!.present(present(null, 3));
    expect(f.owner.webContents.focus).toHaveBeenCalledTimes(
      windowFocused && childFocused ? 1 : 0,
    );
  },
);

it.each([
  [true, true, false, true],
  [true, false, true, true],
  [true, false, false, false],
  [false, true, false, false],
  [false, false, true, false],
])(
  "hands focus to core with the child retained (%s, %s, %s)",
  async (windowFocused, childFocused, coreFocused, accepted) => {
    const f = await fixture();
    const view = await f.host!.open({
      entryResource: "index.html",
      title: "SSH",
    });
    await f.host!.present(present(view.id));
    const child = f.views[0]!;
    child.setVisible.mockClear();
    child.webContents.focus.mockClear();
    f.owner.isFocused.mockReturnValue(windowFocused);
    child.webContents.focused = childFocused;
    f.owner.webContents.focused = coreFocused;
    expect(
      await f.host!.present({ ...present(view.id, 2), focus: "core" }),
    ).toBe(accepted);
    expect(child.setVisible).not.toHaveBeenCalledWith(false);
    expect(child.webContents.focus).not.toHaveBeenCalled();
    expect(f.owner.webContents.focus).toHaveBeenCalledTimes(accepted ? 1 : 0);
    if (accepted) expect(child.setVisible).toHaveBeenCalledWith(true);
    // A late request cannot transfer focus a second time.
    expect(
      await f.host!.present({ ...present(view.id, 2), focus: "core" }),
    ).toBe(false);
    expect(f.owner.webContents.focus).toHaveBeenCalledTimes(accepted ? 1 : 0);
  },
);

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
let sequence = 0;
class Contents extends EventEmitter {
  id = ++sequence;
  mainFrame = {};
  ipc = { handle: vi.fn() };
  dead = false;
  focused = false;
  pid = this.id + 100;
  send = vi.fn();
  copy = vi.fn();
  paste = vi.fn();
  selectAll = vi.fn();
  isDestroyed = () => this.dead;
  isFocused = () => this.focused;
  getOSProcessId = () => this.pid;
  getZoomFactor = () => 1.5;
  focus = vi.fn(() => {
    this.focused = true;
  });
  setWindowOpenHandler = vi.fn();
  loadURL = vi.fn(async (_url: string) => {
    this.emit("dom-ready");
    this.emit("did-finish-load");
  });
  close = vi.fn(() => {
    this.dead = true;
    this.emit("destroyed");
  });
}
const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
async function fixture(createHost = true) {
  const root = await mkdtemp(join(tmpdir(), "omx-view-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "index.html"), "<h1>captured A</h1>");
  await writeFile(join(root, "app.js"), "export const version = 'A';");
  let reads = 0;
  let released = false;
  let hold: Promise<void> | undefined;
  const readStarted = deferred();
  const resourceOwner = {
    read: vi.fn(async (path: string, maxBytes: number, signal: AbortSignal) => {
      if (released) throw new Error("Read after release");
      ++reads;
      const file = await open(join(root, path), "r");
      try {
        const stat = await file.stat();
        if (stat.size > maxBytes) throw new Error("Too large");
        const buffer = new Uint8Array(stat.size); // Bound actual allocation before read.
        await file.read(buffer, 0, buffer.byteLength, 0);
        readStarted.resolve();
        if (hold) await hold; // Deliberately ignore abort until real read settlement.
        if (signal.aborted) throw new Error("Aborted");
        return buffer;
      } finally {
        await file.close();
        --reads;
      }
    }),
    release: vi.fn(async () => {
      expect(reads).toBe(0);
      released = true;
    }),
  };
  const owner = Object.assign(new EventEmitter(), {
    webContents: new Contents(),
    isFocused: vi.fn(() => true),
    isDestroyed: (): boolean => false,
    getContentSize: () => [800, 600],
    contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
  });
  const views: {
    webContents: Contents;
    setVisible: ReturnType<typeof vi.fn>;
    setBounds: ReturnType<typeof vi.fn>;
  }[] = [];
  const ses = Object.assign(new EventEmitter(), {
    protocol: { handle: vi.fn(), unhandle: vi.fn() },
    webRequest: { onBeforeRequest: vi.fn() },
    setPermissionCheckHandler: vi.fn(),
    setPermissionRequestHandler: vi.fn(),
    setDevicePermissionHandler: vi.fn(),
    closeAllConnections: vi.fn(async () => {}),
    clearData: vi.fn(async () => {}),
    clearCache: vi.fn(async () => {}),
    clearAuthCache: vi.fn(async () => {}),
  });
  const native = {
    fromPartition: vi.fn((_partition: string) => ses as unknown as Session),
    createView: vi.fn((_options: WebContentsViewConstructorOptions) => {
      const view = {
        webContents: new Contents(),
        setVisible: vi.fn(),
        setBounds: vi.fn(),
      };
      views.push(view);
      return view as unknown as WebContentsView;
    }),
  } satisfies ExtensionViewRuntime;
  const retired = vi.fn();
  const revoked = vi.fn();
  const state = vi.fn();
  const keybind = vi.fn();
  const options = {
    owner: owner as unknown as BrowserWindow,
    preloadPath: "/app/extension-view.cjs",
    resources: resourceOwner,
    contentSlot: () => ({ x: 0, y: 60, width: 800, height: 540 }),
    runtime: native,
    onRetired: retired,
    onViewRevoked: revoked,
    onState: state,
    onKeybind: keybind,
  };
  const host = createHost ? createExtensionViewHost(options) : undefined;
  if (host) cleanups.push(() => host.retire());
  const request = (path = "app.js") => {
    const [scheme, handler] = ses.protocol.handle.mock.calls[0]! as unknown as [
      string,
      (request: Request) => Promise<Response>,
    ];
    expect(scheme).toBe("omx-extension");
    const url = views[0]!.webContents.loadURL.mock.calls[0]![0];
    return handler(
      new Request(`${url.slice(0, url.lastIndexOf("/"))}/${path}`),
    );
  };
  return {
    host: host!,
    options,
    owner,
    ses,
    views,
    native,
    resourceOwner,
    retired,
    revoked,
    state,
    keybind,
    request,
    root,
    readStarted,
    holdRead(promise: Promise<void>) {
      hold = promise;
    },
  };
}
const opening = { entryResource: "index.html", title: "Files" };
const present = (
  id: string | null,
  revision = 1,
): HostedContentPresentation => ({
  id,
  revision,
  bounds: { x: 0, y: 0, width: 1000, height: 1000 },
  focus: true,
});

describe("native extension host through its production resource interface", () => {
  it("authenticates own-view requests, bounds payloads and rejects replies after retirement", async () => {
    const f = await fixture(false);
    const held = deferred<null>();
    const invoke = vi.fn(
      (_value: unknown, _signal: AbortSignal) => held.promise,
    );
    const host = createExtensionViewHost({ ...f.options, onRequest: invoke });
    cleanups.push(() => host.retire());
    await host.open(opening);
    const contents = f.views[0]!.webContents;
    const [channel, handler] = contents.ipc.handle.mock.calls[0]! as [
      string,
      (event: unknown, ...args: unknown[]) => Promise<unknown>,
    ];
    expect(channel).toBe("extension-view:request");
    await expect(
      handler(
        { sender: f.owner.webContents, senderFrame: contents.mainFrame },
        null,
      ),
    ).rejects.toThrow("unavailable");
    await expect(
      handler({ sender: contents, senderFrame: {} }, null),
    ).rejects.toThrow("unavailable");
    const sender = { sender: contents, senderFrame: contents.mainFrame };
    await expect(handler(sender, Array(257).fill(null))).rejects.toThrow();
    expect(invoke).not.toHaveBeenCalled();
    const pending = handler(sender, { operation: "home" });
    const rejected = expect(pending).rejects.toThrow("unknown");
    await host.retire();
    expect(invoke.mock.calls[0]![1].aborted).toBe(true);
    held.resolve(null);
    await rejected;
    await expect(handler(sender, null)).rejects.toThrow("unavailable");
  });
  it("is lazy, owns hidden views, uses unique ephemeral sessions and secure preferences", async () => {
    const f = await fixture();
    expect(f.native.fromPartition).not.toHaveBeenCalled();
    const a = await f.host.open(opening);
    const b = await f.host.open(opening);
    expect(Object.keys(a).sort()).toEqual(["id", "title"]);
    expect(a.id).not.toBe(b.id);
    expect(f.native.fromPartition).toHaveBeenCalledTimes(1);
    expect(f.native.fromPartition.mock.calls[0]![0]).toMatch(
      /^extension-[a-f0-9-]+$/,
    );
    expect(
      f.views.every((v) =>
        v.setVisible.mock.calls.every(([visible]) => !visible),
      ),
    ).toBe(true);
    const preferences = f.native.createView.mock.calls[0]![0].webPreferences!;
    expect(preferences).toMatchObject({
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      contextIsolation: true,
      sandbox: process.platform !== "linux",
      preload: "/app/extension-view.cjs",
      webviewTag: false,
    });
    const other = await fixture();
    await other.host.open(opening);
    expect(other.native.fromPartition.mock.calls[0]![0]).not.toBe(
      f.native.fromPartition.mock.calls[0]![0],
    );
  });

  it("materializes real captured bytes, bounds concurrent reads and drains late cancellation before release", async () => {
    const f = await fixture();
    await f.host.open(opening);
    const response = await f.request();
    expect(await response.text()).toContain("version = 'A'");
    expect(response.headers.get("content-security-policy")).toContain(
      "worker-src 'none'",
    );
    const barrier = deferred();
    f.holdRead(barrier.promise);
    const pending = Array.from({ length: extensionResourceLimits.reads }, () =>
      f.request(),
    );
    // Admission is synchronous, before the filesystem awaits.
    expect((await f.request()).status).toBe(429);
    const retirement = f.host.retire();
    expect(f.resourceOwner.release).not.toHaveBeenCalled();
    expect((await f.request()).status).toBe(403);
    barrier.resolve();
    expect((await Promise.all(pending)).every((r) => r.status === 410)).toBe(
      true,
    );
    expect(await retirement).toEqual({ status: "settled" });
    expect(f.resourceOwner.release).toHaveBeenCalledTimes(1);
    expect(f.views[0]!.webContents.dead).toBe(true);
    expect(f.ses.closeAllConnections).toHaveBeenCalledTimes(1);
    expect(f.ses.clearData).toHaveBeenCalledTimes(1);
  });

  it("rejects exact-origin path bypasses before reading, and refuses oversize allocation", async () => {
    const f = await fixture();
    await f.host.open(opening);
    expect((await f.request("app.js?x")).status).toBe(403);
    expect(f.resourceOwner.read).not.toHaveBeenCalled();
    await writeFile(
      join(f.root, "big.js"),
      new Uint8Array(extensionResourceLimits.bytes + 1),
    );
    expect((await f.request("big.js")).status).toBe(404);
  });

  it("hides all before selecting, clamps CSS using main page zoom and preserves chrome; old revisions cannot reshow", async () => {
    const f = await fixture();
    const a = await f.host.open(opening);
    const b = await f.host.open(opening);
    expect(await f.host.present(present(a.id))).toBe(true);
    expect(f.views[0]!.setBounds).toHaveBeenLastCalledWith({
      x: 0,
      y: 60,
      width: 800,
      height: 540,
    });
    expect(f.host.clipboard("paste")).toBe(true);
    expect(f.views[0]!.webContents.paste).toHaveBeenCalledTimes(1);
    expect(
      await f.host.present({
        ...present(b.id, 2),
        bounds: { x: 10, y: 50, width: 100, height: 100 },
      }),
    ).toBe(true);
    expect(f.views[1]!.setBounds).toHaveBeenLastCalledWith({
      x: 15,
      y: 75,
      width: 150,
      height: 150,
    });
    expect(f.views[0]!.setVisible).toHaveBeenLastCalledWith(false);
    expect(await f.host.present(present(null, 3))).toBe(true);
    expect(f.views[1]!.setVisible).toHaveBeenLastCalledWith(false);
    expect(f.host.clipboard("copy")).toBe(false);
    expect(await f.host.present(present(a.id, 2))).toBe(false);
    expect(f.views[0]!.setVisible).toHaveBeenLastCalledWith(false);
    expect(f.views[0]!.webContents.close).not.toHaveBeenCalled(); // retained draft
    await f.host.retire();
    expect(await f.host.present(present(a.id, 4))).toBe(false);
  });

  it("binds child keys to the owning window only when selected and focused", async () => {
    const f = await fixture();
    const a = await f.host.open(opening);
    const child = f.views[0]!.webContents;
    child.emit("before-input-event", {}, { key: "a" });
    expect(f.keybind).not.toHaveBeenCalled();
    await f.host.present(present(a.id));
    const event = { preventDefault: vi.fn() };
    child.emit("before-input-event", event, { key: "a" });
    expect(f.keybind).toHaveBeenCalledWith(event, { key: "a" }, f.owner);
    await f.host.present(present(null, 2));
    child.emit("before-input-event", event, { key: "b" });
    expect(f.keybind).toHaveBeenCalledTimes(1);
  });

  it("installs popup/navigation/download/permission and browser request refusal contracts", async () => {
    const f = await fixture();
    await f.host.open(opening);
    const child = f.views[0]!.webContents;
    const popup = child.setWindowOpenHandler.mock.calls[0]![0] as () => unknown;
    expect(popup()).toEqual({ action: "deny" });
    for (const name of [
      "will-navigate",
      "will-frame-navigate",
      "will-redirect",
      "will-attach-webview",
    ]) {
      const event = { preventDefault: vi.fn() };
      child.emit(name, event);
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
    }
    const event = { preventDefault: vi.fn() };
    f.ses.emit("will-download", event);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(
      (f.ses.setPermissionCheckHandler.mock.calls[0]![0] as () => boolean)(),
    ).toBe(false);
    expect(
      (f.ses.setDevicePermissionHandler.mock.calls[0]![0] as () => boolean)(),
    ).toBe(false);
    const permission = vi.fn();
    (
      f.ses.setPermissionRequestHandler.mock.calls[0]![0] as (
        ...args: unknown[]
      ) => void
    )(child, "clipboard-read", permission);
    expect(permission).toHaveBeenCalledWith(false);
    const before = f.ses.webRequest.onBeforeRequest.mock.calls[0]![0] as (
      details: object,
      callback: (result: object) => void,
    ) => void;
    const url = child.loadURL.mock.calls[0]![0];
    for (const [resourceType, target] of [
      ["script", "https://example.invalid/a.js"],
      ["script", "file:///secret"],
      ["script", "blob:opaque"],
      ["xhr", url],
      ["other", url],
      ["subFrame", url],
      ["mainFrame", url],
    ]) {
      const result = vi.fn();
      before({ webContentsId: child.id, resourceType, url: target }, result);
      expect(result).toHaveBeenCalledWith({ cancel: true });
    }
    const schemes = {
      registerSchemesAsPrivileged: vi.fn<(_schemes: CustomScheme[]) => void>(),
    };
    registerExtensionViewScheme(schemes);
    expect(
      schemes.registerSchemesAsPrivileged.mock.calls[0]![0][0]!.privileges,
    ).toEqual({ standard: true, secure: true, corsEnabled: true });
  });
});

describe("epoch lifetime and failure settlement", () => {
  it("preserves field focus during layout and restores it after acknowledged native resize", async () => {
    const f = await fixture();
    const tab = await f.host!.open(opening);
    await f.host!.present(present(tab.id));
    const view = f.views[0]!;
    view.setVisible.mockClear();
    view.webContents.focus.mockClear();
    await f.host!.present({ ...present(tab.id, 2), focus: false });
    expect(view.setVisible).not.toHaveBeenCalledWith(false);
    expect(view.webContents.focus).not.toHaveBeenCalled();
    f.owner.emit("resize", {});
    expect(view.setVisible).toHaveBeenLastCalledWith(false);
    await f.host!.present({ ...present(tab.id, 3), focus: false });
    expect(view.webContents.focus).toHaveBeenCalledOnce();
    await f.host!.present({
      ...present(tab.id, 4),
      bounds: { x: 2000, y: 2000, width: 1, height: 1 },
    });
    expect(view.setVisible).toHaveBeenLastCalledWith(false);
  });
  it("retains lifetime objects when native owner/view getters disappear on close", async () => {
    const f = await fixture();
    await f.host!.open({ entryResource: "index.html", title: "A" });
    const child = f.views[0]!.webContents;
    const parent = f.owner.webContents;
    child.once("destroyed", () =>
      Object.defineProperty(f.views[0], "webContents", {
        get() {
          throw new Error("View closed");
        },
      }),
    );
    f.owner.isDestroyed = () => true;
    Object.defineProperty(f.owner, "webContents", {
      get() {
        throw new Error("Window closed");
      },
    });
    parent.emit("destroyed");
    expect(await f.host!.retire()).toEqual({ status: "settled" });
    expect(child.dead).toBe(true);
  });
  it("tracks OS renderer identity, and one crash retires every epoch view including hidden drafts", async () => {
    const f = await fixture();
    await f.host.open(opening);
    await f.host.open(opening);
    const barrier = deferred();
    f.ses.clearData.mockImplementation(() => barrier.promise);
    const crashed = f.views[0]!.webContents;
    crashed.send.mockClear();
    crashed.send.mockImplementation(() => {
      throw new Error("Render frame disposed while WebContents remains alive");
    });
    crashed.emit("render-process-gone", {}, { reason: "crashed" });
    expect(f.state).toHaveBeenLastCalledWith("retiring", undefined);
    const retirement = f.host.retire();
    await Promise.resolve();
    expect(f.resourceOwner.release).not.toHaveBeenCalled();
    expect(f.revoked).toHaveBeenCalledTimes(2);
    barrier.resolve();
    expect(await retirement).toEqual({ status: "settled" });
    expect(f.views.every((view) => view.webContents.dead)).toBe(true);
    expect(crashed.send).not.toHaveBeenCalled();
    expect(f.views[0]!.setVisible).toHaveBeenCalledWith(false);
    expect(f.retired).toHaveBeenCalledTimes(2);
    expect(f.owner.webContents.dead).toBe(false);
    expect(f.resourceOwner.release).toHaveBeenCalledTimes(1);
  });

  it("failed load keeps the resource owner until actual delayed read settlement", async () => {
    const f = await fixture();
    const barrier = deferred();
    const load = deferred();
    const original = f.native.createView.getMockImplementation()!;
    f.native.createView.mockImplementation((options) => {
      const view = original(options);
      f.views
        .at(-1)!
        .webContents.loadURL.mockImplementation(() => load.promise);
      return view;
    });
    const opened = f.host.open(opening);
    const failure = expect(opened).rejects.toThrow("failed to open");
    f.holdRead(barrier.promise);
    const response = f.request();
    await f.readStarted.promise;
    load.reject(new Error("private path should not escape"));
    await Promise.resolve();
    expect(f.resourceOwner.release).not.toHaveBeenCalled();
    barrier.resolve();
    expect((await response).status).toBe(410);
    await failure;
    expect(f.resourceOwner.release).toHaveBeenCalledTimes(1);
    expect(f.views[0]!.webContents.dead).toBe(true);
  });

  it("pins separate immutable resource owners while hidden views keep importing", async () => {
    const a = await fixture();
    const b = await fixture();
    await writeFile(join(b.root, "app.js"), "export const version = 'B';");
    const da = await a.host.open(opening);
    await b.host.open(opening);
    await a.host.present(present(da.id));
    await a.host.present(present(null, 2));
    expect(await (await a.request()).text()).toContain("version = 'A'");
    expect(await (await b.request()).text()).toContain("version = 'B'");
    expect(a.resourceOwner.release).not.toHaveBeenCalled();
  });

  it("records real renderer PIDs and refuses a terminal-shared renderer domain", async () => {
    const f = await fixture(false);
    const observed = vi.fn();
    const original = f.native.createView.getMockImplementation()!;
    f.native.createView.mockImplementation((options) => {
      const view = original(options);
      f.views.at(-1)!.webContents.pid = f.owner.webContents.pid;
      return view;
    });
    const host = createExtensionViewHost({
      ...f.options,
      onRendererProcess: observed,
    });
    cleanups.push(() => host.retire());
    await expect(host.open(opening)).rejects.toThrow("failed to open");
    expect(observed).toHaveBeenCalledWith(
      expect.any(String),
      f.owner.webContents.pid,
    );
    expect(f.views[0]!.webContents.dead).toBe(true);
    expect(f.owner.webContents.dead).toBe(false);
  });

  it.each(["closed", "did-start-navigation"])(
    "late load completion cannot reopen after owner %s",
    async (eventName) => {
      const f = await fixture();
      const load = deferred();
      const original = f.native.createView.getMockImplementation()!;
      f.native.createView.mockImplementation((options) => {
        const view = original(options);
        f.views
          .at(-1)!
          .webContents.loadURL.mockImplementation(() => load.promise);
        return view;
      });
      const opened = f.host.open(opening);
      const rejected = expect(opened).rejects.toThrow("failed to open");
      if (eventName === "closed") f.owner.emit("closed");
      else
        f.owner.webContents.emit(eventName, {
          isMainFrame: true,
          isSameDocument: false,
        });
      expect(await f.host.retire()).toEqual({ status: "settled" });
      load.resolve();
      await rejected;
      expect(
        f.views[0]!.setVisible.mock.calls.every(([visible]) => !visible),
      ).toBe(true);
    },
  );

  it("resize hides old geometry and session cleanup failure cannot report settlement", async () => {
    const f = await fixture();
    const descriptor = await f.host.open(opening);
    await f.host.present(present(descriptor.id));
    f.owner.emit("resize");
    expect(f.views[0]!.setVisible).toHaveBeenLastCalledWith(false);
    expect(f.host.clipboard("copy")).toBe(false);
    f.ses.clearData.mockRejectedValue(new Error("storage failed"));
    expect(await f.host.retire()).toEqual({
      status: "failed",
      reason: "cleanup",
    });
    expect(f.ses.clearCache).toHaveBeenCalledTimes(1);
    expect(f.resourceOwner.release).toHaveBeenCalledTimes(1);
  });

  it("reports release rejection as failed unknown without retries", async () => {
    const f = await fixture();
    await f.host.open(opening);
    f.resourceOwner.release.mockRejectedValue(new Error("unknown pin outcome"));
    expect(await f.host.retire()).toEqual({
      status: "failed",
      reason: "cleanup",
    });
    expect(await f.host.retire()).toEqual({
      status: "failed",
      reason: "cleanup",
    });
    expect(f.resourceOwner.release).toHaveBeenCalledTimes(1);
  });

  it("does not release or settle when a known view has not actually been destroyed", async () => {
    const f = await fixture();
    await f.host.open(opening);
    const child = f.views[0]!.webContents;
    child.close.mockImplementation(() => {});
    vi.useFakeTimers();
    const retirement = f.host.retire();
    await vi.advanceTimersByTimeAsync(5001);
    expect(await retirement).toEqual({ status: "failed", reason: "timeout" });
    expect(f.resourceOwner.release).not.toHaveBeenCalled();
    child.dead = true;
    child.emit("destroyed");
    await vi.advanceTimersByTimeAsync(0);
    expect(f.resourceOwner.release).toHaveBeenCalledTimes(1);
    expect(await f.host.retire()).toEqual({
      status: "failed",
      reason: "timeout",
    });
  });

  it("bounds view admission and closes the last view through epoch retirement", async () => {
    const f = await fixture();
    const descriptors = [];
    for (let i = 0; i < 8; i++) descriptors.push(await f.host.open(opening));
    await expect(f.host.open(opening)).rejects.toThrow("unavailable");
    for (const descriptor of descriptors) {
      const closing = f.host.close(descriptor.id);
      expect(f.revoked).toHaveBeenLastCalledWith(descriptor.id);
      await closing;
    }
    expect(f.resourceOwner.release).toHaveBeenCalledTimes(1);
    await expect(f.host.open(opening)).rejects.toThrow("unavailable");
  });
});

it("IPC composition authenticates actual terminal main frame and rejects cross-owner IDs and argument smuggling", async () => {
  const a = await fixture(false);
  const b = await fixture(false);
  const handlers = new Map<
    string,
    (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
  >();
  const ipc = {
    handle: vi.fn(
      (
        name: string,
        callback: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
      ) => handlers.set(name, callback),
    ),
    removeHandler: vi.fn((name: string) => handlers.delete(name)),
  } as unknown as IpcMain;
  const first = startExtensionViewHost({ ...a.options, ipcMain: ipc });
  const second = startExtensionViewHost({ ...b.options, ipcMain: ipc });
  cleanups.push(
    () => first.retire(),
    () => second.retire(),
  );
  const da = await first.open(opening);
  await second.open(opening);
  expect(a.owner.webContents.send).toHaveBeenCalledWith(
    extensionViewIpc.open,
    da,
  );
  const event = (f: typeof a, frame = f.owner.webContents.mainFrame) =>
    ({
      sender: f.owner.webContents,
      senderFrame: frame,
    }) as unknown as IpcMainInvokeEvent;
  const invoke = (name: string, e: IpcMainInvokeEvent, ...args: unknown[]) =>
    Promise.resolve().then(() => handlers.get(name)!(e, ...args));
  await expect(
    invoke(extensionViewIpc.present, event(a, {}), present(da.id)),
  ).rejects.toThrow("owner");
  await expect(
    invoke(extensionViewIpc.present, event(b), present(da.id)),
  ).rejects.toThrow("Unknown");
  await expect(
    invoke(extensionViewIpc.present, event(a), present(da.id), "extra"),
  ).rejects.toThrow("Invalid");
  expect(await invoke(extensionViewIpc.present, event(a), present(da.id))).toBe(
    true,
  );
  a.owner.webContents.send.mockClear();
  sendExtensionAwareClipboard(
    ipc,
    a.owner.webContents as unknown as Electron.WebContents,
    "copy",
  );
  expect(a.views[0]!.webContents.copy).toHaveBeenCalledOnce();
  expect(a.owner.webContents.send).not.toHaveBeenCalled();
  expect(
    await invoke(extensionViewIpc.present, event(a), present(null, 2)),
  ).toBe(true);
  expect(a.views[0]!.setVisible).toHaveBeenLastCalledWith(false);
  await invoke(extensionViewIpc.close, event(a), da.id);
  expect(a.owner.webContents.send).toHaveBeenCalledWith(
    extensionViewIpc.retired,
    da.id,
  );
  expect(handlers.size).toBe(2); // Other window still owns the shared handlers.
  await second.retire();
  expect(
    await invoke(extensionViewIpc.present, event(a), present(null, 3)),
  ).toBe(true);
  await expect(
    invoke(extensionViewIpc.present, event(a), present(da.id, 4)),
  ).rejects.toThrow("Unknown");
  sendExtensionAwareClipboard(
    ipc,
    a.owner.webContents as unknown as Electron.WebContents,
    "copy",
  );
  expect(a.owner.webContents.send).toHaveBeenLastCalledWith(
    terminalIpc.clipboardAction,
    "copy",
  );
  const c = await fixture(false);
  const next = startExtensionViewHost({
    ...c.options,
    owner: a.options.owner,
    ipcMain: ipc,
  });
  cleanups.push(() => next.retire());
  const fresh = await next.open(opening);
  expect(
    await invoke(extensionViewIpc.present, event(a), present(fresh.id, 2)),
  ).toBe(false);
  expect(
    await invoke(extensionViewIpc.present, event(a), present(fresh.id, 5)),
  ).toBe(true);
  const d = await fixture(false);
  const concurrent = startExtensionViewHost({
    ...d.options,
    owner: a.options.owner,
    ipcMain: ipc,
  });
  cleanups.push(() => concurrent.retire());
  const otherEpoch = await concurrent.open(opening);
  expect(
    await invoke(extensionViewIpc.present, event(a), present(otherEpoch.id, 6)),
  ).toBe(true);
  expect(c.views[0]!.setVisible).toHaveBeenLastCalledWith(false);
  expect(d.views[0]!.setVisible).toHaveBeenLastCalledWith(true);
  expect(
    await invoke(extensionViewIpc.present, event(a), present(fresh.id, 5)),
  ).toBe(false);
  await next.retire();
  expect(
    await invoke(extensionViewIpc.present, event(a), present(null, 7)),
  ).toBe(true);
  expect(d.views[0]!.setVisible).toHaveBeenLastCalledWith(false);
  await concurrent.retire();
  expect(handlers.size).toBe(2); // Safe hide ACKs survive epoch retirement.
  a.owner.webContents.emit("destroyed");
  b.owner.webContents.emit("destroyed");
  expect(handlers.size).toBe(0);
});
