import { EventEmitter } from "node:events";
import type { BrowserWindow } from "electron";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { registerSemanticInputIpc } from "../../src/main/semantic-input-ipc";
import {
  isSelectionRevision,
  isSemanticInputCommand,
  isSemanticInputReply,
  isSemanticInputRequest,
  semanticInputIpc,
  type SemanticInputCommand,
  type SemanticInputRequest,
} from "../../src/shared/semantic-input";
import {
  MAX_SNIPPET_BODY_LENGTH,
  MAX_SNIPPET_DESCRIPTION_LENGTH,
  MAX_SNIPPET_NAME_LENGTH,
} from "../../src/shared/terminal-snippets";
import { createIpcHarness } from "../fixtures/terminal-ipc-harness";

const token = "00000000-0000-0000-0000-000000000001";
const input: SemanticInputRequest = {
  operation: "terminal.semanticInput.v1",
  text: "  printf '%s' '$literal'\n\t",
  title: "Literal example",
  intent: "insert",
  preview: true,
};
type Service = ReturnType<typeof registerSemanticInputIpc>;
type Admit = Parameters<Service["request"]>[4];
const services: Service[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  for (const service of services.splice(0)) service.dispose();
  vi.useRealTimers();
});

function fixture() {
  const ipc = createIpcHarness();
  let quitting = false;
  const service = registerSemanticInputIpc({
    ipc: ipc.ipcMain,
    trusted: (event) => event.senderFrame === event.sender.mainFrame,
    quitting: () => quitting,
  });
  services.push(service);
  function owner() {
    const contents = Object.assign(new EventEmitter(), {
      mainFrame: {},
      isDestroyed: vi.fn(() => false),
      send: vi.fn((_channel: string, _command: SemanticInputCommand) => {}),
    });
    const native = Object.assign(new EventEmitter(), { webContents: contents });
    const window = native as unknown as BrowserWindow;
    const event = { sender: contents, senderFrame: contents.mainFrame };
    let visible = true;
    const source = { id: token, isCurrentVisible: () => visible };
    const abort = new AbortController();
    const admit = vi.fn<Admit>(async (_signal, commit) => commit());
    service.register(window);
    const selection = (revision: unknown) =>
      ipc.listeners.get(semanticInputIpc.selection)!(event, revision);
    const reply = (value: unknown) =>
      ipc.listeners.get(semanticInputIpc.reply)!(event, value);
    return {
      contents,
      native,
      window,
      event,
      source,
      abort,
      admit,
      selection,
      reply,
      hide() {
        visible = false;
      },
      request: (admission: Admit = admit, request = input) =>
        service.request(window, request, source, abort.signal, admission),
      command() {
        const command = contents.send.mock.calls.at(-1)![1];
        expect(command.kind).toBe("request");
        if (command.kind !== "request") throw new Error("Expected request");
        return command;
      },
    };
  }
  return {
    ipc,
    service,
    owner,
    quit() {
      quitting = true;
    },
  };
}

it.each(["insert", "run"] as const)(
  "sends exact %s input once and resolves only the matching renderer completion",
  async (intent) => {
    const test = fixture();
    const owner = test.owner();
    owner.selection(7);
    const request = { ...input, intent };
    const pending = owner.request(undefined, request);
    const settled = vi.fn();
    void pending.then(settled);
    await Promise.resolve();
    const command = owner.command();
    expect(owner.contents.send).toHaveBeenCalledExactlyOnceWith(
      semanticInputIpc.command,
      {
        kind: "request",
        id: command.id,
        source: token,
        revision: 7,
        input: request,
      },
    );
    expect(isSemanticInputCommand(command)).toBe(true);
    expect(owner.admit).toHaveBeenCalledWith(
      owner.abort.signal,
      expect.any(Function),
    );
    owner.reply({ kind: "started", id: command.id });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(settled).not.toHaveBeenCalled();
    owner.reply({ kind: "finished", id: command.id, available: true });
    await expect(pending).resolves.toEqual({ ok: true });
    owner.reply({ kind: "finished", id: command.id, available: false });
    owner.abort.abort();
    expect(owner.contents.send).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  },
);

it("accepts only trusted monotonic selection revisions", async () => {
  const test = fixture();
  const owner = test.owner();
  const select = test.ipc.listeners.get(semanticInputIpc.selection)!;
  select({ ...owner.event, senderFrame: {} }, 9);
  for (const revision of [
    -1,
    0.5,
    NaN,
    Infinity,
    "1",
    Number.MAX_SAFE_INTEGER + 1,
  ])
    owner.selection(revision);
  await expect(owner.request()).rejects.toThrow("Semantic input unavailable");
  owner.selection(0);
  owner.selection(4);
  owner.selection(4);
  owner.selection(3);
  select({ ...owner.event, senderFrame: {} }, 10);
  const pending = owner.request();
  await Promise.resolve();
  expect(owner.command().revision).toBe(4);
  owner.reply({ kind: "finished", id: owner.command().id, available: false });
  await expect(pending).resolves.toEqual({ ok: false });
});

it.each(["selection", "hidden", "abort", "quit", "retired"] as const)(
  "captures before async admission and refuses %s before commit without sending",
  async (change) => {
    const test = fixture();
    const owner = test.owner();
    owner.selection(1);
    let commit!: () => void;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending = owner.request(async (_signal, send) => {
      commit = send;
      await gate;
      send();
    });
    const rejected = expect(pending).rejects.toThrow(
      "Semantic input unavailable",
    );
    await Promise.resolve();
    if (change === "selection") owner.selection(2);
    if (change === "hidden") owner.hide();
    if (change === "abort") owner.abort.abort();
    if (change === "quit") test.quit();
    if (change === "retired") owner.native.emit("closed");
    release();
    await rejected;
    expect(commit).toThrow("Semantic input unavailable");
    expect(owner.contents.send).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  },
);

it.each(["hidden", "aborted", "quitting", "unregistered", "invalid"] as const)(
  "rejects %s at entry without invoking admission",
  async (mode) => {
    const test = fixture();
    const owner = test.owner();
    owner.selection(1);
    if (mode === "hidden") owner.hide();
    if (mode === "aborted") owner.abort.abort();
    if (mode === "quitting") test.quit();
    if (mode === "unregistered") owner.native.emit("closed");
    await expect(
      owner.request(
        undefined,
        mode === "invalid" ? { ...input, text: "" } : input,
      ),
    ).rejects.toThrow("Semantic input unavailable");
    expect(owner.admit).not.toHaveBeenCalled();
    expect(owner.contents.send).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  },
);

it("allows one pending request per window, independently of another window", async () => {
  const test = fixture();
  const first = test.owner();
  const second = test.owner();
  first.selection(1);
  second.selection(2);
  const a = first.request();
  await expect(first.request()).rejects.toThrow("Semantic input unavailable");
  const b = second.request();
  await Promise.resolve();
  first.reply({ kind: "started", id: first.command().id });
  await expect(first.request()).rejects.toThrow("Semantic input unavailable");
  second.reply({ kind: "finished", id: second.command().id, available: true });
  first.reply({ kind: "finished", id: first.command().id, available: false });
  await expect(a).resolves.toEqual({ ok: false });
  await expect(b).resolves.toEqual({ ok: true });
  const next = first.request();
  await Promise.resolve();
  first.reply({ kind: "finished", id: first.command().id, available: true });
  await expect(next).resolves.toEqual({ ok: true });
});

it("ignores foreign, untrusted, malformed, unknown and stale replies", async () => {
  const test = fixture();
  const owner = test.owner();
  const foreign = test.owner();
  owner.selection(1);
  const old = owner.request();
  await Promise.resolve();
  const oldId = owner.command().id;
  owner.reply({ kind: "finished", id: oldId, available: true });
  await old;
  const pending = owner.request();
  const rejected = expect(pending).rejects.toThrow(
    "Semantic input unavailable",
  );
  await Promise.resolve();
  const id = owner.command().id;
  const reply = test.ipc.listeners.get(semanticInputIpc.reply)!;
  for (const value of [
    { kind: "started", id },
    { kind: "finished", id, available: true },
  ]) {
    foreign.reply(value);
    reply({ ...owner.event, senderFrame: {} }, value);
    reply(
      {
        sender: { mainFrame: foreign.contents.mainFrame },
        senderFrame: foreign.contents.mainFrame,
      },
      value,
    );
    owner.reply({ ...value, id: oldId });
    owner.reply({ ...value, id: token });
    owner.reply({ ...value, extra: true });
  }
  owner.reply({ kind: "finished", id, available: "true" });
  await vi.advanceTimersByTimeAsync(4999);
  expect(owner.contents.send).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  await rejected;
  expect(owner.contents.send).toHaveBeenLastCalledWith(
    semanticInputIpc.command,
    { kind: "revoke", id },
  );
  const retry = owner.request();
  await Promise.resolve();
  owner.reply({ kind: "finished", id: owner.command().id, available: true });
  await expect(retry).resolves.toEqual({ ok: true });
});

it("bounds a stalled admission and makes a late commit inert", async () => {
  const test = fixture();
  const owner = test.owner();
  owner.selection(1);
  let commit!: () => void;
  const pending = owner.request(async (_signal, send) => {
    commit = send;
  });
  const rejected = expect(pending).rejects.toThrow(
    "Semantic input unavailable",
  );
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(5000);
  await rejected;
  expect(commit).toThrow();
  expect(owner.contents.send).not.toHaveBeenCalled();
  const next = owner.request();
  await Promise.resolve();
  owner.reply({ kind: "finished", id: owner.command().id, available: true });
  await expect(next).resolves.toEqual({ ok: true });
});

it("does not replay if admission tries to commit twice", async () => {
  const test = fixture();
  const owner = test.owner();
  owner.selection(1);
  const pending = owner.request(async (_signal, commit) => {
    commit();
    expect(commit).toThrow("Semantic input unavailable");
  });
  await Promise.resolve();
  owner.reply({ kind: "finished", id: owner.command().id, available: true });
  await expect(pending).resolves.toEqual({ ok: true });
  expect(owner.contents.send).toHaveBeenCalledTimes(1);
});

it.each([
  "abort",
  "closed",
  "destroyed",
  "render-process-gone",
  "navigation",
  "dispose",
] as const)(
  "revokes a sent preview on %s and clears pending ownership",
  async (mode) => {
    const test = fixture();
    const owner = test.owner();
    owner.selection(1);
    const pending = owner.request();
    const rejected = expect(pending).rejects.toThrow(
      "Semantic input unavailable",
    );
    await Promise.resolve();
    const id = owner.command().id;
    owner.reply({ kind: "started", id });
    if (mode === "abort") owner.abort.abort();
    else if (mode === "closed") owner.native.emit("closed");
    else if (mode === "dispose") test.service.dispose();
    else if (mode === "navigation")
      owner.contents.emit(
        "did-start-navigation",
        {},
        "https://example.invalid",
        false,
        true,
      );
    else owner.contents.emit(mode);
    await rejected;
    expect(owner.contents.send).toHaveBeenLastCalledWith(
      semanticInputIpc.command,
      { kind: "revoke", id },
    );
    expect(owner.contents.send).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
    owner.native.emit("closed");
    owner.contents.emit("destroyed");
    test.service.dispose();
    expect(owner.contents.send).toHaveBeenCalledTimes(2);
    expect(owner.native.listenerCount("closed")).toBe(0);
    for (const event of [
      "destroyed",
      "render-process-gone",
      "did-start-navigation",
    ])
      expect(owner.contents.listenerCount(event)).toBe(0);
    expect(test.ipc.listeners.size).toBe(0);
  },
);

it("does not retire on subframe or in-place navigation", async () => {
  const test = fixture();
  const owner = test.owner();
  test.service.register(owner.window);
  expect(owner.native.listenerCount("closed")).toBe(1);
  owner.selection(1);
  const pending = owner.request();
  await Promise.resolve();
  owner.contents.emit(
    "did-start-navigation",
    {},
    "https://example.invalid",
    false,
    false,
  );
  owner.contents.emit(
    "did-start-navigation",
    {},
    "https://example.invalid/#fragment",
    true,
    true,
  );
  owner.reply({ kind: "finished", id: owner.command().id, available: true });
  await expect(pending).resolves.toEqual({ ok: true });
  expect(owner.contents.send).toHaveBeenCalledTimes(1);
});

it.each(["admission", "send", "revoke"] as const)(
  "cleans up after a throwing %s without leaking pending state",
  async (mode) => {
    const test = fixture();
    const owner = test.owner();
    owner.selection(1);
    if (mode === "send")
      owner.contents.send.mockImplementationOnce(() => {
        throw new Error("Lost renderer");
      });
    const pending = owner.request(
      mode === "admission"
        ? async () => {
            throw new Error("Admission refused");
          }
        : undefined,
    );
    const rejected = expect(pending).rejects.toThrow(
      "Semantic input unavailable",
    );
    await Promise.resolve();
    if (mode === "revoke") {
      owner.contents.send.mockImplementationOnce(() => {
        throw new Error("Lost renderer");
      });
      owner.abort.abort();
    }
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
    const next = test.service.request(
      owner.window,
      input,
      owner.source,
      new AbortController().signal,
      owner.admit,
    );
    await Promise.resolve();
    owner.reply({ kind: "finished", id: owner.command().id, available: true });
    await expect(next).resolves.toEqual({ ok: true });
  },
);

it("does not access a retired window getter or send to destroyed contents", async () => {
  const test = fixture();
  const owner = test.owner();
  owner.selection(1);
  const pending = owner.request();
  const rejected = expect(pending).rejects.toThrow();
  await Promise.resolve();
  const getter = vi.fn(() => {
    throw new Error("Object has been destroyed");
  });
  Object.defineProperty(owner.window, "webContents", { get: getter });
  owner.contents.isDestroyed.mockReturnValue(true);
  expect(() => owner.contents.emit("destroyed")).not.toThrow();
  await rejected;
  expect(() => owner.native.emit("closed")).not.toThrow();
  expect(getter).not.toHaveBeenCalled();
  expect(owner.contents.send).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("validates bounded literal input, exact keys, intent and preview", () => {
  expect(isSemanticInputRequest(input)).toBe(true);
  expect(
    isSemanticInputRequest({
      ...input,
      intent: "run",
      preview: false,
      description: "",
    }),
  ).toBe(true);
  expect(
    isSemanticInputRequest({
      ...input,
      text: "x".repeat(MAX_SNIPPET_BODY_LENGTH),
      title: "x".repeat(MAX_SNIPPET_NAME_LENGTH),
      description: "x".repeat(MAX_SNIPPET_DESCRIPTION_LENGTH),
    }),
  ).toBe(true);
  for (const value of [
    null,
    [],
    {},
    { ...input, extra: true },
    { ...input, operation: "terminal.write" },
    { ...input, text: "" },
    { ...input, text: 1 },
    { ...input, text: "x".repeat(MAX_SNIPPET_BODY_LENGTH + 1) },
    { ...input, title: "" },
    { ...input, title: "x".repeat(MAX_SNIPPET_NAME_LENGTH + 1) },
    { ...input, description: null },
    { ...input, description: "x".repeat(MAX_SNIPPET_DESCRIPTION_LENGTH + 1) },
    { ...input, intent: "paste" },
    { ...input, preview: "true" },
  ])
    expect(isSemanticInputRequest(value)).toBe(false);
  for (const key of Object.keys(input)) {
    const missing = { ...input } as Record<string, unknown>;
    delete missing[key];
    expect(isSemanticInputRequest(missing)).toBe(false);
  }
});

it("validates selection and exact request/revoke/started/finished envelopes", () => {
  expect(isSelectionRevision(0)).toBe(true);
  expect(isSelectionRevision(Number.MAX_SAFE_INTEGER)).toBe(true);
  const command = {
    kind: "request",
    id: token,
    source: token,
    revision: 1,
    input,
  };
  expect(isSemanticInputCommand(command)).toBe(true);
  expect(isSemanticInputCommand({ kind: "revoke", id: token })).toBe(true);
  for (const value of [
    null,
    { ...command, extra: 1 },
    { ...command, revision: -1 },
    { ...command, source: "" },
    { ...command, id: "" },
    { ...command, input: { ...input, intent: "write" } },
    { kind: "revoke", id: token, input },
  ])
    expect(isSemanticInputCommand(value)).toBe(false);
  expect(isSemanticInputReply({ kind: "started", id: token })).toBe(true);
  expect(
    isSemanticInputReply({ kind: "finished", id: token, available: false }),
  ).toBe(true);
  for (const value of [
    null,
    { kind: "started", id: "" },
    { kind: "started", id: token, available: true },
    { kind: "finished", id: token },
    { kind: "finished", id: token, available: 1 },
    { kind: "finished", id: token, available: true, extra: 1 },
  ])
    expect(isSemanticInputReply(value)).toBe(false);
});
