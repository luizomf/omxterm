/* eslint-disable max-lines -- Keep the shared installation adapter and its capability/lifetime matrix together. */
import { packageArchive } from "../fixtures/extension-package-archive";
import { EventEmitter } from "node:events";
import { catalogBytes as catalogFixture } from "../fixtures/extension-catalog";
import { OFFICIAL_CATALOG_URL } from "../../src/main/extension-catalog";
import { translatorFor, type SupportedLanguage } from "../../src/shared/i18n";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type {
  BrowserWindow,
  OpenDialogOptions,
  OpenDialogReturnValue,
} from "electron";
import { isTerminalTabCommand } from "../../src/shared/terminal-contract";
import {
  InstalledPackages,
  PackageError,
} from "../../src/installed-packages/installed-packages";
import {
  bytes,
  manifest,
  exerciseSshRouting,
  exerciseCompanionRouting,
  applicationBackend,
} from "../fixtures/ssh-view-routing";
import { extensionsIpc } from "../../src/shared/extensions";
import type { IpcEvent } from "../../src/main/terminal-ipc-types";
import type { ExtensionViewHostOptions } from "../../src/main/extension-view-host";
import type { Handler } from "../fixtures/ssh-view-routing";
type Host = {
  options: ExtensionViewHostOptions;
  open: ReturnType<typeof vi.fn>;
  reveal: ReturnType<typeof vi.fn>;
  claimActivation: ReturnType<typeof vi.fn>;
  retire: ReturnType<typeof vi.fn<() => Promise<{ status: "settled" }>>>;
};
import { startApplicationExtensions } from "../../src/main/application-extensions";
import type { ExtensionRuntime } from "../../src/extension-runtime/runtime";
import { createTerminalContextMenuTarget } from "../../src/main/terminal-context-menu";
const adapters = vi.hoisted(() => ({
  root: "",
  selected: undefined as unknown,
  handlers: new Map<string, Handler>(),
  windows: new Map<unknown, unknown>(),
  picker:
    vi.fn<
      (
        owner: unknown,
        options: OpenDialogOptions,
      ) => Promise<OpenDialogReturnValue>
    >(),
  consent:
    vi.fn<
      (
        _window: unknown,
        options: { detail?: string },
      ) => Promise<{ response: number }>
    >(),
  download: vi.fn<(url: string, signal: AbortSignal) => Promise<Buffer>>(),
  activate: vi.fn<ExtensionRuntime["activate"]>(),
  backendLifetime: new AbortController(),
  sshOpen:
    vi.fn<Parameters<typeof startApplicationExtensions>[0]["ssh"]["open"]>(),
  sendOpen:
    vi.fn<Parameters<typeof startApplicationExtensions>[0]["sendAction"]>(),
  semanticRequest:
    vi.fn<
      NonNullable<
        Parameters<typeof startApplicationExtensions>[0]["semanticInput"]
      >["request"]
    >(),
  retire: vi.fn(),
  hosts: [] as Host[],
}));
vi.mock("../../src/main/extension-download", async (original) => ({
  ...(await original<typeof import("../../src/main/extension-download")>()),
  downloadExtension: adapters.download,
}));
vi.mock("electron", () => ({
  app: { getVersion: () => "0.23.0-dev.5", getPath: () => adapters.root },
  BrowserWindow: {
    fromWebContents: (owner: unknown) => adapters.windows.get(owner),
    getFocusedWindow: () => adapters.selected,
  },
  dialog: { showOpenDialog: adapters.picker, showMessageBox: adapters.consent },
  ipcMain: {
    handle: (channel: string, handler: Handler) =>
      adapters.handlers.set(channel, handler),
    removeHandler: (channel: string) => adapters.handlers.delete(channel),
  },
}));
vi.mock(
  "../../src/installed-packages/installed-packages",
  async (original) => ({
    ...(await original<
      typeof import("../../src/installed-packages/installed-packages")
    >()),
    createNativeLeaseAdapter: () => ({
      tryAcquire: async () => ({ release: async () => {} }),
    }),
  }),
);
vi.mock("../../src/extension-runtime/electron-runtime", () => ({
  createExtensionRuntime: async () => ({
    activate: adapters.activate,
    retire: adapters.retire,
    dispose: async () => [],
  }),
}));
vi.mock("../../src/main/extension-view-ipc", () => ({
  startExtensionViewHost: (options: ExtensionViewHostOptions) => {
    const host = {
      options,
      open: vi.fn(
        async (descriptor: { title: string; presentation?: "panel" }) => ({
          id: "hosted-view",
          title: descriptor.title,
          ...(descriptor.presentation
            ? { presentation: descriptor.presentation }
            : {}),
        }),
      ),
      reveal: vi.fn(),
      claimActivation: vi.fn(),
      retire: vi.fn(async () => {
        await options.resources.release();
        options.onState?.("settled");
        return { status: "settled" as const };
      }),
    };
    adapters.hosts.push(host);
    return host;
  },
}));
const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
const originalArch = Object.getOwnPropertyDescriptor(process, "arch")!;
let service: Awaited<ReturnType<typeof startApplicationExtensions>>;
let window: BrowserWindow;
let archive: string;
let language: SupportedLanguage = "en-US";
const catalogBytes = () => catalogFixture(manifest, bytes());
it("catalog selection composes exact-byte trust, remains captured over refresh and stays dormant", async () => {
  const token = "a".repeat(36);
  adapters.download.mockImplementation(async (url) =>
    url === OFFICIAL_CATALOG_URL ? catalogBytes() : bytes(),
  );
  const loaded = await request({ operation: "catalog-refresh", token });
  const selection = loaded.catalog!.entries[0]!.selection;
  adapters.consent.mockImplementationOnce(async (_window, options) => {
    expect(options.detail).toContain("not an independent publisher signature");
    await request({ operation: "catalog-refresh", token });
    return { response: 1 };
  });
  const installed = await request({
    operation: "catalog-install",
    selection,
    token,
  });
  expect(installed.ok).toBe(true);
  expect(installed.entries?.[0]?.local).toBe("dormant");
  expect(adapters.activate).not.toHaveBeenCalled();
  expect(
    (await request({ operation: "catalog-install", selection, token })).error,
  ).toBe("catalog-selection");
});
it("rejects substituted catalog bytes before consent without generic-link fallback", async () => {
  const token = "a".repeat(36);
  adapters.download
    .mockResolvedValueOnce(catalogBytes())
    .mockResolvedValueOnce(bytes("2.0.0"));
  const loaded = await request({ operation: "catalog-refresh", token });
  const result = await request({
    operation: "catalog-install",
    selection: loaded.catalog!.entries[0]!.selection,
    token,
  });
  expect(result).toEqual({ ok: false, error: "catalog-mismatch" });
  expect(adapters.consent).not.toHaveBeenCalled();
  expect(adapters.download).toHaveBeenCalledTimes(2);
  expect((await request({ operation: "snapshot" })).entries).toEqual([]);
});
function request(
  value: unknown,
  event: IpcEvent = {
    sender: window.webContents,
    senderFrame: window.webContents.mainFrame,
  },
) {
  return adapters.handlers.get(extensionsIpc)!(event, value);
}
beforeEach(async () => {
  vi.resetAllMocks();
  adapters.backendLifetime = new AbortController();
  adapters.root = await mkdtemp(path.join(os.tmpdir(), "omxterm-service-"));
  language = "en-US";
  adapters.sendOpen.mockImplementation((_sender, _channel, command) => {
    if (!isTerminalTabCommand(command) || command.action !== "open-extension")
      throw new Error("Expected extension admission command");
    void request({ operation: "open", token: command.token, accepted: true });
  });
  adapters.hosts.length = 0;
  adapters.handlers.clear();
  adapters.windows.clear();
  adapters.download.mockResolvedValue(bytes());
  adapters.retire.mockResolvedValue(null);
  adapters.consent.mockResolvedValue({ response: 1 });
  const contents = Object.assign(new EventEmitter(), {
    mainFrame: {},
    send: vi.fn(),
    isDestroyed: () => false,
  });
  window = Object.assign(new EventEmitter(), {
    webContents: contents,
    isDestroyed: () => false,
    getContentSize: () => [800, 600],
  }) as unknown as BrowserWindow;
  adapters.windows.set(contents, window);
  adapters.selected = window;
  archive = path.join(adapters.root, "files.omxext");
  await writeFile(archive, bytes());
  adapters.picker.mockResolvedValue({ canceled: false, filePaths: [archive] });
  adapters.activate.mockImplementation(() =>
    applicationBackend(adapters.root, adapters.backendLifetime.signal),
  );
  // Model preview admission/catalog targeting, not the host filesystem. Startup
  // captures both synchronously before its first await; Windows store operations
  // must retain their native directory-sync policy after that boundary.
  let starting: ReturnType<typeof startApplicationExtensions>;
  try {
    Object.defineProperty(process, "platform", {
      value: "linux",
      configurable: true,
    });
    Object.defineProperty(process, "arch", {
      value: "arm64",
      configurable: true,
    });
    starting = startApplicationExtensions({
      applicationRoot: adapters.root,
      ssh: { open: adapters.sshOpen },
      semanticInput: { request: adapters.semanticRequest },
      layout: {
        capture: vi.fn(() => Promise.reject(new Error("unavailable"))),
        open: vi.fn(async () => ({ ok: false, error: "unavailable" })),
      },
      translator: () => translatorFor(language),
      sendAction: adapters.sendOpen,
      isTrustedSender: (event) => event.sender === contents,
      changed() {},
      keybind() {},
    });
  } finally {
    Object.defineProperty(process, "platform", originalPlatform);
    Object.defineProperty(process, "arch", originalArch);
  }
  service = await starting;
  service.registerWindow(window, () => ({
    owner: window,
    signal: new AbortController().signal,
    terminalDirectory: "/captured",
  }));
});
afterEach(async () => {
  await service?.dispose();
  await rm(adapters.root, { recursive: true, force: true });
});
async function installSnippets() {
  await writeFile(
    archive,
    packageArchive([
      {
        name: "extension.json",
        data: JSON.stringify({
          ...manifest,
          id: "omxterm.snippets",
          view: {
            ...manifest.view,
            action: "omxterm.snippets.open",
            title: "Snippets",
          },
        }),
      },
      { name: "backend.mjs", data: "" },
      { name: "index.html", data: "<h1>Snippets</h1>" },
    ]),
  );
  expect(await request({ operation: "install" })).toMatchObject({ ok: true });
}

it.each(["absent", "disabled"])(
  "guides %s Snippets to management without executing code",
  async (state) => {
    adapters.sendOpen.mockImplementation(() => {});
    if (state === "disabled") {
      await installSnippets();
      await request({
        operation: "disable",
        id: "omxterm.snippets",
        generation: 1,
      });
    }
    service.toggleSnippets(window);
    expect(adapters.sendOpen).toHaveBeenCalledExactlyOnceWith(
      window.webContents,
      expect.any(String),
      { action: "snippets-management" },
    );
    expect(adapters.activate).not.toHaveBeenCalled();
    expect(adapters.hosts).toHaveLength(0);
    if (state === "disabled")
      expect(await request({ operation: "snapshot" })).toMatchObject({
        entries: [{ enabled: false, generation: 2 }],
      });
  },
);

it("keeps Snippets out of ordinary actions and captures its compatibility invocation until acknowledgment", async () => {
  await installSnippets();
  expect(service.actions()).toEqual([]);
  expect(service.contextMenu(window, "s1", () => true)).toEqual([]);
  adapters.sendOpen.mockImplementation(() => {});
  let directory = "/original";
  service.registerWindow(window, () => ({
    owner: window,
    signal: new AbortController().signal,
    terminalDirectory: directory,
  }));
  service.toggleSnippets(window);
  const command = adapters.sendOpen.mock.calls[0]![2];
  if (
    !isTerminalTabCommand(command) ||
    command.action !== "toggle-snippets-extension"
  )
    throw new Error("Expected Snippets admission");
  expect(adapters.activate).not.toHaveBeenCalled();
  directory = "/replacement";
  await request({ operation: "open", token: command.token, accepted: true });
  await vi.waitFor(() => expect(adapters.hosts[0]?.open).toHaveBeenCalled());
  const host = adapters.hosts[0]!;
  expect(host.open).toHaveBeenCalledWith(
    expect.objectContaining({ presentation: "panel" }),
  );
  expect(host.reveal).not.toHaveBeenCalled();
  expect(
    await host.options.onRequest!(
      { operation: "terminal-directory" },
      new AbortController().signal,
      { id: "hosted-view", isCurrentVisible: () => true },
    ),
  ).toEqual({ ok: true, directory: "/original" });
  expect(
    await request({ operation: "open", token: command.token, accepted: true }),
  ).toMatchObject({ ok: false });
  service.toggleSnippets(window);
  const next = adapters.sendOpen.mock.calls[1]![2];
  if (
    !isTerminalTabCommand(next) ||
    next.action !== "toggle-snippets-extension"
  )
    throw new Error("Expected Snippets admission");
  await request({ operation: "open", token: next.token, accepted: true });
  await vi.waitFor(() => expect(host.reveal).toHaveBeenCalledOnce());
  expect(host.reveal).toHaveBeenCalledWith(
    expect.objectContaining({ toggle: true }),
  );
  expect(adapters.hosts).toHaveLength(1);
  expect(adapters.activate).toHaveBeenCalledOnce();
});

it.each(["denied", "disabled", "aborted"])(
  "refuses pending Snippets activation when %s",
  async (cause) => {
    await installSnippets();
    adapters.sendOpen.mockImplementation(() => {});
    const lifetime = new AbortController();
    service.registerWindow(window, () => ({
      owner: window,
      signal: lifetime.signal,
      terminalDirectory: null,
    }));
    service.toggleSnippets(window);
    const command = adapters.sendOpen.mock.calls[0]![2];
    if (
      !isTerminalTabCommand(command) ||
      command.action !== "toggle-snippets-extension"
    )
      throw new Error("Expected Snippets admission");
    if (cause === "disabled")
      await request({
        operation: "disable",
        id: "omxterm.snippets",
        generation: 1,
      });
    if (cause === "aborted") lifetime.abort();
    await request({
      operation: "open",
      token: command.token,
      accepted: cause !== "denied",
    });
    expect(
      await request({
        operation: "open",
        token: command.token,
        accepted: true,
      }),
    ).toMatchObject({ ok: false });
    expect(adapters.activate).not.toHaveBeenCalled();
  },
);

it("routes runtime-unavailable Snippets to management without activation", async () => {
  await service.dispose();
  adapters.sendOpen.mockImplementation(() => {});
  const unavailable = vi
    .spyOn(InstalledPackages, "open")
    .mockRejectedValueOnce(new Error("unavailable"));
  try {
    Object.defineProperty(process, "platform", {
      value: "linux",
      configurable: true,
    });
    Object.defineProperty(process, "arch", {
      value: "arm64",
      configurable: true,
    });
    service = await startApplicationExtensions({
      applicationRoot: adapters.root,
      ssh: { open: adapters.sshOpen },
      layout: { capture: vi.fn(), open: vi.fn() },
      translator: () => translatorFor(language),
      sendAction: adapters.sendOpen,
      isTrustedSender: (event) => event.sender === window.webContents,
      changed() {},
      keybind() {},
    });
  } finally {
    Object.defineProperty(process, "platform", originalPlatform);
    Object.defineProperty(process, "arch", originalArch);
    unavailable.mockRestore();
  }
  service.registerWindow(window, () => ({
    owner: window,
    signal: new AbortController().signal,
    terminalDirectory: null,
  }));
  expect(await request({ operation: "snapshot" })).toMatchObject({
    error: "runtime-unavailable",
  });
  service.toggleSnippets(window);
  expect(adapters.sendOpen).toHaveBeenCalledExactlyOnceWith(
    window.webContents,
    expect.any(String),
    { action: "snippets-management" },
  );
  expect(adapters.activate).not.toHaveBeenCalled();
});

it("ignores compatibility commands for an unfocused or unavailable target", () => {
  adapters.sendOpen.mockImplementation(() => {});
  adapters.selected = {};
  service.toggleSnippets(window);
  adapters.selected = window;
  const lifetime = new AbortController();
  lifetime.abort();
  service.registerWindow(window, () => ({
    owner: window,
    signal: lifetime.signal,
    terminalDirectory: null,
  }));
  service.toggleSnippets(window);
  expect(adapters.sendOpen).not.toHaveBeenCalled();
  expect(adapters.activate).not.toHaveBeenCalled();
});

it("HTTPS installs exact captured bytes with the same consent, replacement generation and dormant runtime", async () => {
  await request({ operation: "install" });
  adapters.download.mockResolvedValueOnce(bytes("2.0.0"));
  const result = await request({
    operation: "install-link",
    url: "https://example.org/archive?signature=private",
    token: "11111111-1111-1111-1111-111111111111",
  });
  expect(result).toMatchObject({
    ok: true,
    entries: [{ version: "2.0.0", generation: 2, local: "dormant" }],
  });
  expect(adapters.picker).toHaveBeenCalledTimes(1);
  expect(adapters.consent).toHaveBeenCalledTimes(2);
  expect(adapters.consent.mock.calls[1]![1].detail).not.toContain("private");
  expect(adapters.activate).not.toHaveBeenCalled();
});
it("cancellation is owner/request bound and late acquisition cannot open consent", async () => {
  let finish!: (bytes: Buffer) => void;
  adapters.download.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const token = "11111111-1111-1111-1111-111111111111";
  const pending = request({
    operation: "install-link",
    url: "https://example.org/a",
    token,
  });
  const signal = adapters.download.mock.calls[0]![1];
  await request({
    operation: "cancel-install",
    token: "22222222-2222-2222-2222-222222222222",
  });
  expect(signal.aborted).toBe(false);
  await request({ operation: "cancel-install", token });
  expect(signal.aborted).toBe(true);
  finish(bytes());
  expect(await pending).toMatchObject({ ok: false, error: "cancelled" });
  expect(adapters.consent).not.toHaveBeenCalled();
  expect(await request({ operation: "snapshot" })).toMatchObject({
    entries: [],
  });
});
it("never relabels postapproval publication uncertainty as cancellation", async () => {
  const token = "11111111-1111-1111-1111-111111111111";
  const install = vi
    .spyOn(InstalledPackages.prototype, "install")
    .mockImplementationOnce(async () => {
      await request({ operation: "cancel-install", token });
      throw new PackageError("outcome-unknown");
    });
  try {
    expect(
      await request({
        operation: "install-link",
        url: "https://example.org/a",
        token,
      }),
    ).toEqual({ ok: false, error: "outcome-unknown" });
    expect(adapters.consent).toHaveBeenCalledTimes(1);
    expect(install).toHaveBeenCalledTimes(1);
  } finally {
    install.mockRestore();
  }
});
it("reports cancellation during captured-byte validation without consent or publication", async () => {
  let release!: () => void;
  let validating = false;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const snapshot = vi
    .spyOn(InstalledPackages.prototype, "snapshot")
    .mockImplementationOnce(async () => {
      validating = true;
      await held;
      return [];
    });
  try {
    const token = "11111111-1111-1111-1111-111111111111";
    const pending = request({
      operation: "install-link",
      url: "https://example.org/a",
      token,
    });
    await vi.waitFor(() => expect(validating).toBe(true));
    await request({ operation: "cancel-install", token });
    release();
    expect(await pending).toEqual({ ok: false, error: "cancelled" });
    expect(adapters.consent).not.toHaveBeenCalled();
    expect(await request({ operation: "snapshot" })).toMatchObject({
      entries: [],
    });
  } finally {
    release();
    snapshot.mockRestore();
  }
});
it("renderer loss revokes a pending HTTPS consent and malformed bytes preserve the old installation", async () => {
  await request({ operation: "install" });
  adapters.download.mockResolvedValueOnce(Buffer.from("not zip"));
  expect(
    await request({
      operation: "install-link",
      url: "https://example.org/a",
      token: "11111111-1111-1111-1111-111111111111",
    }),
  ).toMatchObject({ ok: false, error: "invalid-package" });
  adapters.consent.mockImplementationOnce(async () => {
    window.webContents.emit("render-process-gone");
    return { response: 1 };
  });
  expect(
    await request({
      operation: "install-link",
      url: "https://example.org/a",
      token: "22222222-2222-2222-2222-222222222222",
    }),
  ).toMatchObject({ ok: false, error: "cancelled" });
  expect(await request({ operation: "snapshot" })).toMatchObject({
    entries: [{ version: "1.0.0", generation: 1 }],
  });
});
it("Settings installs captured bytes through explicit trust without activating code", async () => {
  adapters.consent.mockImplementationOnce(async () => {
    await writeFile(archive, bytes("2.0.0"));
    return { response: 1 };
  });
  const result = await request({ operation: "install" });
  expect(result).toMatchObject({
    ok: true,
    entries: [{ version: "1.0.0", local: "dormant", enabled: true }],
  });
  expect(adapters.activate).not.toHaveBeenCalled();
  expect(adapters.consent.mock.calls[0]![1].detail).toContain("network");
  expect(service.actions()).toMatchObject([
    { id: "example.files.open", accelerator: null },
  ]);
});
it.each([false, true])(
  "routes SSH only from its own declared view (declared: %s)",
  (declared) =>
    exerciseSshRouting(declared, {
      archive,
      window,
      service,
      request,
      hosts: adapters.hosts,
      sshOpen: adapters.sshOpen,
    }),
);
it("retains companion Files after its source terminal ends and reopens the same view", () =>
  exerciseCompanionRouting({ archive, window, service, request }, adapters));

it.each([true, false])(
  "admits semantic input only for a declared current visible view (%s)",
  async (declared) => {
    await writeFile(
      archive,
      packageArchive([
        {
          name: "extension.json",
          data: JSON.stringify({
            ...manifest,
            ...(declared
              ? { capabilities: ["terminal.semanticInput.v1"] }
              : {}),
          }),
        },
        { name: "backend.mjs", data: "" },
        { name: "index.html", data: "<h1>Input</h1>" },
      ]),
    );
    await request({ operation: "install" });
    service.actions()[0]!.invoke();
    await vi.waitFor(() => expect(adapters.hosts[0]?.open).toHaveBeenCalled());
    const host = adapters.hosts[0]!;
    const visible = vi.fn(() => false);
    const context = {
      id: "authenticated-native-view",
      isCurrentVisible: visible,
    };
    const signal = new AbortController().signal;
    const input = {
      operation: "terminal.semanticInput.v1",
      text: " exact\n",
      title: "Exact",
      intent: "insert",
      preview: true,
    };
    await expect(
      host.options.onRequest!(input, signal, context),
    ).rejects.toThrow("unavailable");
    expect(adapters.semanticRequest).not.toHaveBeenCalled();
    visible.mockReturnValue(true);
    adapters.semanticRequest.mockResolvedValue({ ok: true });
    const result = host.options.onRequest!(input, signal, context);
    if (!declared) {
      await expect(result).rejects.toThrow("unavailable");
      expect(host.claimActivation).not.toHaveBeenCalled();
      return;
    }
    expect(await result).toEqual({ ok: true });
    expect(host.claimActivation).toHaveBeenCalledExactlyOnceWith(context.id);
    expect(adapters.semanticRequest).toHaveBeenCalledWith(
      window,
      input,
      context,
      expect.any(AbortSignal),
      expect.any(Function),
    );
    const lifetime = adapters.semanticRequest.mock.calls[0]![3];
    expect(lifetime.aborted).toBe(false);
    await request({ operation: "disable", id: manifest.id, generation: 1 });
    expect(lifetime.aborted).toBe(true);
    await expect(
      host.options.onRequest!(input, signal, context),
    ).rejects.toThrow("unavailable");
  },
);

it("a valid claimed terminal contribution retains its captured directory", async () => {
  await request({ operation: "install" });
  let directory = "/original";
  service.registerWindow(window, () => ({
    owner: window,
    signal: new AbortController().signal,
    terminalDirectory: directory,
  }));
  const item = service.contextMenu(window, "s1", () => true)[0]!;
  directory = "/later-selection";
  item.click();
  await vi.waitFor(() => expect(adapters.hosts).toHaveLength(1));
  expect(
    await adapters.hosts[0]!.options.onRequest!(
      { operation: "terminal-directory" },
      new AbortController().signal,
      { id: "hosted-view", isCurrentVisible: () => true },
    ),
  ).toEqual({ ok: true, directory: "/original" });
});
it.each(["selection", "new-popup", "window"])(
  "rejects a Files popup after %s invalidation",
  async (cause) => {
    await request({ operation: "install" });
    let focused = true;
    const popup = createTerminalContextMenuTarget({
      isOwnerAlive: () => true,
      isFocusedSession: () => focused,
      show() {},
    });
    const target = { sessionId: "s1", menuId: 1 };
    popup.show(target);
    const item = service.contextMenu(window, target.sessionId, () =>
      popup.claim(target),
    )[0]!;
    if (cause === "selection") {
      focused = false;
      popup.selectionChanged();
    }
    if (cause === "new-popup") popup.show({ ...target, menuId: 2 });
    if (cause === "window") adapters.selected = {};
    item.click();
    expect(adapters.sendOpen).not.toHaveBeenCalled();
    expect(adapters.activate).not.toHaveBeenCalled();
  },
);
it("consumes a valid popup once before guarded renderer admission", async () => {
  await request({ operation: "install" });
  const popup = createTerminalContextMenuTarget({
    isOwnerAlive: () => true,
    isFocusedSession: () => true,
    show() {},
  });
  const target = { sessionId: "s1", menuId: 1 };
  popup.show(target);
  const item = service.contextMenu(window, target.sessionId, () =>
    popup.claim(target),
  )[0]!;
  item.click();
  item.click();
  await vi.waitFor(() => expect(adapters.hosts).toHaveLength(1));
  expect(adapters.sendOpen).toHaveBeenCalledOnce();
});
it("revokes issued actions across disable/enable without reviving new authority", async () => {
  await request({ operation: "install" });
  const old = service.actions()[0]!;
  await request({ operation: "disable", id: manifest.id, generation: 1 });
  await request({ operation: "enable", id: manifest.id, generation: 2 });
  old.invoke();
  await vi.waitFor(() => expect(adapters.consent).toHaveBeenCalledTimes(2));
  expect(adapters.activate).not.toHaveBeenCalled();
  service.actions()[0]!.invoke();
  await vi.waitFor(() => expect(adapters.hosts).toHaveLength(1));
  expect(adapters.activate).toHaveBeenCalledWith(
    manifest.id,
    expect.objectContaining({ generation: 3 }),
  );
});
it("denied modal admission consumes the token without starting installed code", async () => {
  await request({ operation: "install" });
  adapters.sendOpen.mockImplementation(() => {});
  service.actions()[0]!.invoke();
  const command = adapters.sendOpen.mock.calls[0]![2];
  if (!isTerminalTabCommand(command) || command.action !== "open-extension")
    throw new Error("Expected extension admission command");
  const token = command.token;
  expect(adapters.activate).not.toHaveBeenCalled();
  expect(
    await request({ operation: "open", token, accepted: false }),
  ).toMatchObject({ ok: false });
  expect(
    await request({ operation: "open", token, accepted: true }),
  ).toMatchObject({ ok: false });
  expect(adapters.activate).not.toHaveBeenCalled();
});
it("localizes native trust at display time without changing captured package identity", async () => {
  language = "pt-BR";
  await request({ operation: "install" });
  expect(adapters.picker.mock.calls[0]![1].title).toBe(
    "Instalar extensão local",
  );
  expect(adapters.consent.mock.calls[0]![1]).toMatchObject({
    title: "Confiar no código da extensão?",
  });
  expect(adapters.consent.mock.calls[0]![1].detail).toMatch(
    /SHA-256: [a-f0-9]{64}/,
  );
  expect(adapters.activate).not.toHaveBeenCalled();
});
it("cancelled consent does not install or activate", async () => {
  adapters.consent.mockResolvedValueOnce({ response: 0 });
  expect(await request({ operation: "install" })).toMatchObject({
    ok: true,
    entries: [],
  });
  expect(service.actions()).toEqual([]);
  expect(adapters.activate).not.toHaveBeenCalled();
});
it("revokes pending consent without reading a closed window's native getter", async () => {
  let approve!: (value: { response: number }) => void;
  adapters.consent.mockReturnValueOnce(
    new Promise((resolve) => {
      approve = resolve;
    }),
  );
  const installation = request({ operation: "install" });
  await vi.waitFor(() => expect(adapters.consent).toHaveBeenCalledOnce());
  Object.defineProperty(window, "webContents", {
    get() {
      throw new Error("Object has been destroyed");
    },
  });
  // Settle the outstanding operation even on the original broken close path.
  let closeError: unknown;
  try {
    window.emit("closed");
  } catch (error) {
    closeError = error;
  }
  approve({ response: 1 });
  const result = await installation;
  expect(closeError).toBeUndefined();
  expect(result).toEqual({ ok: false, error: "unavailable" });
  expect(service.capture(window)).toBeUndefined();
  expect(adapters.activate).not.toHaveBeenCalled();
});
it("authenticates main frame and rejects caller paths and malformed generations", async () => {
  await expect(
    request(
      { operation: "snapshot" },
      { sender: window.webContents, senderFrame: {} },
    ),
  ).rejects.toThrow("owner");
  await expect(
    request({ operation: "install", path: archive }),
  ).rejects.toThrow("Invalid");
  await expect(
    request({ operation: "disable", id: manifest.id, generation: -1 }),
  ).rejects.toThrow("Invalid");
  expect(adapters.picker).not.toHaveBeenCalled();
});
it("actions capture separate contexts; disable revokes both views and callbacks", async () => {
  await request({ operation: "install" });
  const first = service.actions()[0]!;
  first.invoke();
  await vi.waitFor(() => expect(adapters.hosts).toHaveLength(1));
  const captured = service.capture(window)!;
  captured.terminalDirectory = "/second";
  service.actions(captured)[0]!.invoke();
  await vi.waitFor(() => expect(adapters.hosts).toHaveLength(2));
  expect(
    await adapters.hosts[0]!.options.onRequest!(
      { operation: "terminal-directory" },
      new AbortController().signal,
      { id: "hosted-view", isCurrentVisible: () => true },
    ),
  ).toEqual({ ok: true, directory: "/captured" });
  expect(
    await adapters.hosts[1]!.options.onRequest!(
      { operation: "terminal-directory" },
      new AbortController().signal,
      { id: "hosted-view", isCurrentVisible: () => true },
    ),
  ).toEqual({ ok: true, directory: "/second" });
  expect(
    await request({ operation: "disable", id: manifest.id, generation: 1 }),
  ).toMatchObject({
    ok: true,
    entries: [{ enabled: false, generation: 2, local: "dormant" }],
  });
  expect(service.actions()).toEqual([]);
  expect(
    adapters.hosts.every((host) => host.retire.mock.calls.length === 1),
  ).toBe(true);
  await expect(
    adapters.hosts[0]!.options.onRequest!(
      { operation: "terminal-directory" },
      new AbortController().signal,
      { id: "hosted-view", isCurrentVisible: () => true },
    ),
  ).rejects.toThrow("unavailable");
});
