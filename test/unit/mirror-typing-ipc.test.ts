import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { BrowserWindow } from "electron";
import { expect, it, vi } from "vitest";
import {
  registerMirrorTypingIpc,
  MirrorSetupError,
} from "../../src/main/mirror-typing-ipc";
import { registerTerminalIpcRouter } from "../../src/main/terminal-ipc-controller";
import {
  mirrorTypingIpc,
  type MirrorCommand,
  type MirrorPane,
} from "../../src/shared/mirror-typing";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import { captureValue, type Value } from "../../src/extension-runtime/protocol";
import {
  clipboardOptions,
  createIpcHarness,
} from "../fixtures/terminal-ipc-harness";

function fixture() {
  const ipc = createIpcHarness();
  const frame = {};
  const panes: MirrorPane[] = [1, 2, 3].map((ordinal) => ({
    handle: randomUUID(),
    sessionId: `s${ordinal}`,
    title: `Pane ${ordinal}`,
    required: ordinal === 1,
  }));
  let focused = true;
  const send = vi.fn((_channel: string, _value: unknown) => {});
  const contents = Object.assign(new EventEmitter(), {
    mainFrame: frame,
    isDestroyed: () => false,
    send,
  });
  const event = { sender: contents, senderFrame: frame };
  const native = Object.assign(new EventEmitter(), {
    webContents: contents,
    isDestroyed: () => false,
    isVisible: () => true,
    isMinimized: () => false,
    isFocused: () => focused,
  });
  const window = native as unknown as BrowserWindow;
  const router = registerTerminalIpcRouter(ipc.ipcMain);
  const service = registerMirrorTypingIpc({
    ipc: ipc.ipcMain,
    trusted: router.isTrustedSender,
    quitting: () => false,
  });
  const writes = [vi.fn(), vi.fn(), vi.fn()];
  let index = 0;
  const controller = router.registerController({
    ...clipboardOptions(),
    webContents: contents,
    mirrorWindowAvailable: () => true,
    mirrorWindowFocused: () => focused,
    onMirrorStopped: (lease, reason) => service.stopped(window, lease, reason),
    onSessionStartError: vi.fn(),
    onSessionExit: vi.fn(),
    createSession: () => ({
      write: writes[index++]!,
      resize: vi.fn(),
      close: vi.fn(),
      hasForegroundChildProcess: () => false,
    }),
  });
  service.register(window, controller);
  for (let i = 0; i < 3; i++) ipc.handlers.get(terminalIpc.start)!(event);
  const select = () =>
    ipc.listeners.get(terminalIpc.tabSelected)!(event, {
      sessionId: "s1",
      tabSessionIds: ["s1", "s2", "s3"],
    });
  select();
  const reply = (
    request: string,
    ok = true,
    snapshot?: readonly MirrorPane[],
  ) =>
    ipc.listeners.get(mirrorTypingIpc.reply)!(event, {
      request,
      ok,
      ...(snapshot ? { panes: snapshot } : {}),
    });
  let holdPrepare = false;
  let prepared: string | undefined;
  let lease: string | undefined;
  send.mockImplementation((channel, value) => {
    if (channel !== mirrorTypingIpc.command) return;
    const command = value as MirrorCommand;
    if (command.kind === "capture" || command.kind === "describe")
      reply(command.request, true, panes);
    if (command.kind === "prepare") {
      prepared = command.request;
      if (!holdPrepare) reply(command.request);
    }
    if (command.kind === "handoff") {
      select();
      reply(command.request);
    }
    if (command.kind === "activate") {
      lease = command.lease;
      reply(command.request);
    }
  });
  const lifetime = new AbortController();
  const admit = vi.fn(async (signal: AbortSignal, commit: () => void) => {
    if (signal.aborted) throw Error("aborted");
    commit();
  });
  const request = (context: string, value: Record<string, Value>) =>
    service.request(
      window,
      context,
      "view-id",
      // Hosted views forward captured JSON arrays with no prototype/iterator.
      captureValue({
        operation: "terminal.mirrorTyping.v1",
        ...value,
      }) as Record<string, Value>,
      lifetime.signal,
      admit,
    );
  return {
    ipc,
    event,
    service,
    window,
    native,
    panes,
    writes,
    controller,
    admit,
    lifetime,
    reply,
    send,
    capture: () => service.capture(window, lifetime.signal, "s1"),
    request,
    hold: () => {
      holdPrepare = true;
    },
    prepared: () => prepared!,
    lease: () => lease!,
    key(sequence = 1, sender = event) {
      ipc.listeners.get(mirrorTypingIpc.input)!(sender, {
        lease,
        sequence,
        sourceSessionId: "s1",
        data: "typed",
      });
    },
    blur() {
      focused = false;
      native.emit("blur");
    },
    focus() {
      focused = true;
    },
    dispose() {
      service.dispose();
      router.dispose();
    },
  };
}
async function setup(f: ReturnType<typeof fixture>) {
  const context = await f.capture();
  f.service.bind(f.window, context, f.lifetime.signal);
  const result = (await f.request(context, { action: "describe" })) as {
    ok: boolean;
    setupToken: string;
    panes: Record<string, Value>[];
  };
  expect(result.ok).toBe(true);
  expect(result.panes[0]).not.toHaveProperty("sessionId");
  return {
    context,
    start: {
      action: "start",
      setupToken: result.setupToken,
      handles: f.panes.slice(0, 2).map((pane) => pane.handle),
    },
  };
}
it.each(["focus-live-pane", "need-two-panes"] as const)(
  "preserves bounded initial eligibility recovery: %s",
  async (reason) => {
    const f = fixture();
    f.send.mockImplementation((channel, value) => {
      if (channel !== mirrorTypingIpc.command) return;
      const command = value as MirrorCommand;
      if (command.kind === "capture")
        f.ipc.listeners.get(mirrorTypingIpc.reply)!(f.event, {
          request: command.request,
          ok: false,
          error: reason,
        });
    });
    await expect(f.capture()).rejects.toMatchObject({ reason });
    await expect(
      f.service.capture(f.window, f.lifetime.signal),
    ).rejects.toBeInstanceOf(MirrorSetupError);
    f.dispose();
  },
);

it("late retirement of an old setup cannot revoke a replacement context", async () => {
  const f = fixture();
  const old = await f.capture();
  const { context, start } = await setup(f);
  await f.request(context, start);
  f.service.retire(f.window, old);
  f.key();
  expect(f.writes[0]).toHaveBeenCalledTimes(1);
  f.service.retire(f.window, context);
  f.key(2);
  expect(f.writes[0]).toHaveBeenCalledTimes(1);
  f.dispose();
});

it("composes captured view requests, visible handoff and fixed native recipients without exposing session IDs", async () => {
  const f = fixture();
  const { context, start } = await setup(f);
  expect(await f.request(context, start)).toEqual({
    ok: true,
    status: "active",
  });
  f.key();
  expect(f.writes.map((write) => write.mock.calls)).toEqual([
    [["typed"]],
    [["typed"]],
    [],
  ]);
  f.key(2, { ...f.event, senderFrame: {} });
  expect(f.writes[0]).toHaveBeenCalledTimes(1);
  f.key(2);
  expect(f.writes[0]).toHaveBeenCalledTimes(2);
  await f.request(context, { action: "stop" });
  f.key(3);
  expect(f.writes[0]).toHaveBeenCalledTimes(2);
  expect(await f.request(context, start)).toMatchObject({ ok: false });
  f.dispose();
});
it("drops held prepare after Stop, including a late renderer ready response", async () => {
  const f = fixture();
  const { context, start } = await setup(f);
  f.hold();
  const starting = f.request(context, start);
  await Promise.resolve();
  await Promise.resolve();
  f.ipc.listeners.get(mirrorTypingIpc.stop)!(f.event, {
    context,
    reason: "stopped",
  });
  f.reply(f.prepared());
  expect(await starting).toMatchObject({ ok: false });
  expect(f.lease()).toBeUndefined();
  expect(f.writes.every((write) => !write.mock.calls.length)).toBe(true);
  f.dispose();
});
it("establishes cancellable renderer preparation before the first delayed store admission", async () => {
  const f = fixture();
  const { context, start } = await setup(f);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered!: () => void;
  const firstAdmission = new Promise<void>((resolve) => {
    entered = resolve;
  });
  f.admit.mockImplementationOnce(async (_signal, commit) => {
    entered();
    await gate;
    commit();
  });
  const starting = f.request(context, start);
  await firstAdmission;
  expect(f.prepared()).toBeDefined();
  // Main also retains navigation invalidation before the intentional handoff,
  // including leave-and-return before the renderer handles its next message.
  f.service.selectionChanged(f.window, "s1");
  f.service.selectionChanged(f.window, null);
  release();
  expect(await starting).toMatchObject({ ok: false });
  expect(f.lease()).toBeUndefined();
  f.dispose();
});

it.each([false, true])(
  "rejects stopped final admission without affecting a later explicit start: %s",
  async (replacement) => {
    const f = fixture();
    const { context, start } = await setup(f);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    f.admit.mockImplementationOnce(async (_signal, commit) => {
      commit();
    });
    f.admit.mockImplementationOnce(async (_signal, commit) => {
      entered();
      await gate;
      commit();
    });
    const starting = f.request(context, start);
    await ready;
    await f.request(context, { action: "stop" });
    if (replacement) {
      const fresh = (await f.request(context, { action: "describe" })) as {
        setupToken: string;
      };
      expect(
        await f.request(context, { ...start, setupToken: fresh.setupToken }),
      ).toMatchObject({ ok: true });
    }
    release();
    expect(await starting).toMatchObject({ ok: false });
    if (replacement) {
      f.key();
      expect(f.writes[0]).toHaveBeenCalledTimes(1);
    } else expect(f.lease()).toBeUndefined();
    f.dispose();
  },
);
it("keeps active authority through blur without background writes, then revokes on hide and lifetime loss", async () => {
  const f = fixture();
  let setupResult = await setup(f);
  await f.request(setupResult.context, setupResult.start);
  f.blur();
  f.key();
  expect(f.writes[0]).not.toHaveBeenCalled();
  f.focus();
  f.key(2);
  expect(f.writes[0]).toHaveBeenCalledTimes(1);
  f.native.emit("hide");
  f.key(3);
  expect(f.writes[0]).toHaveBeenCalledTimes(1);
  setupResult = await setup(f);
  await f.request(setupResult.context, setupResult.start);
  f.lifetime.abort();
  f.key();
  expect(f.writes[0]).toHaveBeenCalledTimes(1);
  f.dispose();
});
it("invalidates original selection during activation and rejects stale refresh tokens and foreign handles", async () => {
  const f = fixture();
  const captured = await f.capture();
  f.service.selectionChanged(f.window, "s2");
  expect(() => f.service.bind(f.window, captured, f.lifetime.signal)).toThrow();
  const { context, start } = await setup(f);
  await f.request(context, { action: "describe" });
  expect(await f.request(context, start)).toMatchObject({ ok: false });
  const description = (await f.request(context, { action: "describe" })) as {
    setupToken: string;
  };
  expect(
    await f.request(context, {
      ...start,
      setupToken: description.setupToken,
      handles: [randomUUID(), f.panes[0]!.handle],
    }),
  ).toMatchObject({ ok: false });
  expect(f.lease()).toBeUndefined();
  f.dispose();
});
