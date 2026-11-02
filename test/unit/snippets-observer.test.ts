import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { createInputHandler } from "restty/internal";
import { describe, expect, it, vi } from "vitest";
import { createElectronTerminalAdapter } from "../../src/renderer/electron-terminal-adapter";
import type { TerminalBridge } from "../../src/shared/terminal-bridge";

const require = createRequire(import.meta.url);
const { startWindowsProbeReadiness } =
  require("../fixtures/snippets-windows-readiness.cjs") as {
    startWindowsProbeReadiness(options: object): {
      record(event: object): void;
      ready(core: object, session: object): boolean;
      snapshot(
        core: object,
        session: object,
      ): {
        events: Array<{ kind: string; data?: string }>;
        checks: Record<string, boolean | null>;
      };
      dispose(): void;
    };
  };

const source = readFileSync("test/fixtures/snippets-observer.cjs", "utf8");
function harness(initialPid = 123, nativePath: typeof path = path) {
  class Terminal extends EventEmitter {
    pid = initialPid;
    writes: string[] = [];
    forwarded = 0;
    constructor() {
      super();
      this._forwardEvents();
    }
    _forwardEvents() {
      this.forwarded++;
    }
    write(data: string) {
      this.writes.push(data);
      return "forwarded";
    }
    onData(listener: (data: string) => void) {
      this.on("data", listener);
      return { dispose: () => this.off("data", listener) };
    }
    onExit(listener: () => void) {
      this.on("exit", listener);
      return { dispose: () => this.off("exit", listener) };
    }
  }
  const originalForward = Terminal.prototype._forwardEvents;
  const originalWrite = Terminal.prototype.write;
  const child = Object.assign(new EventEmitter(), { pid: 456 });
  const originalFork = vi.fn(() => child);
  const childProcess = { fork: originalFork };
  const dialog = {
    showOpenDialog: vi.fn(),
    showMessageBox: vi.fn(),
  };
  const sync = vi.fn();
  type Observation = {
    ptys: {
      pid: number;
      writes: string[];
      output: string;
      outputTruncated: boolean;
      outputLimitCodeUnits: number;
      cprTrace?: { snapshot(): object };
      cprTraceError?: string;
      exited: boolean;
    }[];
    children: {
      pid: number;
      closed: boolean;
      exit: { code: number; signal: null } | null;
    }[];
    approvalCount(): number;
    readinessTraceFailures(): number;
    restore(): void;
  };
  const exports = {} as {
    observe(options: object, load: (name: string) => unknown): Observation;
  };
  const module = { exports };
  runInNewContext(source, {
    module,
    require: (name: string) => {
      const modules: Record<string, unknown> = {
        "node:assert/strict": assert,
        electron: { dialog },
        "node:child_process": childProcess,
        "node:module": { syncBuiltinESMExports: sync },
        "node:path": nativePath,
        "./snippets-windows-cpr.cjs":
          require("../fixtures/snippets-windows-cpr.cjs") as unknown,
      };
      assert.ok(Object.hasOwn(modules, name));
      return modules[name];
    },
  });
  const observe = (options: object = {}) =>
    module.exports.observe(
      {
        archive: "/fixture/snippets.omxext",
        archiveSha256: "digest",
        asar: "/fixture/app.asar",
        executable: "/fixture/omxterm",
        ...options,
      },
      (name) => {
        expect(name).toBe("node-pty/lib/terminal.js");
        return { Terminal };
      },
    );
  return {
    Terminal,
    originalForward,
    originalWrite,
    originalFork,
    childProcess,
    child,
    dialog,
    sync,
    observe,
  };
}

it("refuses local selection and binds both public approvals to the exact Official identity and generation", async () => {
  const h = harness();
  const digest =
    "6c5723724d0dce26c589909405216c608dd071d7e9b04d63f733e012449c0ab7";
  const observation = h.observe({ publicCatalog: true, archiveSha256: digest });
  const prompt = (generation: number) => ({
    title: "Trust extension code?",
    message: "Install Snippets 0.1.0?",
    detail: `This is trusted local code, not a sandbox. It can read/change files, run programs and use the network with your user permissions. Third-party authors are responsible for their extensions. Only install packages you trust. Installation is dormant until you invoke its action.\n\nPackage: omxterm.snippets\nSHA-256: ${digest}\nCurrent generation: ${generation}\n\nOfficial means project-maintained, not sandboxed or harmless. Extensions run trusted code with access to files, programs and networks. HTTPS and the catalog hash bind the selected bytes; they are not an independent publisher signature. Third-party authors remain responsible for their extensions.`,
    buttons: ["Cancel", "Trust and install"],
    defaultId: 0,
    cancelId: 0,
    type: "warning",
  });
  try {
    await expect(h.dialog.showOpenDialog()).rejects.toThrow();
    await expect(h.dialog.showMessageBox(null, prompt(1))).rejects.toThrow();
    await expect(
      h.dialog.showMessageBox(null, {
        ...prompt(0),
        message: "Install Snippets 0.1.1?",
      }),
    ).rejects.toThrow();
    await expect(
      h.dialog.showMessageBox(null, {
        ...prompt(0),
        detail: prompt(0).detail.replace(
          "omxterm.snippets",
          "omxterm.snippets.fake",
        ),
      }),
    ).rejects.toThrow();
    await expect(
      h.dialog.showMessageBox(null, {
        ...prompt(0),
        detail: prompt(0).detail.replace("Official means", "Unofficial means"),
      }),
    ).rejects.toThrow();
    expect(observation.approvalCount()).toBe(0);
    await expect(
      h.dialog.showMessageBox(null, prompt(0)),
    ).resolves.toMatchObject({ response: 1 });
    await expect(
      h.dialog.showMessageBox(null, prompt(1)),
    ).resolves.toMatchObject({ response: 1 });
    await expect(h.dialog.showMessageBox(null, prompt(1))).rejects.toThrow();
    expect(observation.approvalCount()).toBe(2);
  } finally {
    observation.restore();
  }
});

describe("Snippets fixture observation", () => {
  it("observes post-attachment instances without replacing a captured spawn binding", () => {
    const h = harness();
    const spawn = () => new h.Terminal();
    const baseline = spawn();
    const observation = h.observe();
    const session = spawn();
    expect(session.forwarded).toBe(1);
    expect(observation.ptys).toHaveLength(1);
    expect(baseline.write("baseline")).toBe("forwarded");
    expect(session.write(" exact\r")).toBe("forwarded");
    session.emit("data", "a".repeat(70000));
    expect(session.writes).toEqual([" exact\r"]);
    expect(observation.ptys[0]).toMatchObject({
      writes: [" exact\r"],
      output: "a".repeat(65536),
      outputTruncated: true,
      exited: false,
    });
    session.emit("exit");
    expect(observation.ptys[0]?.exited).toBe(true);
    observation.restore();
    expect(h.Terminal.prototype._forwardEvents).toBe(h.originalForward);
    expect(session.write).toBe(h.originalWrite);
    expect(session.listenerCount("data")).toBe(0);
    expect(session.listenerCount("exit")).toBe(0);
    expect(h.childProcess.fork).toBe(h.originalFork);
  });
});

it("observes split query and CPR order without changing the forwarded writes", () => {
  const h = harness();
  const observed = h.observe({ windowsCpr: true });
  const terminal = new h.Terminal();
  try {
    terminal.emit("data", "prefix\u001b[6");
    terminal.emit("data", "n");
    terminal.write("\u001b[7;1R");
    expect(terminal.writes).toEqual(["\u001b[7;1R"]);
    expect(observed.ptys[0]!.cprTrace?.snapshot()).toMatchObject({
      outputLength: 10,
      writeEnd: 1,
      incomplete: false,
      requests: [{ offset: 6 }],
      replies: [{ index: 0, requestIndex: 0 }],
    });
  } finally {
    observed.restore();
  }
});

it("retains observation errors without preventing PTY output or writes", () => {
  const h = harness();
  const observed = h.observe({ windowsCpr: true });
  const terminal = new h.Terminal();
  try {
    const trace = observed.ptys[0]!.cprTrace!;
    Object.assign(trace, {
      output() {
        throw Error("output observation failed");
      },
      write() {
        throw Error("write observation failed");
      },
    });
    terminal.emit("data", "raw output");
    expect(terminal.write("raw input")).toBe("forwarded");
    expect(terminal.writes).toEqual(["raw input"]);
    expect(observed.ptys[0]!.output).toBe("raw output");
    expect(observed.ptys[0]!.cprTraceError).toContain(
      "output observation failed",
    );
  } finally {
    observed.restore();
  }
});

it("retains real probe receipt output with the selected writes and an explicit bound", async () => {
  const { snapshotWindowsPtyOutput, retainWindowsPtyEvidence } =
    require("../fixtures/snippets-scenario.cjs") as {
      snapshotWindowsPtyOutput(session: object): object;
      retainWindowsPtyEvidence(
        evidence: string,
        session: object,
        checks: object[],
        output: object,
      ): Promise<void>;
    };
  const h = harness();
  const observed = h.observe();
  const terminal = new h.Terminal();
  const env = { ...process.env };
  delete env.OMXTERM_SNIPPETS_PACKAGED_INSERT_DIAGNOSTIC;
  delete env.OMXTERM_SNIPPETS_PACKAGED_CHILD_INPUT_CAPTURE;
  const output = execFileSync(
    process.execPath,
    [path.resolve("test/fixtures/snippets-windows-probe.cjs")],
    { input: "  SNIPPETS_INSERT  ", encoding: "utf8", env, timeout: 5000 },
  );
  const root = await mkdtemp(path.join(os.tmpdir(), "snippets-output-"));
  try {
    terminal.emit("data", output);
    terminal.write("  SNIPPETS_INSERT  ");
    const selected = observed.ptys[0]!;
    const snapshot = snapshotWindowsPtyOutput(selected);
    terminal.emit("data", "later cleanup output");
    await retainWindowsPtyEvidence(root, selected, [], snapshot);
    const saved = JSON.parse(
      await readFile(path.join(root, "pty-writes.json"), "utf8"),
    ) as {
      writes: string[];
      childOutput: {
        text: string;
        truncated: boolean;
        limitCodeUnits: number;
      };
    };
    expect(saved.writes).toEqual(["  SNIPPETS_INSERT  "]);
    expect(saved.childOutput).toMatchObject({
      text: output,
      truncated: false,
      limitCodeUnits: 65536,
    });
    expect(saved.childOutput.text).toContain("SNIPPETS_INSERT_DRAFT_RECEIPT\n");
    expect(saved.childOutput.text).not.toContain("later cleanup output");
    terminal.emit("data", "x".repeat(70000));
    const truncated = snapshotWindowsPtyOutput(selected) as {
      text: string;
      truncated: boolean;
      limitCodeUnits: number;
    };
    expect(truncated.truncated).toBe(true);
    expect(truncated.text.length).toBe(truncated.limitCodeUnits);
    const truncatedRoot = await mkdtemp(
      path.join(os.tmpdir(), "snippets-truncated-"),
    );
    try {
      await retainWindowsPtyEvidence(truncatedRoot, selected, [], truncated);
      const savedTruncated = JSON.parse(
        await readFile(path.join(truncatedRoot, "pty-writes.json"), "utf8"),
      ) as { childOutput: typeof truncated };
      expect(savedTruncated.childOutput).toEqual(truncated);
    } finally {
      await rm(truncatedRoot, { recursive: true, force: true });
    }
  } finally {
    observed.restore();
    await rm(root, { recursive: true, force: true });
  }
});

describe("Snippets fixture observation lifecycle", () => {
  it("refuses a nonpackaged backend before spawn and records exit separately from stream close", () => {
    const h = harness(123, path.posix);
    const observation = h.observe();
    const fork = h.childProcess.fork as unknown as (
      ...args: unknown[]
    ) => EventEmitter;
    expect(() =>
      fork("/wrong/extension-runtime/bootstrap.mjs", [], {
        execPath: "/fixture/omxterm",
      }),
    ).toThrow();
    expect(h.originalFork).not.toHaveBeenCalled();
    fork("/fixture/app.asar/dist/extension-runtime/bootstrap.mjs", [], {
      execPath: "/fixture/omxterm",
    });
    h.child.emit("exit", 0, null);
    expect(observation.children[0]).toMatchObject({
      closed: false,
      exit: { code: 0, signal: null },
    });
    h.child.emit("close");
    expect(observation.children[0]?.closed).toBe(true);
    observation.restore();
  });

  it("optionally records ordered PTY output and writes without changing forwarding", () => {
    const h = harness();
    const events: unknown[] = [];
    const observation = h.observe({
      readinessTrace: (event: unknown) => events.push(event),
    });
    const session = new h.Terminal();
    session.emit("data", "\u001b[?1004h");
    expect(session.write("\u001b[I")).toBe("forwarded");
    expect(events).toEqual([
      { kind: "pty-attached", ptyIndex: 0, pid: 123 },
      { kind: "pty-output", ptyIndex: 0, pid: 123, data: "\u001b[?1004h" },
      { kind: "pty-write", ptyIndex: 0, pid: 123, data: "\u001b[I" },
    ]);
    expect(observation.ptys[0]?.output).toBe("\u001b[?1004h");
    expect(session.writes).toEqual(["\u001b[I"]);
    observation.restore();
  });

  it("correlates the real observer with the real renderer adapter and input parser", async () => {
    const h = harness();
    const app = new EventEmitter();
    const ipcMain = new EventEmitter();
    let readiness!: ReturnType<typeof startWindowsProbeReadiness>;
    const observation = h.observe({
      readinessTrace: (event: object) => readiness.record(event),
    });
    readiness = startWindowsProbeReadiness({
      app,
      ipcMain,
      ptys: observation.ptys,
      createInputHandler,
      diagnostic: true,
    });
    try {
      const pending: Array<{ sessionId: string; data: string; end: number }> =
        [];
      const core = {
        id: 7,
        mainFrame: {},
        send(_channel: string, payload: (typeof pending)[number]) {
          pending.push(payload);
        },
      };
      app.emit("browser-window-created", {}, { webContents: core });
      const terminal = new h.Terminal();
      const parser = createInputHandler();
      let onOutput: (
        source: string,
        data: string,
        end: number,
      ) => void = () => {};
      const bridge = {
        onOutput(listener: typeof onOutput) {
          onOutput = listener;
          return () => {};
        },
        onExit() {
          return () => {};
        },
        async start() {
          return "s1";
        },
        acknowledgeOutput(sessionId: string, end: number) {
          ipcMain.emit(
            "terminal:output-ack",
            { sender: core, senderFrame: core.mainFrame },
            { sessionId, end },
          );
        },
      } as unknown as TerminalBridge;
      const adapter = createElectronTerminalAdapter(bridge);
      await adapter.start({
        onOutput(data) {
          parser.filterOutput(data);
        },
        onExit() {},
      });
      const output = "\u001b[?1004h\u001b[?2004lSNIPPETS_SHELL_READY\r\n";
      terminal.emit("data", output);
      expect(terminal.write("\u001b[I")).toBe("forwarded");
      core.send("terminal:output", {
        sessionId: "s1",
        data: output,
        end: Buffer.byteLength(output),
      });
      const item = pending[0]!;
      onOutput(item.sessionId, item.data, item.end);
      const snapshot = readiness.snapshot(core, observation.ptys[0]!);
      expect(snapshot.events.map((event) => event.kind)).toEqual([
        "core-attached",
        "pty-attached",
        "pty-output",
        "pty-write",
        "main-output",
        "renderer-ack",
      ]);
      expect(snapshot.events[2]?.data).toBe(output);
      expect(snapshot.events[4]?.data).toBe(output);
      expect(snapshot.checks).toMatchObject({
        markerSeen: true,
        acknowledgedAll: true,
        focusResetBeforeMarker: false,
        focusReporting: true,
      });
      expect(readiness.ready(core, observation.ptys[0]!)).toBe(false);
    } finally {
      readiness.dispose();
      observation.restore();
    }
  });

  it("preserves PTY forwarding and records unavailable observation if a trace callback fails", () => {
    const h = harness();
    const observation = h.observe({
      readinessTrace: () => {
        throw Error("trace unavailable");
      },
    });
    const session = new h.Terminal();
    session.emit("data", "output");
    expect(session.write("input")).toBe("forwarded");
    expect(session.writes).toEqual(["input"]);
    expect(observation.ptys[0]?.output).toBe("output");
    expect(observation.readinessTraceFailures()).toBe(3);
    observation.restore();
  });

  it("observes a ConPTY whose PID becomes available after attachment", () => {
    const h = harness(0);
    const observation = h.observe();
    const session = new h.Terminal();
    expect(observation.ptys[0]?.pid).toBe(0);
    session.pid = 321;
    session.emit("data", "ready");
    expect(observation.ptys[0]).toMatchObject({ pid: 321, output: "ready" });
    session.emit("exit");
    expect(observation.ptys[0]).toMatchObject({ pid: 321, exited: true });
    observation.restore();
  });

  it("recognizes and validates a native Windows backend path", () => {
    const h = harness(123, path.win32);
    const asar = "C:\\fixture\\app.asar";
    const executable = "C:\\fixture\\omxterm.exe";
    const observation = h.observe({ asar, executable });
    const fork = h.childProcess.fork as unknown as (
      ...args: unknown[]
    ) => EventEmitter;
    expect(() =>
      fork("C:\\wrong\\extension-runtime\\bootstrap.mjs", [], {
        execPath: executable,
      }),
    ).toThrow();
    expect(h.originalFork).not.toHaveBeenCalled();
    const bootstrap = path.win32.join(
      asar,
      "dist",
      "extension-runtime",
      "bootstrap.mjs",
    );
    expect(() =>
      fork(bootstrap, [], { execPath: "C:\\wrong\\omxterm.exe" }),
    ).toThrow();
    expect(h.originalFork).not.toHaveBeenCalled();
    fork(bootstrap, [], { execPath: executable });
    h.child.emit("exit", 0, null);
    h.child.emit("close");
    expect(observation.children).toHaveLength(1);
    expect(observation.children[0]).toMatchObject({
      pid: 456,
      closed: true,
      exit: { code: 0, signal: null },
    });
    observation.restore();
  });

  it("binds controlled approval to the exact archive digest", async () => {
    const h = harness();
    const observation = h.observe();
    await expect(
      h.dialog.showMessageBox(null, {
        title: "Trust extension code?",
        detail: "other",
      }),
    ).rejects.toThrow();
    expect(observation.approvalCount()).toBe(0);
    await expect(
      h.dialog.showMessageBox(null, {
        title: "Trust extension code?",
        detail: "SHA256 digest",
      }),
    ).resolves.toMatchObject({ response: 1 });
    expect(observation.approvalCount()).toBe(1);
    observation.restore();
  });
});
