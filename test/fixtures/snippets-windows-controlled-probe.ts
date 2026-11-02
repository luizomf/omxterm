import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { createInputHandler } from "restty/internal";

const require = createRequire(import.meta.url);

// Execute the unchanged child in a controlled byte stream, without claiming to
// reproduce ConPTY. Writes and child stdin are retained at separate boundaries.
export function controlledProbe(onOutput: (text: string) => void) {
  let input: ((chunk: Buffer) => void) | undefined;
  let exited: number | undefined;
  let error = "";
  const chunks: Buffer[] = [];
  const stdin = {
    isTTY: false,
    on: (_event: string, listener: (chunk: Buffer) => void) => {
      input = listener;
    },
    pause() {},
  };
  runInNewContext(
    readFileSync("test/fixtures/snippets-windows-probe.cjs", "utf8"),
    {
      Buffer,
      require,
      process: {
        env: {},
        stdin,
        stdout: { write: onOutput },
        stderr: {
          write: (text: string, callback: () => void) => {
            error += text;
            callback();
          },
        },
        exit: (code: number) => {
          exited = code;
        },
      },
      // A synchronous input delivery cannot fire the 150ms draft timer.
      setTimeout: () => 1,
      clearTimeout: () => {},
    },
  );
  return {
    feed(chunk: Buffer) {
      if (exited !== undefined) throw Error("probe already exited");
      chunks.push(Buffer.from(chunk));
      input!(chunk);
    },
    get exited() {
      return exited;
    },
    get error() {
      return error;
    },
    chunks,
  };
}

export function controlledDelivery(recordWrite: (text: string) => void) {
  let deliverOutput: ((text: string) => void) | undefined;
  let initialOutput = "";
  const probe = controlledProbe((text) => {
    if (deliverOutput) deliverOutput(text);
    else initialOutput += text;
  });
  return {
    probe,
    write(text: string) {
      recordWrite(text);
      // Identity delivery is only a model of the ConPTY boundary.
      for (const byte of Buffer.from(text)) probe.feed(Buffer.from([byte]));
    },
    attach(deliver: (text: string) => void) {
      deliverOutput = deliver;
      // Outer focus enable is explicitly simulated, not native evidence.
      deliver(
        initialOutput.replace("\u001b[?1004l", "\u001b[?1004l\u001b[?1004h"),
      );
    },
  };
}

export function controlledReadiness(
  core: object,
  session: object,
  output: (text: string) => void,
) {
  const app = new EventEmitter();
  const ipcMain = new EventEmitter();
  const frame = {};
  const observedCore = Object.assign(core, {
    id: 10,
    mainFrame: frame,
    send: (_channel: string, _payload: object) => {},
  });
  const { startWindowsProbeReadiness } =
    require("./snippets-windows-readiness.cjs") as {
      startWindowsProbeReadiness(options: object): {
        ready(core: object, session: object): boolean;
        dispose(): void;
      };
    };
  const readiness = startWindowsProbeReadiness({
    app,
    ipcMain,
    ptys: [session],
    createInputHandler,
  });
  app.emit("browser-window-created", {}, { webContents: observedCore });
  let outputEnd = 0;
  const beforeAck: boolean[] = [];
  function acknowledge(end: number) {
    ipcMain.emit(
      "terminal:output-ack",
      { sender: observedCore, senderFrame: frame },
      { sessionId: "s1", end },
    );
  }
  function deliver(text: string, holdAck = false) {
    // Explicit simulated terminal output framing. Not observed native bytes.
    const framed = text.replaceAll("\n", "\r\n");
    output(framed);
    outputEnd += Buffer.byteLength(framed);
    observedCore.send("terminal:output", {
      sessionId: "s1",
      data: framed,
      end: outputEnd,
    });
    beforeAck.push(readiness.ready(observedCore, session));
    if (!holdAck) acknowledge(outputEnd);
    return outputEnd;
  }
  function invalidAcknowledgements() {
    ipcMain.emit(
      "terminal:output-ack",
      { sender: observedCore, senderFrame: {} },
      { sessionId: "s1", end: outputEnd },
    );
    ipcMain.emit(
      "terminal:output-ack",
      { sender: observedCore, senderFrame: frame },
      { sessionId: "s1", end: outputEnd + 1 },
    );
  }
  return {
    ...readiness,
    deliver,
    acknowledge,
    invalidAcknowledgements,
    beforeAck,
  };
}

export function controlledFinalBarrier(
  mode: string | undefined,
  readiness: ReturnType<typeof controlledReadiness>,
  core: object,
  session: object,
  events: string[],
) {
  let held = false;
  let ackEnd = 0;
  let falsePolls = 0;
  let clock = 0;
  const enabled =
    mode === "final-ack-delayed" ||
    mode === "final-ack-missing" ||
    mode === "final-frame-ack" ||
    mode === "final-invalid-ack";
  return {
    close() {
      if (!enabled) return;
      held = true;
      ackEnd = readiness.deliver("\u001b[6n\u001b[2;1H", true);
      events.push(`output-ready:${readiness.ready(core, session)}`);
    },
    frame() {
      if (!held) return;
      events.push("frames");
      if (mode === "final-frame-ack") {
        ackEnd = readiness.deliver("\u001b[6n\u001b[3;1H", true);
        events.push(`frame-output-ready:${readiness.ready(core, session)}`);
      }
    },
    ping() {
      if (held) events.push(`ping-ready:${readiness.ready(core, session)}`);
    },
    ready(candidate: object, target: object) {
      const ready = readiness.ready(candidate, target);
      if (!held) return ready;
      events.push(`poll:${ready}`);
      if (!ready) {
        falsePolls++;
        if (mode === "final-invalid-ack" && falsePolls === 1) {
          readiness.invalidAcknowledgements();
          events.push(
            `invalid-ack-ready:${readiness.ready(candidate, target)}`,
          );
        }
        if (mode !== "final-ack-missing")
          queueMicrotask(() => {
            readiness.acknowledge(ackEnd);
            events.push("ack");
          });
      }
      return ready;
    },
    clock:
      mode === "final-ack-missing"
        ? () => (falsePolls ? (clock += 16000) : 0)
        : undefined,
  };
}
