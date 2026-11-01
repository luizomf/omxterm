import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { startInsertDiagnostic } =
  require("../fixtures/snippets-insert-diagnostic.cjs") as typeof import("../fixtures/snippets-insert-diagnostic.cjs");

it("retains selected PTY writes and the semantic request outcome without changing it", async () => {
  const app = new EventEmitter();
  const ipcMain = new EventEmitter();
  const pty = { pid: 42, writes: ["before"], output: "ready", exited: false };
  const ptys = [pty];
  const diagnostic = startInsertDiagnostic({ app, ipcMain, ptys });
  let handler: (...args: unknown[]) => Promise<unknown> = async () => undefined;
  const scoped = {
    handle(_channel: string, next: typeof handler) {
      handler = next;
    },
  };
  app.emit("web-contents-created", {}, { id: 12, ipc: scoped });
  const response = Promise.resolve({ ok: true });
  scoped.handle("extension-view:request", () => response);
  diagnostic.checkpoint({
    session: pty,
    expected: "  SNIPPETS_INSERT  ",
    viewId: 12,
    coreId: 10,
  });
  const result = handler(
    { sender: { id: 12 } },
    {
      operation: "terminal.semanticInput.v1",
      text: "  SNIPPETS_INSERT  ",
      intent: "insert",
      preview: false,
    },
  );
  expect(result).toBe(response);
  ipcMain.emit(
    "terminal:semantic-reply",
    { sender: { id: 10 } },
    { kind: "started", id: "fixture-request" },
  );
  pty.writes.push("  SNIPPETS_INSERT  ");
  await result;
  const snapshot = diagnostic.snapshot();
  expect(snapshot.selectedIndex).toBe(0);
  expect(snapshot.observedHandlerIds).toContain(12);
  expect(snapshot.sessions[0]!.writes).toEqual(["  SNIPPETS_INSERT  "]);
  expect(snapshot.events.map((event: { kind: string }) => event.kind)).toEqual([
    "request",
    "reply-started",
    "request-resolved",
  ]);
  diagnostic.dispose();
});

it("attributes overlapping and out-of-order outcomes to the original sender and request", async () => {
  const app = new EventEmitter();
  const ipcMain = new EventEmitter();
  const pty = { pid: 42, writes: [] as string[], output: "", exited: false };
  const diagnostic = startInsertDiagnostic({ app, ipcMain, ptys: [pty] });
  const handlers = new Map<number, (...args: unknown[]) => unknown>();
  let resolveFirst!: (value: { ok: boolean }) => void;
  let rejectSecond!: (reason: Error) => void;
  const first = new Promise<{ ok: boolean }>((resolve) => {
    resolveFirst = resolve;
  });
  const second = new Promise<never>((_resolve, reject) => {
    rejectSecond = reject;
  });
  const synchronousError = new Error("synchronous failure");
  for (const id of [11, 12]) {
    const scoped = {
      handle(_channel: string, handler: (...args: unknown[]) => unknown) {
        handlers.set(id, handler);
      },
    };
    app.emit("web-contents-created", {}, { id, ipc: scoped });
    scoped.handle("extension-view:request", (_event, value) => {
      if ((value as { text: string }).text === "throw") throw synchronousError;
      return id === 11 ? first : second;
    });
  }
  diagnostic.checkpoint({
    session: pty,
    expected: "x",
    viewId: 11,
    coreId: 10,
  });
  const invoke = (id: number, text: string) =>
    handlers.get(id)!(
      { sender: { id } },
      {
        operation: "terminal.semanticInput.v1",
        text,
        intent: "insert",
        preview: false,
      },
    );
  expect(invoke(11, "first")).toBe(first);
  expect(invoke(12, "second")).toBe(second);
  let observedThrow: unknown;
  try {
    invoke(11, "throw");
  } catch (error) {
    observedThrow = error;
  }
  expect(observedThrow).toBe(synchronousError);
  const rejected = new Error("asynchronous rejection");
  rejectSecond(rejected);
  resolveFirst({ ok: true });
  await expect(second).rejects.toBe(rejected);
  await first;
  expect(
    diagnostic.snapshot().events.map((event) => {
      const row = event as {
        kind: string;
        senderId?: number | null;
        requestId?: number;
        ok?: boolean;
      };
      return {
        kind: row.kind,
        senderId: row.senderId,
        requestId: row.requestId,
        ...(row.ok === undefined ? {} : { ok: row.ok }),
      };
    }),
  ).toEqual([
    { kind: "request", senderId: 11, requestId: 1 },
    { kind: "request", senderId: 12, requestId: 2 },
    { kind: "request", senderId: 11, requestId: 3 },
    { kind: "request-threw", senderId: 11, requestId: 3 },
    { kind: "request-rejected", senderId: 12, requestId: 2 },
    { kind: "request-resolved", senderId: 11, requestId: 1, ok: true },
  ]);
  diagnostic.dispose();
});

it("preserves rejection, observes unavailable hooks, and restores the original IPC handler", async () => {
  const app = new EventEmitter();
  const ipcMain = new EventEmitter();
  const pty = { pid: 42, writes: [] as string[], output: "", exited: false };
  const diagnostic = startInsertDiagnostic({ app, ipcMain, ptys: [pty] });
  let handler: (...args: unknown[]) => unknown = () => undefined;
  const scoped = {
    handle(_channel: string, next: typeof handler) {
      handler = next;
    },
  };
  const original = scoped.handle;
  app.emit("web-contents-created", {}, { id: 12, ipc: scoped });
  app.emit("web-contents-created", {}, { id: 99 });
  const failure = new Error("refused");
  const rejected = Promise.reject(failure);
  scoped.handle("extension-view:request", () => rejected);
  diagnostic.checkpoint({
    session: pty,
    expected: "x",
    viewId: 12,
    coreId: 10,
  });
  const returned = handler(
    { sender: { id: 12 } },
    {
      operation: "terminal.semanticInput.v1",
      text: "x",
      intent: "insert",
      preview: false,
    },
  );
  expect(returned).toBe(rejected);
  await expect(returned).rejects.toBe(failure);
  const snapshot = diagnostic.snapshot();
  expect(snapshot.events.map((event: { kind: string }) => event.kind)).toEqual([
    "request",
    "request-rejected",
  ]);
  expect(snapshot.observationUnavailable).toBe(true);
  diagnostic.dispose();
  expect(scoped.handle).toBe(original);
  expect(app.listenerCount("web-contents-created")).toBe(0);
  expect(ipcMain.listenerCount("terminal:semantic-reply")).toBe(0);
});

it("bounds local request IDs and does not emit orphan outcomes for pre-checkpoint requests", async () => {
  const app = new EventEmitter();
  const ipcMain = new EventEmitter();
  const pty = { pid: 42, writes: [] as string[], output: "", exited: false };
  const diagnostic = startInsertDiagnostic({ app, ipcMain, ptys: [pty] });
  let handler: (...args: unknown[]) => unknown = () => undefined;
  const scoped = {
    handle(_channel: string, next: typeof handler) {
      handler = next;
    },
  };
  app.emit("web-contents-created", {}, { id: 12, ipc: scoped });
  let resolveBefore!: (value: { ok: boolean }) => void;
  const before = new Promise<{ ok: boolean }>((resolve) => {
    resolveBefore = resolve;
  });
  scoped.handle("extension-view:request", (_event, value) =>
    (value as { text: string }).text === "before" ? before : { ok: true },
  );
  const invoke = (text: string) =>
    handler(
      { sender: { id: 12 } },
      {
        operation: "terminal.semanticInput.v1",
        text,
        intent: "insert",
        preview: false,
      },
    );
  expect(invoke("before")).toBe(before);
  diagnostic.checkpoint({
    session: pty,
    expected: "x",
    viewId: 12,
    coreId: 10,
  });
  resolveBefore({ ok: true });
  await before;
  expect(diagnostic.snapshot().events).toEqual([]);
  for (let index = 0; index < 65; index++)
    expect(invoke("x")).toEqual({ ok: true });
  await Promise.resolve();
  const snapshot = diagnostic.snapshot();
  expect(snapshot.events).toHaveLength(64);
  expect(snapshot.events.map((event) => event.requestId)).toEqual(
    Array.from({ length: 64 }, (_value, index) => index + 1),
  );
  expect(snapshot.events.every((event) => event.senderId === 12)).toBe(true);
  expect(snapshot.eventsTruncated).toBe(true);
  diagnostic.dispose();
});

it("bounds raw write and event evidence and labels truncation", () => {
  const app = new EventEmitter();
  const ipcMain = new EventEmitter();
  const pty = {
    pid: 42,
    writes: [] as string[],
    output: "o".repeat(5000),
    exited: false,
  };
  const diagnostic = startInsertDiagnostic({ app, ipcMain, ptys: [pty] });
  diagnostic.checkpoint({
    session: pty,
    expected: "x",
    viewId: 12,
    coreId: 10,
  });
  pty.writes.push("x".repeat(16 * 1024 + 1));
  for (let index = 0; index < 65; index++)
    ipcMain.emit(
      "terminal:semantic-reply",
      { sender: { id: 10 } },
      { kind: "started" },
    );
  const snapshot = diagnostic.snapshot();
  expect(snapshot.sessions[0]!.writes).toEqual([]);
  expect(snapshot.sessions[0]!.writesTruncated).toBe(true);
  expect(snapshot.sessions[0]!.outputTail).toHaveLength(4096);
  expect(snapshot.sessions[0]!.outputTailTruncated).toBe(true);
  expect(snapshot.events).toHaveLength(64);
  expect(snapshot.eventsTruncated).toBe(true);
  diagnostic.dispose();
});
