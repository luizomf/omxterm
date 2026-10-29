import { expect, it, vi } from "vitest";
import { createMirrorInputLease } from "../../src/main/mirror-input-lease";
import { registerTerminalIpcRouter } from "../../src/main/terminal-ipc-controller";
import type { SessionCallbacks } from "../../src/main/terminal-ipc-types";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import {
  clipboardOptions,
  createIpcHarness,
} from "../fixtures/terminal-ipc-harness";

function fixture() {
  const sessions = new Map(["s1", "s2", "s3"].map((id) => [id, { id }]));
  let focused = "s1";
  let foreground = true;
  const owner = new AbortController();
  const write = vi.fn();
  const stopped = vi.fn();
  const route = createMirrorInputLease({
    current: (id) => sessions.get(id),
    selected: () => true,
    focused: (id) => id === focused,
    windowFocused: () => foreground,
    available: () => true,
    write,
    stopped,
  });
  return {
    sessions,
    owner,
    write,
    stopped,
    route,
    focus: (id: string) => {
      focused = id;
      route.recheck();
    },
    foreground: (value: boolean) => {
      foreground = value;
    },
    grant: () => route.grant(["s1", "s2"], "s1", owner.signal),
  };
}
const key = (lease: string, sequence = 1, sourceSessionId = "s1") => ({
  lease,
  sequence,
  sourceSessionId,
  data: "\u001b[13u",
});

it("routes exact bytes once to fixed native recipients and accepts selected member focus", () => {
  const f = fixture();
  const lease = f.grant();
  f.route.input(key(lease));
  expect(f.write.mock.calls).toEqual([
    [f.sessions.get("s1"), "\u001b[13u"],
    [f.sessions.get("s2"), "\u001b[13u"],
  ]);
  f.focus("s2");
  f.route.input(key(lease, 2, "s2"));
  expect(f.write).toHaveBeenCalledTimes(4);
  f.focus("s3");
  f.route.input(key(lease, 3, "s3"));
  expect(f.write).toHaveBeenCalledTimes(4);
  expect(f.stopped).toHaveBeenCalledTimes(1);
});
it("refuses malformed, foreign and oversized input; drops stale leases without affecting a new one", () => {
  const f = fixture();
  const lease = f.grant();
  for (const invalid of [
    null,
    { ...key(lease), extra: true },
    key("foreign"),
    { ...key(lease), data: "x".repeat(65537) },
    { ...key(lease), sequence: NaN },
  ])
    f.route.input(invalid);
  expect(f.write).not.toHaveBeenCalled();
  f.route.revoke();
  const next = f.grant();
  f.route.input(key(lease));
  f.route.input(key(next));
  expect(f.write).toHaveBeenCalledTimes(2);
  f.route.revoke();
});
it("refuses duplicate events and never retries after a partial native write failure", () => {
  const f = fixture();
  let lease = f.grant();
  f.route.input(key(lease));
  f.route.input(key(lease));
  expect(f.write).toHaveBeenCalledTimes(2);
  expect(f.stopped).toHaveBeenLastCalledWith(lease, "unavailable");
  lease = f.grant();
  f.write
    .mockImplementationOnce(() => {})
    .mockImplementationOnce(() => {
      throw Error("native");
    });
  f.route.input(key(lease));
  f.route.input(key(lease, 2));
  expect(f.write).toHaveBeenCalledTimes(4);
  expect(f.stopped).toHaveBeenLastCalledWith(lease, "write-failed");
});
it("revokes before writes on member replacement, and synchronously during a write on owner loss", () => {
  const f = fixture();
  const lease = f.grant();
  f.sessions.set("s2", { id: "s2" });
  f.route.input(key(lease));
  expect(f.write).not.toHaveBeenCalled();
  const next = f.grant();
  f.write.mockImplementationOnce(() => f.owner.abort());
  f.route.input(key(next));
  expect(f.write).toHaveBeenCalledTimes(1);
  expect(() => f.grant()).toThrow("unavailable");
});
it("does not admit background input or replay it when focus returns", () => {
  const f = fixture();
  const lease = f.grant();
  f.foreground(false);
  f.route.input(key(lease));
  expect(f.write).not.toHaveBeenCalled();
  expect(f.stopped).not.toHaveBeenCalled();
  f.foreground(true);
  f.route.input(key(lease, 2));
  expect(f.write).toHaveBeenCalledTimes(2);
  f.route.revoke();
});
it("refuses duplicate/missing members, dead source and a second active grant", () => {
  const f = fixture();
  for (const ids of [["s1"], ["s1", "s1"], ["s1", "s9"], ["s2", "s3"]])
    expect(() => f.route.grant(ids, "s1", f.owner.signal)).toThrow();
  f.grant();
  expect(() => f.grant()).toThrow();
  f.route.revoke();
  f.sessions.delete("s1");
  expect(() => f.grant()).toThrow();
});
it("controller owns live sessions and revokes on selection, close, native exit and disposal", () => {
  const ipc = createIpcHarness();
  const router = registerTerminalIpcRouter(ipc.ipcMain);
  const frame = {};
  const webContents = {
    mainFrame: frame,
    isDestroyed: () => false,
    send: vi.fn(),
  };
  const event = { sender: webContents, senderFrame: frame };
  const callbacks: SessionCallbacks[] = [];
  const sessions: {
    write: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    resize: ReturnType<typeof vi.fn>;
    hasForegroundChildProcess(): boolean;
  }[] = [];
  const stopped = vi.fn();
  const controller = router.registerController({
    ...clipboardOptions(),
    webContents,
    onSessionStartError: vi.fn(),
    onSessionExit: vi.fn(),
    mirrorWindowAvailable: () => true,
    mirrorWindowFocused: () => true,
    onMirrorStopped: stopped,
    createSession(next) {
      callbacks.push(next);
      const session = {
        write: vi.fn(),
        close: vi.fn(),
        resize: vi.fn(),
        hasForegroundChildProcess: () => false,
      };
      sessions.push(session);
      return session;
    },
  });
  const start = ipc.handlers.get(terminalIpc.start)!;
  start(event);
  start(event);
  start(event);
  const select = (ids: string[], focused = "s1") =>
    ipc.listeners.get(terminalIpc.tabSelected)!(event, {
      sessionId: focused,
      tabSessionIds: ids,
    });
  const mirror = controller.mirrorTyping!;
  const owner = new AbortController();
  const grant = () => mirror.grant(["s1", "s2"], "s1", owner.signal);
  select(["s1", "s2", "s3"]);
  let lease = grant();
  mirror.input(key(lease));
  expect(sessions.map((s) => s.write.mock.calls.length)).toEqual([1, 1, 0]);
  select(["s3"], "s3");
  mirror.input(key(lease, 2));
  expect(stopped).toHaveBeenCalledTimes(1);
  expect(grant).toThrow();
  select(["s1", "s2"]);
  lease = grant();
  ipc.listeners.get(terminalIpc.close)!(event, { sessionId: "s2" });
  mirror.input(key(lease));
  expect(stopped).toHaveBeenCalledTimes(2);
  expect(grant).toThrow();
  select(["s1", "s3"]);
  mirror.grant(["s1", "s3"], "s1", owner.signal);
  callbacks[2]!.onExit({ exitCode: 0, signal: 0 });
  expect(stopped).toHaveBeenCalledTimes(3);
  start(event);
  select(["s1", "s4"]);
  mirror.grant(["s1", "s4"], "s1", owner.signal);
  controller.dispose();
  expect(stopped).toHaveBeenCalledTimes(4);
  router.dispose();
});
