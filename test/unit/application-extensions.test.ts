/* eslint-disable max-lines -- Keep the shared installation adapter and its capability/lifetime matrix together. */
import { packageArchive } from "../fixtures/extension-package-archive";
import { defaultSnippetsFixture } from "../fixtures/default-snippets";
import { EventEmitter } from "node:events";
import { catalogBytes as catalogFixture } from "../fixtures/extension-catalog";
import {
  MACOS_OFFICIAL_CATALOG_URL,
  OFFICIAL_CATALOG_URL,
} from "../../src/main/extension-catalog";
import { translatorFor, type SupportedLanguage } from "../../src/shared/i18n";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { usesOptionalSnippets } from "../../src/shared/snippets-mode";
import type {
  BrowserWindow,
  MessageBoxOptions,
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
type ExtensionViewHostOptions = Parameters<
  typeof import("../../src/main/extension-view-ipc").startExtensionViewHost
>[0];
import type { Handler } from "../fixtures/ssh-view-routing";
type Host = {
  options: ExtensionViewHostOptions;
  open: ReturnType<typeof vi.fn>;
  reveal: ReturnType<typeof vi.fn>;
  claimActivation: ReturnType<typeof vi.fn>;
  retire: ReturnType<typeof vi.fn<() => Promise<{ status: "settled" }>>>;
};
import { startApplicationExtensions } from "../../src/main/application-extensions";
import * as extensionManager from "../../src/main/extension-manager";
import type { ExtensionRuntime } from "../../src/extension-runtime/runtime";
import { createTerminalContextMenuTarget } from "../../src/main/terminal-context-menu";
import { extensionInvocationTarget } from "../../src/main/extension-invocation-target";
import { registerSemanticInputIpc } from "../../src/main/semantic-input-ipc";
import { subscribeNativeSemanticInput } from "../../src/renderer/native-semantic-input";
import { createSemanticInputBridge } from "../../src/preload/semantic-input-bridge";
import { semanticInputIpc } from "../../src/shared/semantic-input";
import { createIpcHarness } from "../fixtures/terminal-ipc-harness";
const adapters = vi.hoisted(() => ({
  root: "",
  appVersion: "0.23.0-dev.5",
  runtimeCreated: vi.fn(),
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
        options: MessageBoxOptions,
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
  semanticConfirm:
    vi.fn<
      NonNullable<
        Parameters<typeof startApplicationExtensions>[0]["semanticInput"]
      >["confirmSelection"]
    >(),
  semanticSubscribe:
    vi.fn<
      NonNullable<
        Parameters<typeof startApplicationExtensions>[0]["semanticInput"]
      >["subscribeSelection"]
    >(),
  retire: vi.fn(),
  hosts: [] as Host[],
}));
vi.mock("../../src/main/extension-download", async (original) => ({
  ...(await original<typeof import("../../src/main/extension-download")>()),
  downloadExtension: adapters.download,
}));
vi.mock("electron", () => ({
  app: { getVersion: () => adapters.appVersion, getPath: () => adapters.root },
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
  createExtensionRuntime: async () => {
    adapters.runtimeCreated();
    return {
      activate: adapters.activate,
      retire: adapters.retire,
      dispose: async () => [],
    };
  },
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
it("startup seeds actual fixed bytes before runtime composition/initial snapshot without trust, network, activation or view", async () => {
  await service.dispose();
  await rm(adapters.root, { recursive: true, force: true });
  const fixture = await defaultSnippetsFixture();
  const claim = await fixture.claim();
  await fixture.bundle();
  adapters.root = fixture.userData;
  adapters.appVersion = "0.25.0-dev.8";
  const events: string[] = [];
  adapters.runtimeCreated.mockImplementation(() =>
    events.push("runtime-created"),
  );
  await startService("linux", {
    defaultSnippets: {
      async install(packages) {
        const warning = await claim.seed!.install(packages);
        events.push("seeded");
        return warning;
      },
    },
  });
  expect(events).toEqual(["seeded", "runtime-created"]);
  expect((await request({ operation: "snapshot" })).entries).toEqual([
    expect.objectContaining({
      id: "omxterm.snippets",
      enabled: true,
      generation: 1,
      local: "dormant",
    }),
  ]);
  expect(adapters.activate).not.toHaveBeenCalled();
  expect(adapters.hosts).toHaveLength(0);
  expect(adapters.download).not.toHaveBeenCalled();
  expect(adapters.consent).not.toHaveBeenCalled();
});
it.each([false, true])(
  "startup provisioning warning survives later runtime failure=%s without retry",
  async (failRuntime) => {
    await service.dispose();
    const warning = "Default Snippets failed; no automatic retry.";
    const install = vi.fn(async () => warning);
    const report = vi.fn();
    if (failRuntime)
      adapters.runtimeCreated.mockImplementation(() => {
        throw new Error("runtime unavailable");
      });
    await startService("linux", {
      defaultSnippets: { install },
      onDefaultSnippetsWarning: report,
    });
    expect(install).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledExactlyOnceWith(warning);
    expect(adapters.activate).not.toHaveBeenCalled();
    expect(adapters.hosts).toHaveLength(0);
  },
);
it.each(["linux", "darwin"])(
  "%s catalog selection composes exact-byte trust, remains captured over refresh and stays dormant",
  async (platform) => {
    if (platform === "darwin") {
      await service.dispose();
      await startService(platform);
    }
    const token = "a".repeat(36);
    const endpoint =
      platform === "darwin" ? MACOS_OFFICIAL_CATALOG_URL : OFFICIAL_CATALOG_URL;
    const fixture = JSON.parse(catalogBytes().toString()) as {
      entries: { targets: string[] }[];
    };
    fixture.entries[0]!.targets = [`${platform}-arm64`];
    adapters.download.mockImplementation(async (url) =>
      url === endpoint ? Buffer.from(JSON.stringify(fixture)) : bytes(),
    );
    expect(adapters.download).not.toHaveBeenCalled();
    const loaded = await request({ operation: "catalog-refresh", token });
    expect(adapters.download.mock.calls[0]![0]).toBe(endpoint);
    const selection = loaded.catalog!.entries[0]!.selection;
    adapters.consent.mockImplementationOnce(async (_window, options) => {
      expect(options.detail).toContain(
        "not an independent publisher signature",
      );
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
  },
);
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
  adapters.appVersion = "0.23.0-dev.5";
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
  adapters.semanticConfirm.mockResolvedValue(true);
  adapters.semanticSubscribe.mockReturnValue(() => {});
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
  await startService("linux");
});
async function startService(
  platform: string,
  provisioning: Partial<
    Pick<
      Parameters<typeof startApplicationExtensions>[0],
      "defaultSnippets" | "onDefaultSnippetsWarning" | "isTrustedSender"
    >
  > = {},
  semanticOwner = true,
) {
  // Model preview admission/catalog targeting, not the host filesystem. Startup
  // captures both synchronously before its first await; Windows store operations
  // must retain their native directory-sync policy after that boundary.
  let starting: ReturnType<typeof startApplicationExtensions>;
  try {
    Object.defineProperty(process, "platform", {
      value: platform,
      configurable: true,
    });
    Object.defineProperty(process, "arch", {
      value: "arm64",
      configurable: true,
    });
    starting = startApplicationExtensions({
      ...provisioning,
      applicationRoot: adapters.root,
      ssh: { open: adapters.sshOpen },
      ...(semanticOwner
        ? {
            semanticInput: {
              request: adapters.semanticRequest,
              confirmSelection: adapters.semanticConfirm,
              subscribeSelection: adapters.semanticSubscribe,
            },
          }
        : {}),
      layout: {
        capture: vi.fn(() => Promise.reject(new Error("unavailable"))),
        open: vi.fn(async () => ({ ok: false, error: "unavailable" })),
      },
      translator: () => translatorFor(language),
      sendAction: adapters.sendOpen,
      isTrustedSender:
        provisioning.isTrustedSender ??
        ((event) => event.sender === window.webContents),
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
    sourceSessionId: "s1",
  }));
}
afterEach(async () => {
  await service?.dispose();
  await rm(adapters.root, { recursive: true, force: true });
});

// These mocked requests use literal host path grammars; expected shell quoting
// is independent of the production formatter. No native filesystem is spoofed.
const pathCases = [
  {
    platform: "linux",
    simple: "/synthetic/a b",
    simpleText: "'/synthetic/a b'",
    quoted: "/root/a 'b'",
    quotedText: "'/root/a '\\''b'\\'''",
    multiline: "/root/a 'b'\nname",
    multilineText: "'/root/a '\\''b'\\''\nname'",
    root: "/root/",
    otherGrammar: "C:\\root\\file",
  },
  {
    platform: "win32",
    simple: "C:\\synthetic\\a b",
    simpleText: "'C:\\synthetic\\a b'",
    quoted: "C:\\root\\a 'b'",
    quotedText: "'C:\\root\\a ''b'''",
    multiline: "C:\\root\\a 'b'\nname",
    multilineText: "'C:\\root\\a ''b''\nname'",
    root: "C:\\root\\",
    otherGrammar: "/root/file",
  },
] as const;

async function withPathPlatform<T>(
  platform: "linux" | "win32",
  run: () => Promise<T>,
): Promise<T> {
  const previous = Object.getOwnPropertyDescriptor(process, "platform")!;
  try {
    Object.defineProperty(process, "platform", {
      value: platform,
      configurable: true,
    });
    return await run();
  } finally {
    Object.defineProperty(process, "platform", previous);
  }
}

it.each(pathCases)(
  "restores the actual platform after a rejected mocked $platform path request",
  async ({ platform }) => {
    const previous = Object.getOwnPropertyDescriptor(process, "platform");
    await expect(
      withPathPlatform(platform, async () => {
        expect(process.platform).toBe(platform);
        throw new Error("synthetic request failure");
      }),
    ).rejects.toThrow("synthetic request failure");
    expect(Object.getOwnPropertyDescriptor(process, "platform")).toEqual(
      previous,
    );
  },
);

it.each([
  ["darwin", "arm64", true],
  ["darwin", "x64", false],
  ["linux", "arm64", true],
  ["linux", "x64", true],
  ["linux", "arm", false],
  ["win32", "arm64", true],
  ["win32", "x64", false],
] as const)(
  "production admission on %s %s is %s",
  async (platform, arch, supported) => {
    await service.dispose();
    let starting: ReturnType<typeof startApplicationExtensions>;
    try {
      Object.defineProperty(process, "platform", {
        value: platform,
        configurable: true,
      });
      Object.defineProperty(process, "arch", {
        value: arch,
        configurable: true,
      });
      starting = startApplicationExtensions({
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
    }
    service = await starting;
    service.registerWindow(window, () => ({
      owner: window,
      signal: new AbortController().signal,
      terminalDirectory: null,
    }));
    if (!supported) {
      expect(await request({ operation: "install" })).toEqual({
        ok: false,
        error: "unsupported",
      });
      expect(adapters.consent).not.toHaveBeenCalled();
      return;
    }
    expect(usesOptionalSnippets(platform, arch)).toBe(true);
    expect(await request({ operation: "install" })).toMatchObject({
      ok: true,
      entries: [{ enabled: true, local: "dormant" }],
    });
    expect(adapters.consent).toHaveBeenCalledOnce();
    expect(adapters.activate).not.toHaveBeenCalled();
    service.actions()[0]!.invoke();
    await vi.waitFor(() =>
      expect(adapters.hosts[0]?.open).toHaveBeenCalledOnce(),
    );
    expect(
      await request({ operation: "disable", id: manifest.id, generation: 1 }),
    ).toMatchObject({ ok: true, entries: [{ enabled: false }] });
    expect(adapters.hosts[0]!.retire).toHaveBeenCalled();
    expect(service.actions()).toEqual([]);
    expect(
      await request({ operation: "uninstall", id: manifest.id, generation: 2 }),
    ).toMatchObject({ ok: true, entries: [{ installed: false }] });
    await installSnippets();
    expect(service.actions()).toEqual([]);
    expect(service.contextMenu(window, "s1", () => true)).toEqual([]);
    expect(adapters.activate).toHaveBeenCalledOnce();
  },
);

async function installSnippets() {
  return installTool("omxterm.snippets", "Snippets");
}

async function installTool(id: string, title: string, capabilities?: string[]) {
  await writeFile(
    archive,
    packageArchive([
      {
        name: "extension.json",
        data: JSON.stringify({
          ...manifest,
          id,
          ...(capabilities?.length ? { capabilities } : {}),
          view: {
            ...manifest.view,
            action: `${id}.open`,
            title,
          },
        }),
      },
      { name: "backend.mjs", data: "" },
      { name: "index.html", data: "<h1>Snippets</h1>" },
    ]),
  );
  expect(await request({ operation: "install" })).toMatchObject({ ok: true });
}

it.each(
  pathCases.flatMap((paths) =>
    ["omxterm.files", "omxterm.ssh"].map((id) => [paths, id] as const),
  ),
)(
  "selects terminal transport only for the installed Files companion (%s, %s)",
  async (paths, id) => {
    adapters.semanticRequest.mockResolvedValue({ ok: true });
    await installTool(id, "Tool", ["terminal.insertPath.v1"]);
    service.actions()[0]!.invoke();
    await vi.waitFor(() => expect(adapters.hosts[0]?.open).toHaveBeenCalled());
    const host = adapters.hosts[0]!;
    if (id !== "omxterm.files") {
      expect(host.options.filesTerminalDrop).toBeUndefined();
      expect(adapters.semanticRequest).not.toHaveBeenCalled();
      return;
    }
    const input = {
      ticket: "00000000-0000-4000-8000-000000000001",
      entry: { path: paths.simple, kind: "file" as const, entryToken: "1" },
      source: { id: "hosted-view", isCurrentVisible: () => true },
      revision: 3,
      signal: new AbortController().signal,
    };
    expect(
      await withPathPlatform(paths.platform, () =>
        host.options.filesTerminalDrop!(input),
      ),
    ).toEqual({
      status: "accepted",
    });
    expect(adapters.semanticRequest).toHaveBeenCalledExactlyOnceWith(
      window,
      expect.objectContaining({
        operation: "terminal.semanticInput.v1",
        text: paths.simpleText,
        intent: "insert",
      }),
      expect.objectContaining({
        id: input.source.id,
        actionSelectionRevision: 3,
      }),
      expect.any(AbortSignal),
      expect.any(Function),
      { dropTicket: input.ticket },
    );
    expect(host.options.filesDragSignal?.aborted).toBe(false);
    await service.dispose();
    expect(host.options.filesDragSignal?.aborted).toBe(true);
    expect(
      await withPathPlatform(paths.platform, () =>
        host.options.filesTerminalDrop!(input),
      ),
    ).toEqual({
      status: "refused",
    });
    expect(adapters.semanticRequest).toHaveBeenCalledOnce();
  },
);

it.each(
  pathCases.flatMap((paths) =>
    (
      [
        [false, false],
        [false, true],
        [true, false],
        [true, true],
      ] as const
    ).map(([declared, owner]) => [paths, declared, owner] as const),
  ),
)(
  "composes protected Files drop with %s, declared capability=%s and semantic owner=%s",
  async (paths, declared, owner) => {
    if (!owner) {
      await service.dispose();
      await startService("linux", {}, false);
    }
    await installTool(
      "omxterm.files",
      "Files",
      declared ? ["terminal.insertPath.v1"] : [],
    );
    service.actions()[0]!.invoke();
    await vi.waitFor(() => expect(adapters.hosts[0]?.open).toHaveBeenCalled());
    const host = adapters.hosts[0]!;
    if (!declared || !owner) {
      expect(host.options.filesTerminalDrop).toBeUndefined();
      expect(adapters.semanticRequest).not.toHaveBeenCalled();
      return;
    }
    const input = {
      ticket: "00000000-0000-4000-8000-000000000001",
      entry: { path: paths.quoted, kind: "link" as const, entryToken: "1" },
      source: {
        id: "authenticated-native-view",
        isCurrentVisible: vi.fn(() => true),
      },
      revision: 7,
      signal: new AbortController().signal,
    };
    adapters.semanticRequest.mockResolvedValue({ ok: true });
    const drop = () =>
      withPathPlatform(paths.platform, () =>
        host.options.filesTerminalDrop!(input),
      );
    expect(await drop()).toEqual({
      status: "accepted",
    });
    expect(adapters.semanticRequest).toHaveBeenCalledExactlyOnceWith(
      window,
      {
        operation: "terminal.semanticInput.v1",
        text: paths.quotedText,
        title: "File path",
        intent: "insert",
        preview: false,
      },
      expect.objectContaining({
        id: input.source.id,
        actionSelectionRevision: 7,
      }),
      expect.any(AbortSignal),
      expect.any(Function),
      { dropTicket: input.ticket },
    );
    expect(adapters.activate).toHaveBeenCalledOnce(); // No insertion backend/second PTY route.
    for (const [reply, status] of [
      [{ ok: false, reason: "terminal-busy" }, "refused"],
      [{ ok: false, reason: "terminal-not-completed" }, "unknown"],
    ] as const) {
      adapters.semanticRequest.mockResolvedValue(reply);
      expect(await drop()).toEqual({
        status,
        reason: reply.reason,
      });
    }
    input.source.isCurrentVisible.mockReturnValue(false);
    expect(await drop()).toEqual({
      status: "refused",
    });
    expect(adapters.semanticRequest).toHaveBeenCalledTimes(3);
  },
);

it.each(pathCases)(
  "delivers each Files drop's captured owner on $platform despite another window becoming focused",
  async (paths) => {
    await service.dispose();
    adapters.semanticRequest.mockResolvedValue({ ok: true });
    await startService("linux", {
      isTrustedSender: (event) => adapters.windows.has(event.sender),
    });
    adapters.sendOpen.mockImplementation((sender, _channel, command) => {
      if (!isTerminalTabCommand(command) || command.action !== "open-extension")
        throw new Error("Expected extension admission command");
      void request(
        { operation: "open", token: command.token, accepted: true },
        { sender, senderFrame: sender.mainFrame },
      );
    });
    await installTool("omxterm.files", "Files", ["terminal.insertPath.v1"]);
    service.actions()[0]!.invoke();
    await vi.waitFor(() => expect(adapters.hosts[0]?.open).toHaveBeenCalled());
    const first = adapters.hosts[0]!;
    const otherWindow = Object.assign(new EventEmitter(), {
      webContents: Object.assign(new EventEmitter(), {
        mainFrame: {},
        send: vi.fn(),
        isDestroyed: () => false,
      }),
      isDestroyed: () => false,
      getContentSize: () => [800, 600],
    }) as unknown as BrowserWindow;
    adapters.windows.set(otherWindow.webContents, otherWindow);
    service.registerWindow(otherWindow, () => ({
      owner: otherWindow,
      signal: new AbortController().signal,
      terminalDirectory: null,
    }));
    adapters.selected = otherWindow;
    service.actions()[0]!.invoke();
    await vi.waitFor(() => expect(adapters.hosts[1]?.open).toHaveBeenCalled());
    const second = adapters.hosts[1]!;
    expect(first.options.owner).toBe(window);
    expect(second.options.owner).toBe(otherWindow);
    const input = {
      ticket: "00000000-0000-4000-8000-000000000001",
      entry: { path: paths.simple, kind: "file" as const, entryToken: "1" },
      source: { id: "hosted-view", isCurrentVisible: () => true },
      revision: 3,
      signal: new AbortController().signal,
    };
    adapters.selected = window;
    expect(
      await withPathPlatform(paths.platform, () =>
        second.options.filesTerminalDrop!(input),
      ),
    ).toEqual({
      status: "accepted",
    });
    expect(adapters.semanticRequest).toHaveBeenNthCalledWith(
      1,
      otherWindow,
      expect.objectContaining({
        operation: "terminal.semanticInput.v1",
        text: paths.simpleText,
        intent: "insert",
      }),
      expect.objectContaining({
        id: input.source.id,
        actionSelectionRevision: 3,
      }),
      expect.any(AbortSignal),
      expect.any(Function),
      { dropTicket: input.ticket },
    );
    adapters.selected = otherWindow;
    expect(
      await withPathPlatform(paths.platform, () =>
        first.options.filesTerminalDrop!(input),
      ),
    ).toEqual({
      status: "accepted",
    });
    expect(adapters.semanticRequest).toHaveBeenNthCalledWith(
      2,
      window,
      expect.objectContaining({
        operation: "terminal.semanticInput.v1",
        text: paths.simpleText,
        intent: "insert",
      }),
      expect.objectContaining({
        id: input.source.id,
        actionSelectionRevision: 3,
      }),
      expect.any(AbortSignal),
      expect.any(Function),
      { dropTicket: input.ticket },
    );
    expect(adapters.semanticRequest).toHaveBeenCalledTimes(2);
  },
);

it.each([
  ["omxterm.files", "toggleFiles"],
  ["omxterm.ssh", "toggleSshConnect"],
])(
  "exposes %s's captured action through its fixed %s slot",
  async (id, shortcut) => {
    expect(service.actions()).toEqual([]);
    await installTool(id, "Original title");
    adapters.sendOpen.mockImplementation(() => {});
    let directory = "/original";
    service.registerWindow(window, () => ({
      owner: window,
      signal: new AbortController().signal,
      terminalDirectory: directory,
      sourceSessionId: "s1",
    }));
    const [action] = service.actions();
    expect(action).toMatchObject({
      id: `${id}.open`,
      shortcut,
      label: "Original title",
      accelerator: null,
    });
    action!.invoke();
    const command = adapters.sendOpen.mock.calls[0]![2];
    if (!isTerminalTabCommand(command) || command.action !== "open-extension")
      throw new Error("Expected ordinary extension admission");
    directory = "/replacement";
    expect(adapters.activate).not.toHaveBeenCalled();
    await request({ operation: "open", token: command.token, accepted: true });
    const host = adapters.hosts[0]!;
    expect(host.open).toHaveBeenCalledWith(
      expect.objectContaining({ presentation: "panel" }),
    );
    expect(
      await host.options.onRequest!(
        { operation: "terminal-directory" },
        new AbortController().signal,
        { id: "hosted-view", isCurrentVisible: () => true },
      ),
    ).toEqual({
      ok: true,
      directory: id === "omxterm.files" ? "/replacement" : "/original",
    });
    await request({ operation: "disable", id, generation: 1 });
    expect(service.actions()).toEqual([]);
    action!.invoke();
    const stale = adapters.sendOpen.mock.calls[1]![2];
    if (!isTerminalTabCommand(stale) || stale.action !== "open-extension")
      throw new Error("Expected stale guarded admission");
    await request({ operation: "open", token: stale.token, accepted: true });
    expect(adapters.activate).toHaveBeenCalledOnce();
    expect(
      adapters.sendOpen.mock.calls.every(
        (call) => (call[2] as { action: string }).action === "open-extension",
      ),
    ).toBe(true);
  },
);

it("uses the active pane's last reported directory when a retained Files view requests it", async () => {
  await installTool("omxterm.files", "Files");
  const targets = extensionInvocationTarget(window);
  const reported = new Map([
    ["s1", "/first"],
    ["s2", "/second"],
  ]);
  targets.started("s1");
  targets.started("s2");
  targets.selected("s1");
  service.registerWindow(window, (source, context) =>
    targets.capture((id) => reported.get(id), source, context),
  );
  service.actions()[0]!.invoke();
  await vi.waitFor(() => expect(adapters.hosts[0]?.open).toHaveBeenCalled());
  const host = adapters.hosts[0]!;
  const firstRequest = host.options.onRequest!(
    { operation: "terminal-directory" },
    new AbortController().signal,
    { id: "hosted-view", isCurrentVisible: () => true },
  );
  targets.selected("s2");
  expect(await firstRequest).toEqual({ ok: true, directory: "/first" });
  expect(
    await host.options.onRequest!(
      { operation: "terminal-directory" },
      new AbortController().signal,
      { id: "hosted-view", isCurrentVisible: () => true },
    ),
  ).toEqual({ ok: true, directory: "/second" });
  reported.set("s2", "/second-later");
  expect(
    await host.options.onRequest!(
      { operation: "terminal-directory" },
      new AbortController().signal,
      { id: "hosted-view", isCurrentVisible: () => true },
    ),
  ).toEqual({ ok: true, directory: "/second-later" });
});

it("refuses reordered core selection and child requests rather than using the prior pane", async () => {
  await installTool("omxterm.files", "Files");
  const targets = extensionInvocationTarget(window);
  targets.started("s1");
  targets.started("s2");
  targets.selected("s1");
  service.registerWindow(window, (source, context) =>
    targets.capture(
      (id) => (id === "s1" ? "/first" : "/second"),
      source,
      context,
    ),
  );
  service.actions()[0]!.invoke();
  await vi.waitFor(() => expect(adapters.hosts[0]?.open).toHaveBeenCalled());
  const ipc = createIpcHarness();
  const native = registerSemanticInputIpc({
    ipc: ipc.ipcMain,
    trusted: (event) => event.sender === window.webContents,
    quitting: () => false,
  });
  native.register(window);
  const event = {
    sender: window.webContents,
    senderFrame: window.webContents.mainFrame,
  };
  const handlers = new Map<string, (event: unknown, value: unknown) => void>();
  const bridge = createSemanticInputBridge({
    send(channel, value) {
      ipc.listeners.get(channel)!(event, value);
    },
    on(channel, listener) {
      handlers.set(channel, listener);
    },
    removeListener(channel) {
      handlers.delete(channel);
    },
  });
  let rendererSession = "s2";
  let rendererRevision = 2;
  const unsubscribe = subscribeNativeSemanticInput(
    bridge,
    {} as Parameters<typeof subscribeNativeSemanticInput>[1],
    () => rendererRevision,
    () => false,
    () => rendererSession,
  );
  vi.mocked(window.webContents.send).mockImplementation((channel, value) => {
    handlers.get(channel)?.({}, value);
  });
  adapters.semanticConfirm.mockImplementation(native.confirmSelection);
  const requestDirectory = () =>
    adapters.hosts[0]!.options.onRequest!(
      { operation: "terminal-directory" },
      new AbortController().signal,
      { id: "hosted-view", isCurrentVisible: () => true },
    );
  try {
    bridge.selection(1);
    await expect(requestDirectory()).resolves.toMatchObject({ ok: false });
    // New revision may arrive before its matching tab-selection notification.
    bridge.selection(2);
    await expect(requestDirectory()).resolves.toMatchObject({ ok: false });
    targets.selected("s2");
    await expect(requestDirectory()).resolves.toEqual({
      ok: true,
      directory: "/second",
    });
    // A later selection cannot turn an older request into a different target.
    rendererSession = "s1";
    rendererRevision = 3;
    await expect(requestDirectory()).resolves.toMatchObject({ ok: false });
  } finally {
    unsubscribe();
    native.dispose();
  }
});

it("opens the last reported terminal directory without a confirmation dialog", async () => {
  await installTool("omxterm.files", "Files");
  service.actions()[0]!.invoke();
  await vi.waitFor(() => expect(adapters.hosts[0]?.open).toHaveBeenCalled());
  adapters.consent.mockClear();
  const reply = await adapters.hosts[0]!.options.onRequest!(
    { operation: "terminal-directory" },
    new AbortController().signal,
    { id: "hosted-view", isCurrentVisible: () => true },
  );
  expect(reply).toEqual({ ok: true, directory: "/captured" });
  expect(adapters.consent).not.toHaveBeenCalled();
});

it("refuses the captured path if its source session ends during selection confirmation", async () => {
  await installTool("omxterm.files", "Files");
  const active = new AbortController();
  const owner = new AbortController();
  service.registerWindow(window, (_source, context) => ({
    owner: window,
    signal: context === "window" ? owner.signal : active.signal,
    terminalDirectory: "/captured",
    sourceSessionId: "s1",
  }));
  service.actions()[0]!.invoke();
  await vi.waitFor(() => expect(adapters.hosts[0]?.open).toHaveBeenCalled());
  let finish!: (value: boolean) => void;
  let capturedSignal!: AbortSignal;
  adapters.semanticConfirm.mockImplementationOnce(
    (_window, _session, _source, signal) => {
      capturedSignal = signal;
      return new Promise((resolve) => (finish = resolve));
    },
  );
  const pending = adapters.hosts[0]!.options.onRequest!(
    { operation: "terminal-directory" },
    new AbortController().signal,
    { id: "hosted-view", isCurrentVisible: () => true },
  );
  await vi.waitFor(() => expect(finish).toBeDefined());
  expect(capturedSignal.aborted).toBe(false);
  active.abort();
  expect(capturedSignal.aborted).toBe(true);
  finish(true);
  await expect(pending).resolves.toMatchObject({ ok: false });
});

it("bounds concurrent reported-directory selection confirmations in one Files view", async () => {
  await installTool("omxterm.files", "Files");
  service.actions()[0]!.invoke();
  await vi.waitFor(() => expect(adapters.hosts[0]?.open).toHaveBeenCalled());
  let finish!: (value: boolean) => void;
  adapters.semanticConfirm.mockImplementationOnce(
    () => new Promise((resolve) => (finish = resolve)),
  );
  const requestDirectory = () =>
    adapters.hosts[0]!.options.onRequest!(
      { operation: "terminal-directory" },
      new AbortController().signal,
      { id: "hosted-view", isCurrentVisible: () => true },
    );
  const first = requestDirectory();
  await vi.waitFor(() => expect(finish).toBeDefined());
  await expect(requestDirectory()).resolves.toEqual({
    ok: false,
    reason: "terminal-directory-busy",
    error: "A terminal directory request is already in progress. Try again",
  });
  await expect(
    adapters.hosts[0]!.options.onRequest!(
      { operation: "terminal-directory", sessionId: "s2" },
      new AbortController().signal,
      { id: "hosted-view", isCurrentVisible: () => true },
    ),
  ).rejects.toThrow("unavailable");
  finish(true);
  await expect(first).resolves.toEqual({ ok: true, directory: "/captured" });
  await expect(requestDirectory()).resolves.toEqual({
    ok: true,
    directory: "/captured",
  });
});

it("refuses a directory if the core renderer cannot confirm its selected pane", async () => {
  await installTool("omxterm.files", "Files");
  service.actions()[0]!.invoke();
  await vi.waitFor(() => expect(adapters.hosts[0]?.open).toHaveBeenCalled());
  adapters.semanticConfirm.mockResolvedValue(false);
  const response = await adapters.hosts[0]!.options.onRequest!(
    { operation: "terminal-directory" },
    new AbortController().signal,
    { id: "hosted-view", isCurrentVisible: () => true },
  );
  expect(response).toMatchObject({ ok: false });
});

it("does not disclose the active terminal directory to a hidden Files view", async () => {
  await installTool("omxterm.files", "Files");
  service.actions()[0]!.invoke();
  await vi.waitFor(() => expect(adapters.hosts[0]?.open).toHaveBeenCalled());
  await expect(
    adapters.hosts[0]!.options.onRequest!(
      { operation: "terminal-directory" },
      new AbortController().signal,
      { id: "hosted-view", isCurrentVisible: () => false },
    ),
  ).rejects.toThrow("unavailable");
});

it("does not disclose the active terminal directory from a background window", async () => {
  await installTool("omxterm.files", "Files");
  service.actions()[0]!.invoke();
  await vi.waitFor(() => expect(adapters.hosts[0]?.open).toHaveBeenCalled());
  adapters.selected = {};
  await expect(
    adapters.hosts[0]!.options.onRequest!(
      { operation: "terminal-directory" },
      new AbortController().signal,
      { id: "hosted-view", isCurrentVisible: () => true },
    ),
  ).rejects.toThrow("unavailable");
});

it.each([
  [
    "en-US",
    "No local directory was reported for the active terminal. It may be remote or not report its directory. Use Home or enter a path",
  ],
  [
    "pt-BR",
    "Nenhum diretório local foi informado pelo terminal ativo. Ele pode ser remoto ou não informar seu diretório. Use Pasta pessoal ou digite um caminho",
  ],
] as const)(
  "explains an unavailable active terminal directory in %s without falling back to the invocation",
  async (locale, error) => {
    await installTool("omxterm.files", "Files");
    const targets = extensionInvocationTarget(window);
    targets.started("s1");
    targets.started("s2");
    targets.selected("s1");
    service.registerWindow(window, (source, context) =>
      targets.capture(
        (id) => (id === "s1" ? "/first" : undefined),
        source,
        context,
      ),
    );
    service.actions()[0]!.invoke();
    await vi.waitFor(() => expect(adapters.hosts[0]?.open).toHaveBeenCalled());
    targets.selected("s2");
    language = locale;
    expect(
      await adapters.hosts[0]!.options.onRequest!(
        { operation: "terminal-directory" },
        new AbortController().signal,
        { id: "hosted-view", isCurrentVisible: () => true },
      ),
    ).toEqual({ ok: false, error, reason: "terminal-directory-unavailable" });
  },
);

it("does not use a directory from an ended active session", async () => {
  await installTool("omxterm.files", "Files");
  const active = new AbortController();
  const owner = new AbortController();
  service.registerWindow(window, (_source, context) => ({
    owner: window,
    signal: context === "window" ? owner.signal : active.signal,
    terminalDirectory: "/ended",
  }));
  service.actions()[0]!.invoke();
  await vi.waitFor(() => expect(adapters.hosts[0]?.open).toHaveBeenCalled());
  active.abort();
  expect(
    await adapters.hosts[0]!.options.onRequest!(
      { operation: "terminal-directory" },
      new AbortController().signal,
      { id: "hosted-view", isCurrentVisible: () => true },
    ),
  ).toEqual({
    ok: false,
    error:
      "No local directory was reported for the active terminal. It may be remote or not report its directory. Use Home or enter a path",
    reason: "terminal-directory-unavailable",
  });
});

it("rejects a Files directory request with a caller-supplied target", async () => {
  await installTool("omxterm.files", "Files");
  service.actions()[0]!.invoke();
  await vi.waitFor(() => expect(adapters.hosts[0]?.open).toHaveBeenCalled());
  await expect(
    adapters.hosts[0]!.options.onRequest!(
      { operation: "terminal-directory", sessionId: "other" },
      new AbortController().signal,
      { id: "hosted-view", isCurrentVisible: () => true },
    ),
  ).rejects.toThrow("unavailable");
});

it.each(["absent", "disabled", "removed"])(
  "empty-panel %s fallback notices once without management or execution",
  async (state) => {
    if (state !== "absent") {
      await installSnippets();
      await request({
        operation: state === "disabled" ? "disable" : "uninstall",
        id: "omxterm.snippets",
        generation: 1,
      });
    }
    adapters.picker.mockClear();
    adapters.consent.mockClear();
    expect(await request({ operation: "panel-default" })).toMatchObject({
      ok: false,
      noticeEmpty: true,
    });
    expect(await request({ operation: "panel-default" })).toMatchObject({
      ok: false,
      noticeEmpty: false,
    });
    expect(adapters.activate).not.toHaveBeenCalled();
    expect(adapters.download).not.toHaveBeenCalled();
    expect(adapters.picker).not.toHaveBeenCalled();
    expect(adapters.consent).not.toHaveBeenCalled();
    expect(adapters.sendOpen).not.toHaveBeenCalled();
    expect((await request({ operation: "snapshot" })).entries).toMatchObject(
      state === "absent" ? [] : [{ generation: 2, enabled: false }],
    );
  },
);

it("shares the notice across registered windows, not application lifetimes", async () => {
  expect(await request({ operation: "panel-default" })).toMatchObject({
    noticeEmpty: true,
  });
  const original = window;
  const contents = { mainFrame: {} };
  window = Object.assign(new EventEmitter(), {
    webContents: contents,
    isDestroyed: () => false,
  }) as unknown as BrowserWindow;
  adapters.windows.set(contents, window);
  adapters.selected = window;
  service.registerWindow(window, () => ({
    owner: window,
    signal: new AbortController().signal,
    terminalDirectory: null,
  }));
  expect(await request({ operation: "panel-default" })).toMatchObject({
    noticeEmpty: false,
  });
  window = original;
  adapters.selected = window;
  await service.dispose();
  await startService("linux");
  expect(await request({ operation: "panel-default" })).toMatchObject({
    noticeEmpty: true,
  });
});

it("finds a later installed dormant Snippets and opens it only at acknowledged admission", async () => {
  await request({ operation: "panel-default" });
  await installSnippets();
  // A different store caller may publish without refreshing the application's cache.
  const packages = await InstalledPackages.open({
    root: path.join(adapters.root, "extensions"),
    runtime: { appVersion: "0.23.0-dev.5", apiVersion: "0.1.0" },
    leases: { tryAcquire: async () => ({ release: async () => {} }) },
  });
  await packages.setEnabled("omxterm.snippets", 1, false);
  expect(await request({ operation: "panel-default" })).toMatchObject({
    ok: false,
    noticeEmpty: false,
  });
  await packages.setEnabled("omxterm.snippets", 2, true);
  const prepared = await request({ operation: "panel-default" });
  expect(prepared.openToken).toEqual(expect.any(String));
  expect(adapters.activate).not.toHaveBeenCalled();
  expect(
    await request({
      operation: "open",
      token: prepared.openToken,
      accepted: true,
    }),
  ).toEqual({ ok: true });
  expect(adapters.activate).toHaveBeenCalledOnce();
  expect(adapters.hosts[0]!.open).toHaveBeenCalledWith(
    expect.objectContaining({ presentation: "panel" }),
  );
  expect(
    await request({
      operation: "open",
      token: prepared.openToken,
      accepted: true,
    }),
  ).toMatchObject({ ok: false });
  const retained = await request({ operation: "panel-default" });
  await request({
    operation: "open",
    token: retained.openToken,
    accepted: true,
  });
  expect(adapters.hosts[0]!.reveal).toHaveBeenCalledWith(
    expect.not.objectContaining({ toggle: true }),
  );
  expect(adapters.consent).toHaveBeenCalledOnce(); // Only the deliberate installation.
});

it.each(["denied", "cancelled", "disabled", "unfocused"])(
  "refuses %s default tokens without modal guidance",
  async (cause) => {
    await installSnippets();
    adapters.consent.mockClear();
    const prepared = await request({ operation: "panel-default" });
    if (cause === "cancelled")
      await request({
        operation: "cancel-panel-default",
        token: prepared.openToken,
      });
    if (cause === "disabled")
      await request({
        operation: "disable",
        id: "omxterm.snippets",
        generation: 1,
      });
    if (cause === "unfocused") adapters.selected = {};
    expect(
      await request({
        operation: "open",
        token: prepared.openToken,
        accepted: cause !== "denied",
      }),
    ).toMatchObject({ ok: false });
    expect(adapters.activate).not.toHaveBeenCalled();
    expect(adapters.consent).not.toHaveBeenCalled();
    expect(adapters.sendOpen).not.toHaveBeenCalled();
  },
);

it.for(["same-turn", "post-cancel GC"] as const)(
  "cancels an in-flight activation before it can allocate a late view: %s",
  async (boundary, { skip }) => {
    // The collection boundary runs with Vitest --execArgv=--expose-gc.
    if (boundary === "post-cancel GC" && !globalThis.gc)
      skip("Requires --expose-gc");
    await installSnippets();
    let finish!: () => void;
    adapters.activate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => {
            void applicationBackend(
              adapters.root,
              adapters.backendLifetime.signal,
            ).then(resolve);
          };
        }),
    );
    const prepared = await request({ operation: "panel-default" });
    const opening = request({
      operation: "open",
      token: prepared.openToken,
      accepted: true,
    });
    await vi.waitFor(() => expect(adapters.activate).toHaveBeenCalledOnce());
    await request({
      operation: "cancel-panel-default",
      token: prepared.openToken,
    });
    if (boundary === "post-cancel GC") {
      // Do not observe the composite after cancellation: that would latch
      // Node's lazy abort and hide loss of the now-unowned source.
      await new Promise<void>((resolve) => setImmediate(resolve));
      globalThis.gc!();
    }
    finish();
    const result = await opening;
    // Keep phase facts if the original intermittent pre-activation failure recurs.
    const phase = JSON.stringify({
      activationCalls: adapters.activate.mock.calls.length,
      allocatedViews: adapters.hosts.length,
      retirementCalls: adapters.hosts.map(
        (host) => host.retire.mock.calls.length,
      ),
    });
    expect(result, phase).toEqual({ ok: false });
    expect(adapters.hosts, phase).toHaveLength(0);
  },
);

it.each(["complete", "cancel", "supersede"] as const)(
  "settles a completed manager open before default acknowledgement: %s",
  async (outcome) => {
    await service.dispose();
    let entered!: () => void;
    let release!: () => void;
    const completed = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const reply = new Promise<void>((resolve) => {
      release = resolve;
    });
    let admitted: AbortSignal | undefined;
    const create = extensionManager.createExtensionManager;
    const spy = vi
      .spyOn(extensionManager, "createExtensionManager")
      .mockImplementationOnce((options) => {
        const manager = create(options);
        const action = manager.action;
        manager.action = (selection) => {
          const open = action(selection);
          return async (target) => {
            // Retain the real manager/store/view path, then hold only its reply.
            // A cancelled completion must not acknowledge a now-retired view.
            await open(target);
            admitted = target.signal;
            entered();
            await reply;
          };
        };
        return manager;
      });
    try {
      await startService("linux");
      await installSnippets();
      const prepared = await request({ operation: "panel-default" });
      const opening = request({
        operation: "open",
        token: prepared.openToken,
        accepted: true,
      });
      await Promise.race([
        completed,
        opening.then(() => {
          throw new Error("Open acknowledged before the controlled reply");
        }),
      ]);
      expect(admitted?.aborted).toBe(false);
      expect(adapters.hosts).toHaveLength(1);
      let replacement: Awaited<ReturnType<typeof request>> | undefined;
      if (outcome === "cancel")
        await request({
          operation: "cancel-panel-default",
          token: prepared.openToken,
        });
      else if (outcome === "supersede")
        replacement = await request({ operation: "panel-default" });
      expect(admitted?.aborted).toBe(outcome !== "complete");
      release();
      expect(await opening).toEqual({ ok: outcome === "complete" });
      if (outcome === "complete") {
        await request({
          operation: "cancel-panel-default",
          token: prepared.openToken,
        });
        expect(adapters.hosts[0]!.retire).not.toHaveBeenCalled();
      } else {
        expect(adapters.hosts[0]!.retire).toHaveBeenCalledOnce();
        if (replacement) {
          const retirement = adapters.hosts[0]!.retire.mock.results[0]!;
          if (retirement.type === "return") await retirement.value;
          expect(
            await request({
              operation: "open",
              token: replacement.openToken,
              accepted: true,
            }),
          ).toEqual({ ok: true });
        }
      }
    } finally {
      release();
      spy.mockRestore();
    }
  },
);

it("revokes a prepared default on native blur even when the window refocuses before acknowledgement", async () => {
  await installSnippets();
  const prepared = await request({ operation: "panel-default" });
  window.emit("blur");
  expect(window.webContents.send).toHaveBeenCalledWith(expect.any(String), {
    action: "cancel-panel-default",
  });
  // getFocusedWindow again returns this owner: its old intent stays revoked.
  expect(
    await request({
      operation: "open",
      token: prepared.openToken,
      accepted: true,
    }),
  ).toEqual({ ok: false, error: "unavailable" });
  expect(adapters.activate).not.toHaveBeenCalled();
});

it("native blur cancels held activation before publication without activating a late view", async () => {
  await installSnippets();
  let finish!: () => void;
  adapters.activate.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = () => {
          void applicationBackend(
            adapters.root,
            adapters.backendLifetime.signal,
          ).then(resolve);
        };
      }),
  );
  const prepared = await request({ operation: "panel-default" });
  const opening = request({
    operation: "open",
    token: prepared.openToken,
    accepted: true,
  });
  await vi.waitFor(() => expect(adapters.activate).toHaveBeenCalledOnce());
  window.emit("blur");
  finish();
  expect(await opening).toEqual({ ok: false });
  expect(adapters.hosts).toHaveLength(0);
});

it("notifies renderer intent after publication but retains an already opened tool and cleans native listeners", async () => {
  await installSnippets();
  const prepared = await request({ operation: "panel-default" });
  expect(
    await request({
      operation: "open",
      token: prepared.openToken,
      accepted: true,
    }),
  ).toEqual({ ok: true });
  const listeners = window.listenerCount("blur");
  service.registerWindow(window, () => ({
    owner: window,
    signal: new AbortController().signal,
    terminalDirectory: null,
  }));
  expect(window.listenerCount("blur")).toBe(listeners);
  window.emit("blur");
  expect(window.webContents.send).toHaveBeenCalledWith(expect.any(String), {
    action: "cancel-panel-default",
  });
  expect(adapters.hosts[0]!.retire).not.toHaveBeenCalled();
  await service.dispose();
  expect(window.listenerCount("blur")).toBe(0);
});

it("makes activation errors nonmodal without retiring successful later work", async () => {
  await installSnippets();
  adapters.consent.mockClear();
  adapters.activate.mockRejectedValueOnce(new Error("private failure"));
  const first = await request({ operation: "panel-default" });
  expect(
    await request({
      operation: "open",
      token: first.openToken,
      accepted: true,
    }),
  ).toMatchObject({ ok: false, noticeEmpty: true });
  const second = await request({ operation: "panel-default" });
  const result = await request({
    operation: "open",
    token: second.openToken,
    accepted: true,
  });
  expect(result).toEqual({ ok: true });
  await request({ operation: "cancel-panel-default", token: second.openToken });
  expect(adapters.hosts[0]!.retire).not.toHaveBeenCalled();
  expect(adapters.consent).not.toHaveBeenCalled();
});

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
  expect(await request({ operation: "panel-default" })).toMatchObject({
    ok: false,
    noticeEmpty: true,
  });
  expect(await request({ operation: "panel-default" })).toMatchObject({
    ok: false,
    noticeEmpty: false,
  });
  expect(adapters.sendOpen).not.toHaveBeenCalled();
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
it.each(["files", "ssh"] as const)(
  "retains companion %s after its source terminal ends and toggles the same view",
  (tool) =>
    exerciseCompanionRouting(
      { archive, window, service, request },
      adapters,
      tool,
    ),
);

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

it.each(
  pathCases.flatMap((paths) =>
    [false, true].map((declared) => [paths, declared] as const),
  ),
)(
  "admits lexical path insertion with %s only from a declared visible view (%s)",
  async (paths, declared) => {
    await writeFile(
      archive,
      packageArchive([
        {
          name: "extension.json",
          data: JSON.stringify({
            ...manifest,
            ...(declared ? { capabilities: ["terminal.insertPath.v1"] } : {}),
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
    const visible = vi.fn(() => true);
    const context = {
      id: "authenticated-native-view",
      actionSelectionRevision: 7,
      isCurrentVisible: visible,
    };
    const listener = vi.fn();
    host.options.subscribeSelection!(listener);
    expect(adapters.semanticSubscribe).toHaveBeenCalledExactlyOnceWith(
      window,
      listener,
    );
    const signal = new AbortController().signal;
    const value: { operation: string; path: string } = {
      operation: "terminal.insertPath.v1",
      path: paths.multiline,
    };
    adapters.semanticRequest.mockResolvedValue({ ok: true });
    const invoke = (input: typeof value & { target?: string }) =>
      withPathPlatform(paths.platform, () =>
        host.options.onRequest!(input, signal, context),
      );
    if (!declared) {
      await expect(invoke(value)).rejects.toThrow("unavailable");
      expect(adapters.semanticRequest).not.toHaveBeenCalled();
      return;
    }
    visible.mockReturnValue(false);
    await expect(invoke(value)).rejects.toThrow("unavailable");
    visible.mockReturnValue(true);
    await expect(invoke(value)).resolves.toEqual({ ok: true });
    expect(adapters.semanticRequest).toHaveBeenCalledExactlyOnceWith(
      window,
      {
        operation: "terminal.semanticInput.v1",
        text: paths.multilineText,
        title: "File path",
        intent: "insert",
        preview: false,
      },
      context,
      expect.any(AbortSignal),
      expect.any(Function),
      true,
    );
    expect(host.claimActivation).toHaveBeenCalledExactlyOnceWith(context.id);
    for (const path of [
      "relative",
      paths.otherGrammar,
      paths.root + "\0bad",
      paths.root + "x".repeat(32_768),
    ])
      await expect(invoke({ ...value, path })).resolves.toEqual({
        ok: false,
        reason: "invalid-path",
      });
    if (paths.platform === "linux")
      await expect(
        invoke({ ...value, path: paths.root + "'".repeat(20_000) }),
      ).resolves.toEqual({ ok: false, reason: "invalid-path" });
    for (const path of [
      paths.root + "\u001b[201~bad",
      paths.root + "\u009b201~bad",
    ])
      await expect(invoke({ ...value, path })).resolves.toEqual({
        ok: false,
        reason: "unsafe-path",
      });
    await expect(invoke({ ...value, target: "s1" })).resolves.toEqual({
      ok: false,
      reason: "invalid-path",
    });
    expect(adapters.semanticRequest).toHaveBeenCalledOnce();
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
    const target = { sessionId: "s1", menuId: 1, hasSelection: false };
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
  const target = { sessionId: "s1", menuId: 1, hasSelection: false };
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
  expect(adapters.hosts[0]!.open).toHaveBeenCalledWith(
    expect.not.objectContaining({ presentation: "panel" }),
  );
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
