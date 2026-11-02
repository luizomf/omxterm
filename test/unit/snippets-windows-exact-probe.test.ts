import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { createContext, runInContext, type Context } from "node:vm";
import { createInputHandler } from "restty/internal";
import { expect, it } from "vitest";

const localRequire = createRequire(import.meta.url);
function load(
  file: string,
  modules: Record<string, unknown>,
  processValue: object,
  context = createContext({ process: processValue, Buffer, setTimeout }),
) {
  const module = { exports: {} as Record<string, unknown> };
  const factory = runInContext(
    `(function(module, require) {\n${readFileSync(file, "utf8")}\n})`,
    context,
  ) as (module: object, require: (name: string) => unknown) => void;
  factory(module, (name) =>
    Object.hasOwn(modules, name)
      ? modules[name]
      : (localRequire(name) as unknown),
  );
  return module.exports;
}

it("arms before a controlled first window and observes the real readiness seam through joined probe Quit", async () => {
  const evidence = await mkdtemp(path.join(os.tmpdir(), "early-arm-probe-"));
  const app = Object.assign(new EventEmitter(), {
    isPackaged: true,
    getVersion: () => "1",
    getAppPath: () => "/stage/resources/app.asar",
    quit: () => {},
  });
  const ipcMain = new EventEmitter();
  const dialog = { showOpenDialog: () => {}, showMessageBox: () => {} };
  const electron = {
    app,
    ipcMain,
    dialog,
    BrowserWindow: { getAllWindows: () => [] },
    webContents: {},
  };
  class Terminal extends EventEmitter {
    pid = 42;
    constructor() {
      super();
      this._forwardEvents();
    }
    _forwardEvents() {}
    write(_data: string) {}
    onData(listener: (text: string) => void) {
      this.on("data", listener);
      return { dispose: () => this.off("data", listener) };
    }
    onExit(listener: () => void) {
      this.on("exit", listener);
      return { dispose: () => this.off("exit", listener) };
    }
  }
  let alive = true;
  const fakeProcess = {
    platform: "win32",
    arch: "arm64",
    pid: 41,
    execPath: "/stage/OMXTerm.exe",
    versions: { electron: "43.8.1", node: "24" },
  };
  const moduleApi = {
    createRequire: () => () => ({ Terminal }),
    syncBuiltinESMExports: () => {},
  };
  const context: Context = createContext({
    process: fakeProcess,
    Buffer,
    setTimeout,
  });
  const observation = load(
    "test/fixtures/snippets-observer.cjs",
    {
      electron,
      "node:module": moduleApi,
      "node:child_process": {
        fork: () => {
          throw new Error("unexpected backend");
        },
      },
      "./snippets-windows-cpr.cjs": localRequire(
        "../fixtures/snippets-windows-cpr.cjs",
      ) as unknown,
    },
    fakeProcess,
    context,
  );
  const readiness = localRequire(
    "../fixtures/snippets-windows-readiness.cjs",
  ) as unknown;
  const observer = load(
    "test/fixtures/snippets-windows-exact-observer.cjs",
    {
      electron,
      "node:module": moduleApi,
      "./snippets-observer.cjs": observation,
      "./snippets-windows-readiness.cjs": readiness,
      "./snippets-scenario.cjs": {
        runScenario: () => {
          throw new Error("probe ran scenario");
        },
      },
      "./snippets-windows-parser.cjs": { createInputHandler },
      "./fixture-processes.cjs": {
        fixtureProcesses: () =>
          alive ? [{ pid: 42, parent: 41, identity: "123" }] : [],
      },
    },
    fakeProcess,
    context,
  ) as {
    arm(options: object): { armed: boolean; windows: number; ptys: number };
    probe(): Promise<{
      ready: boolean;
      pty: { pid: number };
      readiness: { checks: Record<string, boolean> };
    }>;
    probeQuit(): void;
  };
  try {
    expect(
      observer.arm({
        version: "1",
        asar: "/stage/resources/app.asar",
        executable: "/stage/OMXTerm.exe",
        electronVersion: "43.8.1",
        archive: "/archive",
        archiveSha256: "digest",
        evidence,
        probe: true,
      }),
    ).toMatchObject({ armed: true, windows: 0, ptys: 0 });
    const core = Object.assign(new EventEmitter(), {
      id: 5,
      mainFrame: {},
      send: (_channel: string, _payload: object) => {},
      isFocused: () => true,
      executeJavaScript: async () => true,
    });
    const window = Object.assign(new EventEmitter(), {
      webContents: core,
      focus: () => {},
    });
    app.emit("browser-window-created", {}, window);
    const terminal = new Terminal();
    const output =
      "\u001b[?1004l\u001b[?1004h\u001b[?2004lSNIPPETS_SHELL_READY\r\n";
    terminal.emit("data", output);
    core.send("terminal:output", {
      sessionId: "s1",
      data: output,
      end: Buffer.byteLength(output),
    });
    ipcMain.emit(
      "terminal:output-ack",
      { sender: core, senderFrame: core.mainFrame },
      { sessionId: "s1", end: Buffer.byteLength(output) },
    );
    window.emit("ready-to-show");
    const result = await observer.probe();
    expect(result).toMatchObject({
      ready: true,
      pty: { pid: 42 },
      readiness: {
        checks: {
          oneSession: true,
          acknowledgedAll: true,
          focusReporting: true,
          bracketedPaste: false,
        },
      },
    });
    app.quit = () => {
      terminal.emit("exit");
      alive = false;
      app.emit("will-quit");
    };
    observer.probeQuit();
    const quit = JSON.parse(
      await readFile(path.join(evidence, "quit.json"), "utf8"),
    ) as unknown;
    expect(quit).toMatchObject({
      joined: true,
      ptys: [{ pid: 42, exited: true }],
      children: [],
      identities: [{ pid: 42, alive: false }],
    });
  } finally {
    await rm(evidence, { recursive: true, force: true });
  }
});

it.each([true, false])(
  "only reports normal campaign Quit with backend close (closed=%s)",
  async (backendClosed) => {
    const evidence = await mkdtemp(path.join(os.tmpdir(), "early-arm-quit-"));
    const app = Object.assign(new EventEmitter(), {
      isPackaged: true,
      getVersion: () => "1",
      getAppPath: () => "/stage/resources/app.asar",
      quit: () => {},
    });
    const ipcMain = new EventEmitter();
    const electron = {
      app,
      ipcMain,
      dialog: { showOpenDialog: () => {}, showMessageBox: () => {} },
      BrowserWindow: { getAllWindows: () => [] },
      webContents: {},
    };
    class Terminal extends EventEmitter {
      pid = 42;
      constructor() {
        super();
        this._forwardEvents();
      }
      _forwardEvents() {}
      write(_data: string) {}
      onData(listener: (text: string) => void) {
        this.on("data", listener);
        return { dispose: () => this.off("data", listener) };
      }
      onExit(listener: () => void) {
        this.on("exit", listener);
        return { dispose: () => this.off("exit", listener) };
      }
    }
    const child = Object.assign(new EventEmitter(), { pid: 77 });
    const childProcess = { fork: (..._args: unknown[]) => child };
    const fakeProcess = {
      platform: "win32",
      arch: "arm64",
      pid: 41,
      execPath: "/stage/OMXTerm.exe",
      versions: { electron: "43.8.1", node: "24" },
      exitCode: 0,
    };
    const moduleApi = {
      createRequire: () => () => ({ Terminal }),
      syncBuiltinESMExports: () => {},
    };
    const context: Context = createContext({
      process: fakeProcess,
      Buffer,
      setTimeout,
    });
    const observation = load(
      "test/fixtures/snippets-observer.cjs",
      {
        electron,
        "node:module": moduleApi,
        "node:child_process": childProcess,
        "./snippets-windows-cpr.cjs": localRequire(
          "../fixtures/snippets-windows-cpr.cjs",
        ) as unknown,
      },
      fakeProcess,
      context,
    );
    const pty = { pid: 42, parent: 41, identity: "123" };
    const backend = { pid: 77, parent: 41, identity: "456" };
    const observer = load(
      "test/fixtures/snippets-windows-exact-observer.cjs",
      {
        electron,
        "node:module": moduleApi,
        "./snippets-observer.cjs": observation,
        "./snippets-windows-readiness.cjs": localRequire(
          "../fixtures/snippets-windows-readiness.cjs",
        ) as unknown,
        "./snippets-windows-parser.cjs": { createInputHandler },
        "./fixture-processes.cjs": { fixtureProcesses: () => [] },
        "./snippets-scenario.cjs": {
          runScenario: async () => {
            childProcess.fork(
              path.join(
                "/stage/resources/app.asar",
                "dist/extension-runtime/bootstrap.mjs",
              ),
              [],
              { execPath: "/stage/OMXTerm.exe" },
            );
            child.emit("exit", 0, null);
            if (backendClosed) child.emit("close");
            return {
              checks: ["controlled"],
              identities: [pty, backend],
              retirementIdentity: pty,
            };
          },
        },
      },
      fakeProcess,
      context,
    ) as {
      arm(options: object): unknown;
      run(): Promise<unknown>;
      quit(): void;
    };
    try {
      observer.arm({
        version: "1",
        asar: "/stage/resources/app.asar",
        executable: "/stage/OMXTerm.exe",
        electronVersion: "43.8.1",
        archive: "/archive",
        archiveSha256: "digest",
        evidence,
        probe: false,
      });
      const core = Object.assign(new EventEmitter(), {
        mainFrame: {},
        send: (_channel: string, _payload: object) => {},
      });
      const window = Object.assign(new EventEmitter(), { webContents: core });
      app.emit("browser-window-created", {}, window);
      const terminal = new Terminal();
      window.emit("ready-to-show");
      expect(await observer.run()).toMatchObject({ checks: ["controlled"] });
      app.quit = () => {
        terminal.emit("exit");
        app.emit("will-quit");
      };
      observer.quit();
      const quit = JSON.parse(
        await readFile(path.join(evidence, "quit.json"), "utf8"),
      ) as { joined: boolean; error: string | null };
      expect(quit.joined, JSON.stringify(quit)).toBe(backendClosed);
      if (!backendClosed) expect(quit.error).toContain("backend close joined");
    } finally {
      await rm(evidence, { recursive: true, force: true });
    }
  },
);
