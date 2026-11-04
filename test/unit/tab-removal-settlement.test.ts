import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import type { IPty } from "node-pty";
import { build } from "esbuild";
import { beforeAll, expect, it, vi } from "vitest";
import { createResttyHostSessions } from "../fixtures/restty-host-sessions";
import { usesOptionalSnippets } from "../../src/shared/snippets-mode";
import { applyChromiumGpuPolicy } from "../../src/main/chromium-gpu-policy";

let entry: string;
beforeAll(async () => {
  const result = await build({
    entryPoints: ["test/fixtures/tab-removal-main.ts"],
    bundle: false,
    format: "cjs",
    platform: "node",
    write: false,
  });
  entry = result.outputFiles[0]!.text;
});

function heldPty() {
  let exited: (event: { exitCode: number; signal?: number }) => void = () => {};
  let onData: (data: string) => void = () => {};
  const pty = {
    process: "fixture",
    onData(listener: typeof onData) {
      onData = listener;
      return { dispose() {} };
    },
    onExit(listener: typeof exited) {
      exited = listener;
      return { dispose() {} };
    },
    write: vi.fn(),
    kill: vi.fn(),
    resize: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  };
  return {
    pty: pty as unknown as IPty,
    kill: pty.kill,
    write: pty.write,
    output: (data: string) => onData(data),
    acknowledgeExit: () => exited({ exitCode: 0, signal: 0 }),
  };
}

function harness(
  options: {
    observeFocus?: boolean;
    delayFocus?: boolean;
    loseFocusDuringDom?: boolean;
  } = {},
) {
  const nodeRequire = createRequire(import.meta.url);
  const ptys: ReturnType<typeof heldPty>[] = [];
  const sessions: Array<{ write(data: string): void }> = [];
  const surface = {};
  const canvases = [
    { isConnected: true },
    { isConnected: true },
    { isConnected: false },
  ];
  const renderer = {
    originalCanvases: canvases,
    document: {
      activeElement: surface,
      querySelectorAll: () => canvases.slice(0, 2),
      querySelector: () => ({
        contains: (element: unknown) => element === surface,
      }),
    },
  };
  let coreFocused = false;
  const focusChecks: boolean[] = [];
  let releaseFocus!: () => void;
  const focusAcknowledged = new Promise<void>((resolve) => {
    releaseFocus = resolve;
  });
  let readClipboard = () => "";
  let retire!: (settled: boolean) => void;
  const retirement = new Promise<boolean>((resolve) => {
    retire = resolve;
  });
  const host = {
    dispose: vi.fn(() => retirement),
    install: vi.fn(async () => {}),
    toggle: vi.fn(),
    assertActivated: vi.fn(),
    started() {},
    selected() {},
    ended() {},
  };
  const app = Object.assign(new EventEmitter(), {
    commandLine: { appendSwitch: vi.fn() },
    setPath() {},
    whenReady: async () => {},
    getVersion: () => "0.24.0-dev.33",
    exit: vi.fn(),
  });
  const processPort = Object.assign(new EventEmitter(), {
    argv: ["--tab-removal-positive"],
    platform: "win32" as const,
    arch: "arm64",
    env: {},
    stderr: { write: vi.fn() },
    stdout: { write: vi.fn() },
  });
  const writeSync = vi.fn();
  const router = {
    dispose() {},
    registerController(options: {
      createSession(callbacks: { onOutput(): void; onExit(): void }): {
        write(data: string): void;
      };
      onSessionSelected(session: string): void;
      readClipboardText(): string;
    }) {
      readClipboard = options.readClipboardText;
      for (let index = 0; index < 3; index++)
        sessions.push(options.createSession({ onOutput() {}, onExit() {} }));
      options.onSessionSelected("s1");
      return {};
    },
  };
  class HostedView {
    webContents = {
      isDestroyed: () => false,
      isFocused: () => !coreFocused,
      getURL: () => "omx-extension://fixture/index.html",
      executeJavaScript: async (script: string) => {
        if (script.includes(".click()")) {
          sessions[0]!.write("snippet\r");
          ptys[0]!.output("RECEIVED:snippet\r\n");
        }
        return true;
      },
    };
    getVisible() {
      return true;
    }
  }
  const hosted = new HostedView();
  const focusCore = vi.fn();
  const windowFocus = vi.fn();
  class Window extends EventEmitter {
    destroyed = false;
    webContents = {
      on() {},
      send(channel: string) {
        if (options.observeFocus && channel === "clipboard") {
          readClipboard();
          sessions[0]!.write("paste");
        }
      },
      sendInputEvent() {},
      isFocused: () => coreFocused,
      focus: focusCore,
      executeJavaScript: async (script: string) => {
        if (!options.observeFocus) return undefined;
        const value = runInNewContext(script, renderer) as unknown;
        if (
          options.loseFocusDuringDom &&
          script ===
            "document.querySelector('.terminal-surface').contains(document.activeElement)"
        )
          coreFocused = false;
        return value;
      },
    };
    contentView = { children: options.observeFocus ? [hosted] : [] };
    loadFile = async () => {};
    show() {}
    focus = windowFocus;
    isVisible() {
      return true;
    }
    isMinimized() {
      return false;
    }
    isFocused() {
      return true;
    }
    isDestroyed() {
      return this.destroyed;
    }
    destroy() {
      this.destroyed = true;
    }
  }
  // The real session owner returns values from the outer JS realm; compare
  // the C-exit record by value rather than by the VM's Object prototype.
  const assertPort = Object.assign(
    (...args: Parameters<typeof assert>) => assert(...args),
    assert,
    {
      deepEqual: (actual: unknown, expected: unknown) =>
        assert.deepEqual(JSON.stringify(actual), JSON.stringify(expected)),
    },
  );
  const ports: Record<string, unknown> = {
    "node:assert/strict": assertPort,
    "node:fs": { mkdirSync() {}, writeSync },
    electron: {
      app,
      BrowserWindow: Window,
      ipcMain: {},
      WebContentsView: HostedView,
    },
    "../../src/main/chromium-gpu-policy": {
      applyChromiumGpuPolicy: (commandLine: typeof app.commandLine) =>
        applyChromiumGpuPolicy(commandLine, processPort.platform),
    },
    "../../src/main/terminal-window": { terminalWindowOptions: () => ({}) },
    "../../src/main/terminal-window-host": { registerTerminalWindowHost() {} },
    "../../src/main/terminal-ipc-controller": {
      registerTerminalIpcRouter: () => router,
    },
    "../../src/main/active-user-configuration": {
      terminalRendererConfiguration: () => ({}),
    },
    "../../src/main/user-configuration": { DEFAULT_USER_CONFIGURATION: {} },
    "../../src/shared/terminal-ipc": {
      terminalIpc: { clipboardAction: "clipboard" },
    },
    "../../src/shared/snippets-mode": { usesOptionalSnippets },
    "../../src/main/extension-view-host": { registerExtensionViewScheme() {} },
    "../../src/main/snippets": {},
    "./fixture-snippets-host": { startFixtureSnippetsHost: async () => host },
    "./native-fixture-pty": {
      spawnFixturePty: () => {
        const pty = heldPty();
        ptys.push(pty);
        if (options.observeFocus && ptys.length === 3)
          pty.write.mockImplementation(() => pty.acknowledgeExit());
        return pty.pty;
      },
    },
    "./restty-host-platform": {
      nativeFixturePlatform: { defaultShell: "fixture.exe" },
    },
    "./restty-host-sessions": { createResttyHostSessions },
    "./tab-removal-initial-readiness": {
      initialTabRemovalReadiness: async () => {},
    },
    "./tab-removal-readiness": {
      TAB_REMOVAL_CONTROL_PREFIX: "CONTROL:",
      createTabRemovalReadiness: () => ({
        waitFor: async (
          phase: string,
          predicate: () => boolean | Promise<boolean>,
        ) => {
          if (options.observeFocus && phase === "snippet-focus") {
            let focused = await predicate();
            focusChecks.push(focused);
            if (!focused && options.delayFocus) {
              await focusAcknowledged;
              focused = await predicate();
              focusChecks.push(focused);
            }
            if (!focused) throw new Error("native core focus not observed");
          }
        },
        // Focus controls execute the actual click and final verification; other
        // UI scenario details are outside this local lifecycle test seam.
        step: async (phase: string, action: () => unknown) =>
          ["app-ready", "window", "load"].includes(phase) ||
          (options.observeFocus &&
            ["snippet-click", "verification"].includes(phase))
            ? action()
            : undefined,
      }),
    },
  };
  runInNewContext(entry, {
    __dirname: "/fixture-only",
    module: { exports: {} },
    exports: {},
    process: processPort,
    require(id: string) {
      if (id in ports) return ports[id];
      if (id.startsWith("node:")) return nodeRequire(id) as unknown;
      throw new Error(`Unexpected fixture dependency: ${id}`);
    },
  });
  return {
    app,
    processPort,
    host,
    ptys,
    retire,
    writeSync,
    focusChecks,
    focusCore,
    windowFocus,
    renderer,
    hosted,
    releaseFocus,
    setCoreFocused: (value: boolean) => {
      coreFocused = value;
    },
  };
}

async function beginPtyDrain(h: ReturnType<typeof harness>) {
  await vi.waitFor(() => expect(h.host.dispose).toHaveBeenCalledOnce());
  expect(h.ptys).toHaveLength(3);
  expect(h.ptys.every((pty) => pty.kill.mock.calls.length === 0)).toBe(true);
  h.retire(true);
  await vi.waitFor(() =>
    expect(h.ptys.every((pty) => pty.kill.mock.calls.length === 1)).toBe(true),
  );
  expect(h.writeSync).toHaveBeenCalledWith(
    1,
    "__OMXTERM_TAB_REMOVAL_SNIPPETS__joined\n",
  );
  expect(h.app.exit).not.toHaveBeenCalled();
}

it("a late exception after Snippets retirement cannot turn the held PTY join into exit 0", async () => {
  const h = harness();
  await beginPtyDrain(h);
  h.processPort.emit("uncaughtException", new Error("late fixture failure"));
  for (const pty of h.ptys) pty.acknowledgeExit();
  await vi.waitFor(() => expect(h.app.exit).toHaveBeenCalledOnce());
  expect(h.app.exit).toHaveBeenCalledExactlyOnceWith(1);
});

it("an error while backend retirement is pending does not start PTY teardown early", async () => {
  const h = harness();
  await vi.waitFor(() => expect(h.host.dispose).toHaveBeenCalledOnce());
  h.processPort.emit("unhandledRejection", new Error("retirement pending"));
  expect(h.ptys.every((pty) => pty.kill.mock.calls.length === 0)).toBe(true);
  h.retire(true);
  await vi.waitFor(() => expect(h.ptys[0]!.kill).toHaveBeenCalledOnce());
  for (const pty of h.ptys) pty.acknowledgeExit();
  await vi.waitFor(() => expect(h.app.exit).toHaveBeenCalledOnce());
  expect(h.app.exit).toHaveBeenCalledExactlyOnceWith(1);
});

it("a reentrant exception during the first PTY close escalates the same owner", async () => {
  const h = harness();
  await vi.waitFor(() => expect(h.host.dispose).toHaveBeenCalledOnce());
  h.ptys[0]!.kill.mockImplementation(() => {
    h.processPort.emit("uncaughtException", new Error("reentrant failure"));
  });
  h.retire(true);
  await vi.waitFor(() => expect(h.ptys[2]!.kill).toHaveBeenCalledOnce());
  expect(h.app.exit).not.toHaveBeenCalled();
  for (const pty of h.ptys) pty.acknowledgeExit();
  await vi.waitFor(() => expect(h.app.exit).toHaveBeenCalledOnce());
  expect(h.app.exit).toHaveBeenCalledExactlyOnceWith(1);
});

it("a successful join still waits for every PTY acknowledgment", async () => {
  const h = harness();
  await beginPtyDrain(h);
  h.ptys[0]!.acknowledgeExit();
  h.ptys[1]!.acknowledgeExit();
  await Promise.resolve();
  expect(h.app.exit).not.toHaveBeenCalled();
  h.ptys[2]!.acknowledgeExit();
  await vi.waitFor(() => expect(h.app.exit).toHaveBeenCalledOnce());
  expect(h.app.exit).toHaveBeenCalledExactlyOnceWith(0);
});

it("rejects DOM focus on A while the Snippets child retains native focus", async () => {
  const h = harness({ observeFocus: true });
  await vi.waitFor(() => expect(h.host.dispose).toHaveBeenCalledOnce());
  expect(
    h.renderer.document
      .querySelector()
      .contains(h.renderer.document.activeElement),
  ).toBe(true);
  expect(h.hosted.webContents.isFocused()).toBe(true);
  expect(h.focusCore).not.toHaveBeenCalled();
  expect(h.windowFocus).toHaveBeenCalledOnce(); // The original initial show only.
  h.retire(true);
  await vi.waitFor(() => expect(h.ptys[0]!.kill).toHaveBeenCalledOnce());
  h.ptys[0]!.acknowledgeExit();
  h.ptys[1]!.acknowledgeExit();
  await vi.waitFor(() => expect(h.app.exit).toHaveBeenCalledOnce());
  expect(h.app.exit).toHaveBeenCalledExactlyOnceWith(1);
  expect(h.focusChecks).toEqual([false]);
  expect(
    h.writeSync.mock.calls.some(([, line]) =>
      String(line).startsWith("__OMXTERM_TAB_REMOVAL_RESULT__"),
    ),
  ).toBe(false);
});

it("rejects focus lost while the A DOM observation is in flight", async () => {
  const h = harness({ observeFocus: true, loseFocusDuringDom: true });
  h.setCoreFocused(true);
  await vi.waitFor(() => expect(h.host.dispose).toHaveBeenCalledOnce());
  expect(h.focusChecks).toEqual([false]);
  expect(h.hosted.webContents.isFocused()).toBe(true);
  h.retire(true);
  await vi.waitFor(() => expect(h.ptys[0]!.kill).toHaveBeenCalledOnce());
  h.ptys[0]!.acknowledgeExit();
  h.ptys[1]!.acknowledgeExit();
  await vi.waitFor(() => expect(h.app.exit).toHaveBeenCalledOnce());
  expect(h.app.exit).toHaveBeenCalledExactlyOnceWith(1);
  expect(h.focusCore).not.toHaveBeenCalled();
});

it("waits for the core focus acknowledgment without requesting focus", async () => {
  const h = harness({ observeFocus: true, delayFocus: true });
  await vi.waitFor(() => expect(h.focusChecks).toEqual([false]));
  expect(h.host.dispose).not.toHaveBeenCalled();
  expect(h.focusCore).not.toHaveBeenCalled();
  expect(h.windowFocus).toHaveBeenCalledOnce();
  // This changes only the modeled observation, not a fixture focus command.
  h.setCoreFocused(true);
  h.releaseFocus();
  await vi.waitFor(() => expect(h.host.dispose).toHaveBeenCalledOnce());
  expect(h.focusChecks).toEqual([false, true]);
  expect(h.hosted.webContents.isFocused()).toBe(false);
  expect(h.focusCore).not.toHaveBeenCalled();
  expect(h.windowFocus).toHaveBeenCalledOnce();
  h.retire(true);
  await vi.waitFor(() => expect(h.ptys[0]!.kill).toHaveBeenCalledOnce());
  h.ptys[0]!.acknowledgeExit();
  h.ptys[1]!.acknowledgeExit();
  await vi.waitFor(() => expect(h.app.exit).toHaveBeenCalledOnce());
  expect(h.app.exit).toHaveBeenCalledExactlyOnceWith(0);
});

it.each([
  ["SIGINT", 130],
  ["SIGTERM", 143],
] as const)(
  "a late %s after Snippets retirement remains exit %s after PTY acknowledgment",
  async (signal, code) => {
    const h = harness();
    await beginPtyDrain(h);
    h.processPort.emit(signal);
    expect(h.app.exit).not.toHaveBeenCalled();
    for (const pty of h.ptys) pty.acknowledgeExit();
    await vi.waitFor(() => expect(h.app.exit).toHaveBeenCalledOnce());
    expect(h.app.exit).toHaveBeenCalledExactlyOnceWith(code);
  },
);
