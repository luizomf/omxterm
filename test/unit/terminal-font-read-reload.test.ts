// @vitest-environment node
// Real native bytes/validation in Node's binary-data realm, with DOM-only JSDOM.
// The existing fake Restty harness keeps this regression headless.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import path from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (
    html: string,
    options: { pretendToBeVisual: boolean },
  ) => { window: Window & typeof globalThis };
};
import { harness as runtime } from "../fixtures/restty-surface-harness";
import {
  registerTerminalIpcRouter,
  type IpcMainPort,
} from "../../src/main/terminal-ipc-controller";
import { loadTerminalFontData } from "../../src/main/terminal-font-data";
import { terminalRendererConfiguration } from "../../src/main/active-user-configuration";
import { DEFAULT_USER_CONFIGURATION } from "../../src/main/user-configuration";
import {
  createUserConfigurationReloader,
  terminalSurfaceFontBaseline,
} from "../../src/main/user-configuration-reloader";
import { mountTerminalWindowPage } from "../../src/renderer/terminal-window-host";
import { createElectronTerminalAdapter } from "../../src/renderer/electron-terminal-adapter";
import { mountResttyTerminalSurface } from "../../src/terminal-surface/restty-terminal-surface";
import type { TerminalFontInput } from "../../src/terminal-surface/terminal-font-stack";
import type { TerminalBridge } from "../../src/shared/terminal-bridge";
import type { TerminalRendererConfiguration } from "../../src/shared/user-configuration";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import type { TerminalFontData } from "../../src/shared/terminal-font-data";
import type { TerminalTabCommand } from "../../src/shared/terminal-contract";

const io = vi.hoisted(() => ({
  gate: undefined as undefined | { entered(): void; wait: Promise<void> },
  fontPath: undefined as string | undefined,
  open: 0,
  closed: 0,
  reads: 0,
}));
// Hold an actual FileHandle.read BEFORE its real positional read. stat, bounds,
// byte allocation, subsequent read and face validation are production code.
vi.mock("node:fs/promises", async (original) => {
  const fs = await original<typeof import("node:fs/promises")>();
  return {
    ...fs,
    open: async (...args: Parameters<typeof fs.open>) => {
      const file = await fs.open(...args);
      io.open += 1;
      return new Proxy(file, {
        get(target, key) {
          if (key === "read")
            return async (...readArgs: unknown[]) => {
              io.reads += 1;
              const gate = io.gate;
              if (gate) {
                io.gate = undefined;
                gate.entered();
                await gate.wait;
              }
              const result: unknown = Reflect.apply(
                target.read,
                target,
                readArgs,
              );
              return result;
            };
          if (key === "close")
            return async () => {
              await target.close();
              io.closed += 1;
            };
          const value: unknown = Reflect.get(target, key);
          return typeof value === "function"
            ? (value as (...args: unknown[]) => unknown).bind(target)
            : value;
        },
      });
    },
  };
});
// Only installed discovery is synthetic. No native helper, GUI or OS fonts.
// Real licensed repository TTFs go through the real bounded reader and parser.
vi.mock("../../src/main/installed-font-family", async (original) => {
  const native =
    await original<typeof import("../../src/main/installed-font-family")>();
  return {
    ...native,
    installedFontDataForRestty: (family: string) =>
      native.installedFontDataForRestty(
        family,
        async (_file, args) => {
          if (args.at(-1) !== `${family}:style=Regular`)
            return { stdout: "missing\n" };
          const filename =
            family === "DejaVu Sans Mono"
              ? "DejaVuSansMono.ttf"
              : "FiraCodeNerdFontMono-Regular.ttf";
          return {
            stdout:
              [
                family,
                "80",
                "0",
                io.fontPath ?? path.resolve("assets/fonts", filename),
                "",
              ].join("\u001f") + "\n",
          };
        },
        "linux",
      ),
    installedFallbackFontData: async () => [],
  };
});

const A = "DejaVu Sans Mono";
const B = "FiraCode Nerd Font Mono";
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function holdRead() {
  const entered = deferred();
  const release = deferred();
  io.gate = { entered: () => entered.resolve(), wait: release.promise };
  readReleases.push(() => release.resolve());
  return { entered: entered.promise, release: () => release.resolve() };
}
const cleanups: Array<() => void | Promise<void>> = [];
const readReleases: Array<() => void> = [];
beforeEach(() => {
  // Keep Node's binary-data realm for the real font parser; supply DOM only.
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
  });
  for (const name of [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "HTMLInputElement",
    "HTMLTextAreaElement",
    "Element",
    "Node",
    "AbortController",
    "AbortSignal",
    "getComputedStyle",
  ] as const)
    vi.stubGlobal(name, name === "window" ? dom.window : dom.window[name]);
  cleanups.push(() => {
    dom.window.close();
    vi.unstubAllGlobals();
  });
  runtime.instances.length = 0;
  runtime.setInitError(undefined);
  runtime.setInitGate(undefined);
  io.gate = undefined;
  io.fontPath = undefined;
  io.open = io.closed = io.reads = 0;
});
afterEach(async () => {
  // Release a held read before draining disposed owners, even on assertion failure.
  for (const release of readReleases.splice(0)) release();
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  expect(io.closed, "all actual font file handles closed").toBe(io.open);
});

function fixture(initialFamily?: string) {
  const handlers = new Map<string, Parameters<IpcMainPort["handle"]>[1]>();
  const listeners = new Map<string, Parameters<IpcMainPort["on"]>[1]>();
  const load = vi.fn(loadTerminalFontData);
  const router = registerTerminalIpcRouter(
    {
      handle: (key, value) => {
        handlers.set(key, value);
      },
      on: (key, value) => {
        listeners.set(key, value);
      },
      removeHandler: (key) => {
        handlers.delete(key);
      },
      removeListener: (key) => {
        listeners.delete(key);
      },
    },
    undefined,
    load,
  );
  const updates = new Set<
    (configuration: TerminalRendererConfiguration) => void
  >();
  const webContents = {
    mainFrame: {},
    isDestroyed: () => false,
    send(channel: string, payload: unknown) {
      if (channel === terminalIpc.configurationUpdate)
        for (const update of updates)
          update(payload as TerminalRendererConfiguration);
    },
  };
  const event = { sender: webContents, senderFrame: webContents.mainFrame };
  const initial = {
    configuration: {
      ...DEFAULT_USER_CONFIGURATION,
      ...(initialFamily ? { fontFamily: initialFamily } : {}),
    },
    userFileErrors: [],
  };
  const createSession = vi.fn(() => ({
    write: vi.fn(),
    resize: vi.fn(),
    close: vi.fn(),
    hasForegroundChildProcess: () => false,
  }));
  const controller = router.registerController({
    webContents,
    configuration: terminalRendererConfiguration(initial, 0),
    createSession,
    onSessionStartError() {},
    onSessionExit() {},
    onSessionStarted() {},
    onSessionSelected() {},
    onTitleRequest() {},
    onBell() {},
    onUserInteraction() {},
    writeClipboardText() {},
    readClipboardText: () => "",
    confirmPaste: async () => false,
    showClipboardContextMenu() {},
    openExternalLink: async () => {},
    onExternalLinkOpenError() {},
    loadSnippets: async () => ({ snippets: [] }),
    loadLocalImage: async () => null,
  });
  const bridge = {
    retainSurface: async (id: string) =>
      handlers.get(terminalIpc.retainSurface)!(event, id),
    releaseSurface: (id: string) =>
      listeners.get(terminalIpc.releaseSurface)!(event, id),
    start: async (id?: string) => handlers.get(terminalIpc.start)!(event, id),
    close: (sessionId: string, reason?: "rendering-failure") =>
      listeners.get(terminalIpc.close)!(event, {
        sessionId,
        ...(reason ? { reason } : {}),
      }),
    onOutput: () => () => {},
    onExit: () => () => {},
    resize() {},
    acknowledgeOutput() {},
  } as unknown as TerminalBridge;
  let requested = initial.configuration;
  let command: (value: TerminalTabCommand) => void = () => {
    throw new Error("Host not ready");
  };
  const reloader = createUserConfigurationReloader({
    initial,
    ...terminalSurfaceFontBaseline(initial.configuration),
    load: async () => ({ configuration: requested }),
    activeTerminalSurfaceFontConfigurations:
      router.activeTerminalSurfaceFontConfigurations,
    apply: (state) =>
      router.applyConfiguration(terminalRendererConfiguration(state, 0)),
  });
  const tabStrip = document.createElement("nav");
  const tabsContainer = document.createElement("main");
  const banner = document.createElement("aside");
  document.body.replaceChildren(tabStrip, tabsContainer, banner);
  const outcomes: Array<{
    family: string | undefined;
    status: string;
    error?: string;
  }> = [];
  const mounts: Promise<unknown>[] = [];
  const requests: Promise<unknown>[] = [];
  const request = (family?: string) => {
    const promise = handlers.get(terminalIpc.fontData)!(
      event,
      family,
    ) as Promise<TerminalFontData>;
    requests.push(
      promise.then(
        (data) => {
          outcomes.push({
            family: data.configured?.family,
            status: "fulfilled",
          });
          return data;
        },
        (error: Error) => {
          outcomes.push({ family, status: "rejected", error: error.message });
        },
      ),
    );
    return promise;
  };
  const host = mountTerminalWindowPage(
    { tabStrip, tabsContainer },
    {
      configuration: handlers.get(terminalIpc.configuration)!(
        event,
      ) as TerminalRendererConfiguration,
      createAdapter: (id) => createElectronTerminalAdapter(bridge, id),
      mount: (...args) => {
        const result = mountResttyTerminalSurface(...args);
        mounts.push(
          result.then(
            () => "mounted",
            () => "failed",
          ),
        );
        return result;
      },
      userFileErrorBanner: banner,
      loadFontData: request,
      subscribeToTabCommands(listener) {
        command = listener;
        return () => {};
      },
      subscribeToConfigurationUpdates(listener) {
        updates.add(listener);
        return () => {
          updates.delete(listener);
        };
      },
    },
  );
  void host.ready.catch(() => {});
  cleanups.push(async () => {
    host.dispose();
    router.dispose();
    await Promise.all([...mounts, ...requests]);
  });
  return {
    host,
    router,
    controller,
    createSession,
    load,
    request,
    outcomes,
    handlers,
    event,
    banner,
    command: (value: TerminalTabCommand) => command(value),
    settled: async () => {
      await Promise.all([...mounts, ...requests]);
    },
    async reload(fontFamily?: string, fontLineHeight = 1) {
      requested = {
        ...DEFAULT_USER_CONFIGURATION,
        fontLineHeight,
        ...(fontFamily ? { fontFamily } : {}),
      };
      await reloader.reload();
    },
  };
}

async function concurrentRace() {
  const app = fixture();
  await app.host.ready;
  const original = runtime.instances[0];
  await app.reload(A);
  const gate = holdRead();
  app.command({ action: "new" });
  app.command({ action: "new" });
  await gate.entered;
  expect(app.createSession).toHaveBeenCalledTimes(1);
  expect(runtime.instances).toHaveLength(1); // No runtime init yet for A.
  expect(app.load.mock.calls).toEqual([[undefined], [A]]); // Two consumers, one actual read.
  expect(
    app.router
      .activeTerminalSurfaceFontConfigurations()
      .map((c) => c.fontFamily),
  ).toEqual([undefined, A, A]);
  await app.reload(B);
  app.command({ action: "new" });
  expect(app.load.mock.calls).toEqual([[undefined], [A]]); // B serialized behind A.
  gate.release();
  await app.settled();
  expect(runtime.instances[0]).toBe(original);
  expect(original!.destroy).not.toHaveBeenCalled();
  expect(io.open).toBe(2);
  expect(io.closed).toBe(2);
  expect(io.reads).toBeGreaterThanOrEqual(2);
  return app;
}

it("finishes both started A consumers across reload while new B waits for the bounded read", async () => {
  const app = await concurrentRace();
  expect(app.outcomes).toEqual([
    { family: undefined, status: "fulfilled" },
    { family: A, status: "fulfilled" },
    { family: B, status: "fulfilled" },
  ]);
  expect(app.createSession).toHaveBeenCalledTimes(4);
  expect(app.router.activeTerminalSurfaceFontConfigurations()).toEqual([
    { fontLineHeight: 1 },
    { fontFamily: A, fontLineHeight: 1 },
    { fontFamily: A, fontLineHeight: 1 },
    { fontFamily: B, fontLineHeight: 1 },
  ]);
  expect(document.querySelectorAll("[role=tab]")).toHaveLength(4);
  expect(app.banner.textContent).toContain("font.family");
  const firstA = runtime.instances[1]!.options.terminal
    .fonts![0]! as TerminalFontInput;
  const secondA = runtime.instances[2]!.options.terminal
    .fonts![0]! as TerminalFontInput;
  expect(firstA.name).toBe(A);
  expect(secondA.data).toBe(firstA.data);
  expect(Buffer.from(firstA.data as ArrayBuffer)).toEqual(
    await readFile(path.resolve("assets/fonts/DejaVuSansMono.ttf")),
  );
  expect(runtime.instances[3]!.options.terminal.fonts![0]).toMatchObject({
    name: B,
  });
});

it("completes a genuine pending A read across a line-height-only reload", async () => {
  const gate = holdRead();
  const app = fixture(A);
  await Promise.race([
    gate.entered,
    app.host.ready.then(
      () => {
        throw new Error(
          `Read gate bypassed: ${JSON.stringify({ outcomes: app.outcomes, open: io.open, reads: io.reads })}`,
        );
      },
      (error: unknown) => {
        throw error;
      },
    ),
  ]);
  await app.reload(A, 1.5);
  gate.release();
  await app.host.ready;
  await app.settled();
  expect(app.outcomes).toEqual([{ family: A, status: "fulfilled" }]);
  expect(runtime.instances[0]!.options.terminal.lineHeight).toBe(1);
  expect(app.router.activeTerminalSurfaceFontConfigurations()).toEqual([
    { fontFamily: A, fontLineHeight: 1 },
  ]);
});

it("keeps a genuine bounded-read validation failure visible across reload instead of substituting B", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-corrupt-font-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  io.fontPath = path.join(root, "corrupt.ttf");
  await writeFile(io.fontPath, Buffer.alloc(32));
  const app = fixture();
  await app.host.ready;
  await app.reload(A);
  const gate = holdRead();
  app.command({ action: "new" });
  await gate.entered;
  await app.reload(B);
  gate.release();
  await app.settled();
  expect(app.outcomes[1]).toMatchObject({
    family: A,
    status: "rejected",
    error: expect.stringContaining("unsupported or corrupt format") as unknown,
  });
  expect(app.createSession).toHaveBeenCalledTimes(1);
  expect(runtime.instances).toHaveLength(1);
  expect(io.open).toBe(1);
  expect(io.closed).toBe(1);
});

it("rejects a pending read after controller disposal and starts no removed-owner session", async () => {
  const gate = holdRead();
  const app = fixture(A);
  await gate.entered;
  app.host.dispose();
  app.controller.dispose();
  gate.release();
  await app.host.ready;
  await app.settled();
  expect(app.outcomes).toEqual([
    {
      family: A,
      status: "rejected",
      error: "Terminal Font request was superseded",
    },
  ]);
  expect(app.createSession).not.toHaveBeenCalled();
  expect(runtime.instances).toHaveLength(0);
  expect(app.router.activeTerminalSurfaceFontConfigurations()).toEqual([]);
});

it("cancels one pending A consumer during reload without cancelling its shared live sibling", async () => {
  const app = fixture();
  await app.host.ready;
  await app.reload(A);
  const gate = holdRead();
  app.command({ action: "new" });
  app.command({ action: "new" });
  await gate.entered;
  await app.reload(B);
  app.command({ action: "close" });
  gate.release();
  await app.settled();
  expect(app.createSession).toHaveBeenCalledTimes(2);
  expect(app.load.mock.calls).toEqual([[undefined], [A]]);
  expect(
    app.router
      .activeTerminalSurfaceFontConfigurations()
      .map((c) => c.fontFamily),
  ).toEqual([undefined, A]);
  expect(runtime.instances).toHaveLength(2);
});
