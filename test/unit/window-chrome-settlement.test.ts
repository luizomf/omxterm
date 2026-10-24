import { EventEmitter } from "node:events";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createFixtureSessionInput } from "../fixtures/fixture-session-input";
import { explicitFixtureReadyMarker } from "../fixtures/restty-host-platform";

let entry: string;
beforeAll(async () => {
  const result = await build({
    entryPoints: ["test/fixtures/window-chrome-main.ts"],
    bundle: false,
    format: "cjs",
    platform: "node",
    write: false,
  });
  entry = result.outputFiles[0]!.text;
});
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function harness(
  count = 3,
  options: {
    failSpawnAt?: number;
    closeThrows?: boolean;
    exerciseSucceeds?: boolean;
    platform?: NodeJS.Platform;
    appActive?: boolean;
    failFast?: boolean;
    createPeer?: boolean;
  } = {},
) {
  const require = createRequire(import.meta.url);
  const original = new Error("controlled native route failure");
  const events: string[] = [];
  const app = Object.assign(new EventEmitter(), {
    setPath() {},
    whenReady: async () => {},
    isActive: vi.fn(() => {
      events.push("app-is-active");
      return options.appActive ?? false;
    }),
    focus: vi.fn(() => events.push("app-focus")),
    exit: vi.fn(),
    quit: vi.fn(),
  });
  const processPort = Object.assign(new EventEmitter(), {
    platform: options.platform ?? "win32",
    env: {},
    argv: options.failFast ? ["--fixture-fail-fast"] : [],
    stdout: { write: vi.fn() },
    stderr: { write: vi.fn() },
    exit: vi.fn(),
  });
  const sessions: Array<{ close: ReturnType<typeof vi.fn>; exit: () => void }> =
    [];
  let createSession: ((callbacks: object) => unknown) | undefined;
  const callbacks = { onExit: vi.fn(), onOutput: vi.fn() };
  const lifetime = {
    onWindowClosed() {},
    onSessionStartError() {},
    onSessionExit() {},
  };
  const application = {
    newWindow: vi.fn(async () => {}),
    forceCloseWindow: vi.fn(),
  };
  const dispose = vi.fn();
  const writeSync = vi.fn();
  const windows: Array<{ focus: ReturnType<typeof vi.fn> }> = [];
  const exerciseWindowChrome = vi.fn(async () => {
    events.push("exercise");
    if (options.createPeer) {
      app.isActive.mockReturnValue(false);
      await application.newWindow();
    }
    if (!options.exerciseSucceeds) throw original;
    return { controlled: true };
  });
  const ports: Record<string, unknown> = {
    electron: {
      app,
      BrowserWindow: class extends EventEmitter {
        constructor() {
          super();
          windows.push(this);
        }
        webContents = {};
        loadFile = vi.fn(async () => {
          events.push("load");
        });
        showInactive = vi.fn(() => events.push("show-inactive"));
        focus = vi.fn(() => events.push("window-focus"));
      },
      ipcMain: {},
    },
    "node:fs": { mkdirSync() {}, writeSync },
    "../../src/main/terminal-window": {
      terminalWindowOptions: () => ({ webPreferences: {} }),
    },
    "../../src/main/window-background-effects": {
      createWindowBackgroundEffectsOwner: () => ({ register: () => () => 0 }),
    },
    "../../src/main/window-chrome": {
      registerWindowChrome: () => ({ setTitle() {} }),
    },
    "../../src/main/terminal-window-host": {
      guardTerminalWindowClose() {},
      registerTerminalWindowHost() {},
    },
    "../../src/main/terminal-window-title": {
      createTerminalWindowTitleController: () => ({ dispose() {} }),
    },
    "../../src/main/terminal-ipc-controller": {
      registerTerminalIpcRouter: () => ({
        dispose,
        registerController(options: { createSession: typeof createSession }) {
          createSession = options.createSession;
          for (let index = 0; index < count; index++) createSession!(callbacks);
          return {};
        },
      }),
    },
    "../../src/main/terminal-application": {
      startTerminalApplication(options: {
        createWindow(lifecycle: object): { load(): Promise<void> };
      }) {
        application.newWindow.mockImplementation(async () => {
          const window = options.createWindow(lifetime);
          await window.load();
        });
        return application;
      },
    },
    "../../src/main/active-user-configuration": {
      terminalRendererConfiguration: () => ({}),
    },
    "../../src/main/user-configuration": { DEFAULT_USER_CONFIGURATION: {} },
    "../../src/main/local-terminal-session": {
      createLocalTerminalSession(
        _spawn: unknown,
        sessionOptions: { onExit(exit: object, kind: string): void },
      ) {
        if (sessions.length === options.failSpawnAt) throw original;
        const session = {
          close: vi.fn(() => {
            if (options.closeThrows) throw new Error("close failed");
          }),
          exit: () =>
            sessionOptions.onExit({ exitCode: 0 }, "explicit-command"),
        };
        sessions.push(session);
        return session;
      },
    },
    "./fixture-session-input": { createFixtureSessionInput },
    "./restty-host-platform": {
      explicitFixtureReadyMarker,
      nativeFixturePlatform: {},
      explicitFixtureLaunchRequest: () => ({}),
    },
    "../../src/shared/terminal-ipc": { terminalIpc: {} },
    "./window-chrome-exercise": { exerciseWindowChrome },
    "./auxiliary-panel-exercise": { exerciseAuxiliaryPanel: vi.fn() },
    "./window-chrome-construction": { assertNativeChromeConstruction() {} },
    "./window-policy": {
      chromeNativeExpectation: () => "native-maximize-observed",
    },
    "./native-fixture-pty": {},
    "./window-chrome-native-drag": {},
    "./application-menu-exercise": {},
    "./about-keyboard-exercise": { exerciseAboutKeyboard: async () => {} },
    "./about-dialog-exercise": {
      createAboutExercise: () => ({
        show() {},
        exercise: async () => {},
        dispose() {},
      }),
    },
    "./settings-dialog-exercise": { runSettingsExercise: async () => ({}) },
    "./window-chrome-configuration": {
      fixtureConfigurationApplier: () => () => {},
    },
    "../../src/main/native-application-menu": {},
  };
  runInNewContext(entry, {
    __dirname: "/owned-chrome-profile",
    module: { exports: {} },
    exports: {},
    console,
    Error,
    setTimeout,
    clearTimeout,
    setImmediate,
    process: processPort,
    require(id: string): unknown {
      if (id in ports) return ports[id];
      if (id.startsWith("node:")) return require(id) as unknown;
      throw new Error(`Unexpected entry dependency: ${id}`);
    },
  });
  return {
    app,
    processPort,
    events,
    windows,
    exerciseWindowChrome,
    sessions,
    original,
    callbacks,
    application,
    dispose,
    writeSync,
    createLate: () => createSession!(callbacks),
  };
}

it.each([
  ["darwin", false, true],
  ["darwin", true, false],
  ["linux", false, false],
  ["win32", false, false],
] as const)(
  "%s (app active: %s) activates only the initial window as needed before exercising",
  async (platform, appActive, shouldActivate) => {
    const h = harness(0, {
      platform,
      appActive,
      exerciseSucceeds: true,
      createPeer: true,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.events).toEqual([
      "load",
      "show-inactive",
      ...(platform === "darwin" ? ["app-is-active"] : []),
      ...(shouldActivate ? ["app-focus", "window-focus"] : []),
      "exercise",
      "load",
      "show-inactive",
    ]);
    expect(h.app.isActive).toHaveBeenCalledTimes(platform === "darwin" ? 1 : 0);
    if (shouldActivate) {
      expect(h.app.focus).toHaveBeenCalledExactlyOnceWith({ steal: true });
    } else {
      expect(h.app.focus).not.toHaveBeenCalled();
    }
    expect(h.windows).toHaveLength(2);
    expect(h.windows[0]!.focus).toHaveBeenCalledTimes(shouldActivate ? 1 : 0);
    expect(h.windows[1]!.focus).not.toHaveBeenCalled();
    expect(h.application.newWindow).toHaveBeenCalledTimes(2);
    expect(h.exerciseWindowChrome).toHaveBeenCalledOnce();
    expect(h.app.quit).toHaveBeenCalledOnce();
    expect(h.app.exit).not.toHaveBeenCalled();
    expect(h.processPort.stderr.write).not.toHaveBeenCalled();
  },
);

it("the fail-fast entry creates no window and performs no activation or exercise", async () => {
  const h = harness(0, { platform: "darwin", failFast: true });
  await expect(vi.advanceTimersByTimeAsync(0)).rejects.toThrow(
    "Controlled fixture failure",
  );
  expect(h.application.newWindow).not.toHaveBeenCalled();
  expect(h.windows).toHaveLength(0);
  expect(h.app.isActive).not.toHaveBeenCalled();
  expect(h.app.focus).not.toHaveBeenCalled();
  expect(h.exerciseWindowChrome).not.toHaveBeenCalled();
});

it("the actual Chrome failure entry joins every existing PTY acknowledgment before exit1", async () => {
  const h = harness();
  await vi.advanceTimersByTimeAsync(0);
  expect(h.sessions).toHaveLength(3);
  expect(
    h.sessions.every((session) => session.close.mock.calls.length === 1),
  ).toBe(true);
  expect(h.app.exit).not.toHaveBeenCalled();
  h.sessions[2]!.exit();
  h.sessions[0]!.exit();
  await vi.advanceTimersByTimeAsync(2_000);
  expect(h.app.exit).not.toHaveBeenCalled();
  expect(h.processPort.exit).not.toHaveBeenCalled();
  h.sessions[1]!.exit();
  await vi.advanceTimersByTimeAsync(0);
  expect(h.callbacks.onExit).toHaveBeenCalledTimes(3);
  expect(h.app.exit).toHaveBeenCalledExactlyOnceWith(1);
  expect(h.app.quit).not.toHaveBeenCalled();
  expect(h.processPort.stderr.write).toHaveBeenCalledExactlyOnceWith(
    `${h.original.stack}\n`,
  );
});

it("reentrant errors cannot bypass held exits or replace the first error", async () => {
  const h = harness();
  await vi.advanceTimersByTimeAsync(0);
  h.processPort.emit("uncaughtException", new Error("secondary close error"));
  await vi.advanceTimersByTimeAsync(2_000);
  expect(h.app.exit).not.toHaveBeenCalled();
  expect(h.processPort.exit).not.toHaveBeenCalled();
  for (const session of h.sessions) session.exit();
  await vi.advanceTimersByTimeAsync(0);
  expect(h.app.exit).toHaveBeenCalledExactlyOnceWith(1);
  expect(h.processPort.stderr.write).toHaveBeenCalledExactlyOnceWith(
    `${h.original.stack}\n`,
  );
});

it("an ended Chrome failure entry refuses a new session without losing the existing join", async () => {
  const h = harness(1);
  await vi.advanceTimersByTimeAsync(0);
  expect(() => h.createLate()).toThrow("Chrome fixture is completing");
  expect(h.sessions).toHaveLength(1);
  h.sessions[0]!.exit();
  await vi.advanceTimersByTimeAsync(0);
  expect(h.app.exit).toHaveBeenCalledExactlyOnceWith(1);
});

it("a failed creation releases only its unowned slot, not another live PTY", async () => {
  const h = harness(2, { failSpawnAt: 1 });
  await vi.advanceTimersByTimeAsync(0);
  expect(h.sessions).toHaveLength(1);
  expect(h.app.exit).not.toHaveBeenCalled();
  h.sessions[0]!.exit();
  await vi.advanceTimersByTimeAsync(0);
  expect(h.app.exit).toHaveBeenCalledExactlyOnceWith(1);
  expect(h.processPort.stderr.write).toHaveBeenCalledExactlyOnceWith(
    `${h.original.stack}\n`,
  );
});

it("close errors preserve the original failure but do not substitute for exit acknowledgments", async () => {
  const h = harness(2, { closeThrows: true });
  await vi.advanceTimersByTimeAsync(2_000);
  expect(
    h.sessions.every((session) => session.close.mock.calls.length === 1),
  ).toBe(true);
  expect(h.app.exit).not.toHaveBeenCalled();
  expect(h.processPort.exit).not.toHaveBeenCalled();
  for (const session of h.sessions) session.exit();
  await vi.advanceTimersByTimeAsync(0);
  expect(h.app.exit).toHaveBeenCalledExactlyOnceWith(1);
  expect(h.processPort.stderr.write).toHaveBeenCalledExactlyOnceWith(
    `${h.original.stack}\n`,
  );
});

it.each(["uncaughtException", "unhandledRejection"])(
  "%s during the already-pending success join forbids success publication and quit",
  async (event) => {
    const h = harness(3, { exerciseSucceeds: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.application.forceCloseWindow).toHaveBeenCalledOnce();
    expect(h.dispose).toHaveBeenCalledOnce();
    expect(h.writeSync).not.toHaveBeenCalled();
    expect(h.app.quit).not.toHaveBeenCalled();
    expect(h.processPort.stderr.write).not.toHaveBeenCalled();
    h.processPort.emit(event, h.original);
    expect(
      h.sessions.every((session) => session.close.mock.calls.length === 1),
    ).toBe(true);
    expect(h.app.exit).not.toHaveBeenCalled();
    for (const session of h.sessions) session.exit();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.callbacks.onExit).toHaveBeenCalledTimes(3);
    expect(h.app.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(h.processPort.stderr.write).toHaveBeenCalledExactlyOnceWith(
      `${h.original.stack}\n`,
    );
    expect(h.writeSync).not.toHaveBeenCalled();
    expect(h.app.quit).not.toHaveBeenCalled();
  },
);

it("successful completion still publishes its result and quits after all acknowledgments", async () => {
  const h = harness(3, { exerciseSucceeds: true });
  await vi.advanceTimersByTimeAsync(0);
  expect(h.dispose).toHaveBeenCalledOnce();
  h.sessions[0]!.exit();
  h.sessions[1]!.exit();
  await vi.advanceTimersByTimeAsync(0);
  expect(h.writeSync).not.toHaveBeenCalled();
  expect(h.app.quit).not.toHaveBeenCalled();
  h.sessions[2]!.exit();
  await vi.advanceTimersByTimeAsync(0);
  expect(h.writeSync).toHaveBeenCalledExactlyOnceWith(
    1,
    '__OMXTERM_WINDOW_CHROME_RESULT__{"controlled":true}\n',
  );
  expect(h.app.quit).toHaveBeenCalledOnce();
  expect(h.app.exit).not.toHaveBeenCalled();
  expect(h.processPort.stderr.write).not.toHaveBeenCalled();
});

it("a zero-session failure exits1 without needing a fabricated PTY event", async () => {
  const h = harness(0);
  await vi.advanceTimersByTimeAsync(0);
  expect(h.app.exit).toHaveBeenCalledExactlyOnceWith(1);
  expect(h.processPort.exit).not.toHaveBeenCalled();
  expect(h.processPort.stderr.write).toHaveBeenCalledExactlyOnceWith(
    `${h.original.stack}\n`,
  );
});
