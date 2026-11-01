import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import path from "node:path";
import { createInputHandler } from "restty/internal";
import { expect, it } from "vitest";
import { createElectronTerminalAdapter } from "../../src/renderer/electron-terminal-adapter";
import type { TerminalBridge } from "../../src/shared/terminal-bridge";

const require = createRequire(import.meta.url);
const { startWindowsProbeReadiness } =
  require("../fixtures/snippets-windows-readiness.cjs") as {
    startWindowsProbeReadiness(options: {
      app: EventEmitter;
      ipcMain: EventEmitter;
      ptys: object[];
      createInputHandler: typeof createInputHandler;
      diagnostic?: boolean;
    }): {
      ready(core: object, session: object): boolean;
      record(event: object): void;
      snapshot(
        core: object,
        session: object,
      ): {
        checks: Record<string, boolean | null>;
        events: Array<{
          kind: string;
          data?: string;
          senderFrameMatches?: boolean | null;
        }>;
        eventCount: number;
        eventsTruncated: boolean;
        mainOutput: { invalidReason: string | null } | null;
        sessions: Array<{
          outputTail: string;
          outputTailTruncated: boolean;
          writes: string[];
          writesTruncated: boolean;
        }>;
      };
      dispose(): void;
    };
  };
const probe = path.resolve("test/fixtures/snippets-windows-probe.cjs");
const reset = execFileSync(process.execPath, [probe], {
  input: "",
  encoding: "utf8",
  timeout: 5_000,
  env: { ...process.env, OMXTERM_SNIPPETS_PACKAGED_INSERT_DIAGNOSTIC: "0" },
}).replaceAll("\n", "\r\n");
const conptyReset = reset.replace(
  "\u001b[?1004l",
  "\u001b[?1004l\u001b[?1004h",
);

type Output = { sessionId: string; data: string; end: number };
async function fixture(diagnostic = false) {
  const app = new EventEmitter();
  const ipcMain = new EventEmitter();
  const session = {
    pid: 42,
    output: "",
    writes: [] as string[],
    exited: false,
  };
  const ptys = [session];
  const readiness = startWindowsProbeReadiness({
    app,
    ipcMain,
    ptys,
    createInputHandler,
    diagnostic,
  });
  const pending: Output[] = [];
  const core = {
    mainFrame: {},
    send(channel: string, payload: Output) {
      if (channel === "terminal:output") pending.push(payload);
      return "forwarded";
    },
  };
  app.emit("browser-window-created", {}, { webContents: core });
  const parser = createInputHandler();
  let outputListener: (
    source: string,
    data: string,
    end: number,
  ) => void = () => {};
  const bridge = {
    onOutput(listener: typeof outputListener) {
      outputListener = listener;
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
  let end = 0;
  const send = (data: string) => {
    end += Buffer.byteLength(data);
    expect(core.send("terminal:output", { sessionId: "s1", data, end })).toBe(
      "forwarded",
    );
  };
  const deliver = () => {
    const item = pending.shift();
    if (!item) throw Error("No pending output");
    outputListener(item.sessionId, item.data, item.end);
  };
  return {
    app,
    ipcMain,
    core,
    session,
    ptys,
    readiness,
    parser,
    pending,
    send,
    deliver,
  };
}

it("accepts the captured ConPTY reset followed by outer enable only after renderer ACK", async () => {
  const f = await fixture(true);
  try {
    const captured =
      "\u001b[?1004l\u001b[?1004h\u001b[?2004lSNIPPETS_SHELL_READY\r\n";
    f.send(captured);
    expect(f.readiness.ready(f.core, f.session)).toBe(false);
    f.deliver();
    expect(f.parser.isFocusReporting()).toBe(true);
    expect(f.readiness.ready(f.core, f.session)).toBe(true);
    expect(f.readiness.snapshot(f.core, f.session).checks).toMatchObject({
      focusResetBeforeMarker: true,
      outerFocusEnableAfterReset: true,
      focusReporting: true,
      bracketedPaste: false,
    });
  } finally {
    f.readiness.dispose();
  }
});

it("captures the real mode predicate and ordered original output and ACK on a readiness failure", async () => {
  const f = await fixture(true);
  try {
    const startup =
      "\u001b[?1004h\u001b[?9001h\u001b[?2004lSNIPPETS_SHELL_READY\r\n";
    f.session.output = startup;
    f.readiness.record({
      kind: "pty-output",
      ptyIndex: 0,
      pid: 42,
      data: startup,
    });
    f.send(startup);
    f.deliver();
    expect(f.readiness.ready(f.core, f.session)).toBe(false);
    const snapshot = f.readiness.snapshot(f.core, f.session);
    expect(snapshot.checks).toMatchObject({
      coreObserved: true,
      markerSeen: true,
      acknowledgedAll: true,
      focusResetBeforeMarker: false,
      focusReporting: true,
      bracketedPaste: false,
    });
    expect(snapshot.events.map((event) => event.kind)).toEqual([
      "core-attached",
      "pty-output",
      "main-output",
      "renderer-ack",
    ]);
    expect(snapshot.events[1]?.data).toBe(startup);
    expect(snapshot.events[2]?.data).toBe(startup);
    expect(snapshot.eventsTruncated).toBe(false);
  } finally {
    f.readiness.dispose();
  }
});

it("waits for the renderer adapter to consume the inner reset and outer enable", async () => {
  const f = await fixture();
  try {
    f.send("\u001b[?1004h\u001b[?9001h\u001b[?2004h");
    f.deliver();
    expect(f.parser.isFocusReporting()).toBe(true);
    expect(f.parser.isBracketedPaste()).toBe(true);
    f.send(conptyReset);
    expect(f.pending[0]?.data).toBe(conptyReset); // Forwarded without rewriting.
    expect(f.readiness.ready(f.core, f.session)).toBe(false);
    expect(f.parser.isFocusReporting()).toBe(true);
    f.deliver();
    expect(f.parser.isFocusReporting()).toBe(true);
    expect(f.parser.isBracketedPaste()).toBe(false);
    expect(f.readiness.ready(f.core, f.session)).toBe(true);
  } finally {
    f.readiness.dispose();
  }
});

it("rejects unrelated, premature and partial ACKs and accepts a split reset only after its own ACK", async () => {
  const f = await fixture();
  try {
    const split = Math.floor(conptyReset.length / 2);
    f.send(conptyReset.slice(0, split));
    f.deliver();
    f.send(conptyReset.slice(split));
    const end = Buffer.byteLength(conptyReset);
    f.ipcMain.emit(
      "terminal:output-ack",
      { sender: f.core, senderFrame: {} },
      { sessionId: "s1", end },
    );
    f.ipcMain.emit(
      "terminal:output-ack",
      { sender: f.core, senderFrame: f.core.mainFrame },
      { sessionId: "s2", end },
    );
    f.ipcMain.emit(
      "terminal:output-ack",
      { sender: f.core, senderFrame: f.core.mainFrame },
      { sessionId: "s1", end: end - 1 },
    );
    expect(f.readiness.ready(f.core, f.session)).toBe(false);
    f.deliver();
    expect(f.readiness.ready(f.core, f.session)).toBe(true);
    expect(f.readiness.ready({}, f.session)).toBe(false);
    expect(f.readiness.ready(f.core, { exited: false })).toBe(false);
    f.ptys.push({ pid: 77, output: "", writes: [], exited: false });
    expect(f.readiness.ready(f.core, f.session)).toBe(false);
  } finally {
    f.readiness.dispose();
  }
});

it("fails closed on a later outer reset until the re-enable is consumed", async () => {
  const f = await fixture();
  try {
    f.send(conptyReset);
    f.deliver();
    expect(f.readiness.ready(f.core, f.session)).toBe(true);
    f.send("\u001b[?1004l");
    expect(f.readiness.ready(f.core, f.session)).toBe(false);
    f.deliver();
    expect(f.parser.isFocusReporting()).toBe(false);
    expect(f.readiness.ready(f.core, f.session)).toBe(false);
    f.send("\u001b[?1004h");
    expect(f.readiness.ready(f.core, f.session)).toBe(false);
    f.deliver();
    expect(f.parser.isFocusReporting()).toBe(true);
    expect(f.readiness.ready(f.core, f.session)).toBe(true);
  } finally {
    f.readiness.dispose();
  }
});

it("refuses a split or combined later outer focus reset before the next checkpoint", async () => {
  const f = await fixture();
  try {
    f.send(conptyReset);
    f.deliver();
    expect(f.readiness.ready(f.core, f.session)).toBe(true);
    f.send("\u001b[?1004;");
    f.deliver();
    expect(f.readiness.ready(f.core, f.session)).toBe(false);
    f.send("9001l");
    f.deliver();
    expect(f.parser.isFocusReporting()).toBe(false);
    expect(f.readiness.ready(f.core, f.session)).toBe(false);
  } finally {
    f.readiness.dispose();
  }
});

it("reports an unknown core, rejected ACK and invalid output without claiming readiness", async () => {
  const f = await fixture(true);
  try {
    expect(f.readiness.snapshot({}, f.session)).toMatchObject({
      checks: { coreObserved: false, observerValid: null },
      mainOutput: null,
    });
    f.core.send("terminal:output", { sessionId: "s2", data: "x", end: 1 });
    f.ipcMain.emit(
      "terminal:output-ack",
      { sender: f.core, senderFrame: {} },
      { sessionId: "s1", end: 1 },
    );
    const snapshot = f.readiness.snapshot(f.core, f.session);
    expect(snapshot.checks.observerValid).toBe(false);
    expect(snapshot.mainOutput?.invalidReason).toBe(
      "invalid-output-or-progress",
    );
    expect(snapshot.events.at(-1)).toMatchObject({
      kind: "renderer-ack",
      senderFrameMatches: false,
    });
    expect(f.readiness.ready(f.core, f.session)).toBe(false);
  } finally {
    f.readiness.dispose();
  }
});

it("records an original output-send exception without changing the thrown error", () => {
  const app = new EventEmitter();
  const ipcMain = new EventEmitter();
  const session = { pid: 42, output: "", writes: [], exited: false };
  const readiness = startWindowsProbeReadiness({
    app,
    ipcMain,
    ptys: [session],
    createInputHandler,
    diagnostic: true,
  });
  const primary = Error("send unavailable");
  const core = {
    mainFrame: {},
    send(_channel: string, _payload: object) {
      throw primary;
    },
  };
  app.emit("browser-window-created", {}, { webContents: core });
  try {
    expect(() =>
      core.send("terminal:output", { sessionId: "s1", end: 3, data: "abc" }),
    ).toThrow(primary);
    expect(readiness.snapshot(core, session).events.at(-1)).toMatchObject({
      kind: "main-output-send-threw",
      data: "abc",
    });
  } finally {
    readiness.dispose();
  }
});

it("bounds diagnostic events and makes omitted observations explicit", async () => {
  const f = await fixture(true);
  try {
    for (let i = 0; i < 140; i++)
      f.readiness.record({ kind: "pty-output", data: "x" });
    f.session.output = "x".repeat(2049);
    f.session.writes.push(...Array.from({ length: 33 }, () => "y"));
    const snapshot = f.readiness.snapshot(f.core, f.session);
    expect(snapshot.eventCount).toBe(141);
    expect(snapshot.events).toHaveLength(128);
    expect(snapshot.eventsTruncated).toBe(true);
    expect(snapshot.sessions[0]).toMatchObject({
      outputTailTruncated: true,
      writesTruncated: true,
    });
    expect(snapshot.sessions[0]!.outputTail).toHaveLength(2048);
    expect(snapshot.sessions[0]!.writes).toHaveLength(32);
  } finally {
    f.readiness.dispose();
  }
});

it("refuses a child reset without the outer enable", async () => {
  const f = await fixture();
  try {
    f.send(reset);
    f.deliver();
    expect(f.readiness.ready(f.core, f.session)).toBe(false);
  } finally {
    f.readiness.dispose();
  }
});

it("refuses a marker without the focus reset or an unexpected output session", async () => {
  const f = await fixture();
  try {
    f.send("\u001b[?2004lSNIPPETS_SHELL_READY\r\n");
    f.deliver();
    expect(f.readiness.ready(f.core, f.session)).toBe(false);
    f.core.send("terminal:output", { sessionId: "s2", data: "other", end: 5 });
    f.send(reset);
    f.deliver(); // The unexpected session remains in the actual forwarded queue.
    f.deliver();
    expect(f.readiness.ready(f.core, f.session)).toBe(false);
  } finally {
    f.readiness.dispose();
  }
});
