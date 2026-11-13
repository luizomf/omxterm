import { expect, it, vi } from "vitest";
import {
  registerTerminalIpcRouter,
  type TrustedWebContents,
} from "../../src/main/terminal-ipc-controller";
import type { SessionCallbacks } from "../../src/main/terminal-ipc-types";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import {
  clipboardOptions,
  createIpcHarness,
} from "../fixtures/terminal-ipc-harness";

function harness() {
  const ipc = createIpcHarness();
  const router = registerTerminalIpcRouter(ipc.ipcMain);
  const frame = {};
  const webContents: TrustedWebContents = {
    mainFrame: frame,
    isDestroyed: () => false,
    send: vi.fn(),
  };
  const callbacks: SessionCallbacks[] = [];
  const writes: string[] = [];
  const options = clipboardOptions();
  const controller = router.registerController({
    ...options,
    webContents,
    onSessionStartError: vi.fn(),
    onSessionExit: vi.fn(),
    createSession(next) {
      callbacks.push(next);
      return {
        write: vi.fn(),
        writeTracked(data: string) {
          writes.push(data);
          return "accepted" as const;
        },
        resize: vi.fn(),
        acknowledgeOutput: () => true,
        hasForegroundChildProcess: () => false,
        close: vi.fn(),
      };
    },
  });
  const owner = { sender: webContents, senderFrame: frame };
  const start = () => ipc.handlers.get(terminalIpc.start)!(owner) as string;
  const send = (channel: string, payload: unknown) =>
    ipc.listeners.get(channel)!(owner, payload);
  return { router, controller, options, callbacks, writes, start, send };
}

it("writes agent bytes to the PTY without counting as the user's typing", () => {
  const { controller, options, writes, start, router } = harness();
  const sessionId = start();
  const port = controller.agentSessions!;
  expect(port.write(sessionId, "ls\r")).toBe("accepted");
  expect(writes).toEqual(["ls\r"]);
  // Attention and layout activity belong to the user's own input.
  expect(options.onUserInteraction).not.toHaveBeenCalled();
  expect(port.write("s9", "x")).toBe("rejected");
  router.dispose();
});

it("reports live sessions, sizes, positions and their output, acks and exit", () => {
  const { controller, callbacks, start, send, router } = harness();
  const first = start();
  const second = start();
  send(terminalIpc.resize, { sessionId: second, cols: 90, rows: 20 });
  const port = controller.agentSessions!;
  const events: string[] = [];
  const stop = port.observe({
    output: (id) => events.push(`output ${id}`),
    acknowledged: (id) => events.push(`ack ${id}`),
    exited: (id, code) => events.push(`exit ${id} ${code}`),
  });

  callbacks[0]!.onOutput("hello");
  expect(port.position(first)).toEqual({ sent: 5, acknowledged: 0 });
  send(terminalIpc.outputAck, { sessionId: first, end: 5 });
  expect(port.position(first)).toEqual({ sent: 5, acknowledged: 5 });
  // A bogus acknowledgement changes nothing and reports nothing.
  send(terminalIpc.outputAck, { sessionId: first, end: 50 });
  expect(port.sessions()).toEqual([
    { sessionId: first, focused: false },
    { sessionId: second, focused: false, cols: 90, rows: 20 },
  ]);

  callbacks[1]!.onExit({ exitCode: 7, signal: 0 });
  expect(port.position(second)).toBeUndefined();
  expect(port.sessions().map((session) => session.sessionId)).toEqual([first]);
  expect(events).toEqual([
    `output ${first}`,
    `ack ${first}`,
    `exit ${second} 7`,
  ]);

  stop();
  callbacks[0]!.onOutput("more");
  expect(events).toHaveLength(3);
  router.dispose();
});
