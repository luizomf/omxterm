import { expect, it, vi } from "vitest";
import { createWindowsInspectorWorkers } from "../fixtures/snippets-windows-inspector-workers";

const url =
  "file:///app.asar/node_modules/node-pty/lib/worker/conoutSocketWorker.js";

function harness() {
  const requests: Array<{ id: number; method: string }> = [];
  const root = vi.fn(async (_method: string, params: object) => {
    requests.push(
      JSON.parse((params as { message: string }).message) as {
        id: number;
        method: string;
      },
    );
    return {};
  });
  const gate = createWindowsInspectorWorkers(url, root);
  const attach = (workerUrl = url, sessionId = "1") =>
    gate.notification("NodeWorker.attachedToWorker", {
      sessionId,
      workerInfo: {
        workerId: "1",
        type: "worker",
        title: "[worker1]WorkerThread",
        url: workerUrl,
      },
      waitingForDebugger: true,
    });
  const message = (value: unknown, sessionId = "1") =>
    gate.notification("NodeWorker.receivedMessageFromWorker", {
      sessionId,
      message: JSON.stringify(value),
    });
  const reply = (id: number) => message({ id, result: {} });
  const script = () =>
    message({
      method: "Debugger.scriptParsed",
      params: { scriptId: "42", url },
    });
  const pause = (scriptId = "42") =>
    message({
      method: "Debugger.paused",
      params: {
        reason: "Break on start",
        hitBreakpoints: [],
        callFrames: [{ location: { scriptId } }],
      },
    });
  return { gate, requests, root, attach, message, reply, script, pause };
}
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

it("refuses to finish without the expected worker", async () => {
  const gate = createWindowsInspectorWorkers(url, async () => ({}));
  await expect(gate.finish()).rejects.toThrow();
});

it("releases only the expected startup pause after both worker replies", async () => {
  const h = harness();
  h.attach();
  await flush();
  expect(h.requests).toEqual([{ id: 1, method: "Debugger.enable" }]);
  h.reply(1);
  await flush();
  expect(h.requests[1]).toEqual({
    id: 2,
    method: "Runtime.runIfWaitingForDebugger",
  });
  h.script();
  h.pause();
  h.reply(2);
  await flush();
  expect(h.requests[2]).toEqual({ id: 3, method: "Debugger.resume" });
  h.reply(3);
  await h.gate.finish();
  expect(h.requests).toHaveLength(3);
  expect(h.root).toHaveBeenCalledWith(
    "NodeWorker.sendMessageToWorker",
    { sessionId: "1", message: '{"id":3,"method":"Debugger.resume"}' },
    5000,
  );
  h.gate.notification("NodeWorker.detachedFromWorker", { sessionId: "1" });
  expect(h.gate.snapshot()).toMatchObject({
    complete: true,
    detached: true,
    error: null,
  });
});

it("waits for the root acknowledgement even if the worker replies first", async () => {
  let acknowledge: (() => void) | undefined;
  const sent: number[] = [];
  const gate = createWindowsInspectorWorkers(url, (_method, params) => {
    sent.push(
      (JSON.parse((params as { message: string }).message) as { id: number })
        .id,
    );
    return new Promise<void>((resolve) => {
      acknowledge = resolve;
    });
  });
  gate.notification("NodeWorker.attachedToWorker", {
    sessionId: "1",
    workerInfo: { workerId: "1", type: "worker", title: "worker", url },
    waitingForDebugger: true,
  });
  gate.notification("NodeWorker.receivedMessageFromWorker", {
    sessionId: "1",
    message: '{"id":1,"result":{}}',
  });
  expect(sent).toEqual([1]);
  acknowledge?.();
  await flush();
  expect(sent).toEqual([1, 2]);
  gate.notification("NodeWorker.detachedFromWorker", { sessionId: "1" });
  await expect(gate.finish()).rejects.toThrow("detached");
});

it("rejects duplicate workers even after successful completion", async () => {
  const h = harness();
  h.attach();
  h.reply(1);
  await flush();
  h.script();
  h.reply(2);
  await flush();
  h.pause();
  await flush();
  h.reply(3);
  await h.gate.finish();
  h.attach();
  await expect(h.gate.finish()).rejects.toThrow("Duplicate worker");
  expect(h.requests).toHaveLength(3);
});

it("never admits a foreign URL", async () => {
  const h = harness();
  h.attach("file:///other.js");
  await expect(h.gate.finish()).rejects.toThrow("identity");
  expect(h.requests).toEqual([]);
  expect(h.gate.snapshot().complete).toBe(false);
  expect(typeof h.gate.snapshot().error).toBe("string");
});

it("does not treat the root acknowledgement as a worker reply or retry", async () => {
  vi.useFakeTimers();
  try {
    const h = harness();
    h.attach();
    await flush();
    expect(h.requests).toHaveLength(1);
    const result = h.gate.finish();
    const rejected = expect(result).rejects.toThrow("deadline");
    await vi.advanceTimersByTimeAsync(5000);
    await rejected;
    expect(h.requests).toHaveLength(1);
    expect(h.gate.snapshot().complete).toBe(false);
    expect(h.gate.snapshot().error).toContain("deadline");
  } finally {
    vi.useRealTimers();
  }
});

it("rejects a worker error response", async () => {
  const h = harness();
  h.attach();
  h.message({ id: 1, error: { code: -1, message: "failed" } });
  await expect(h.gate.finish()).rejects.toThrow("Worker method failed");
  expect(h.requests).toHaveLength(1);
});

it("refuses a pause in a foreign script", async () => {
  const h = harness();
  h.attach();
  h.reply(1);
  await flush();
  h.script();
  h.pause("foreign");
  await expect(h.gate.finish()).rejects.toThrow("pause");
  expect(h.requests.map((request) => request.method)).not.toContain(
    "Debugger.resume",
  );
});

it("never resumes when a duplicate pause arrives before the run reply", async () => {
  const h = harness();
  h.attach();
  h.reply(1);
  await flush();
  h.script();
  h.pause();
  h.pause();
  h.reply(2);
  await expect(h.gate.finish()).rejects.toThrow("pause");
  await flush();
  expect(h.requests.map((request) => request.method)).not.toContain(
    "Debugger.resume",
  );
});

it("refuses a second or later pause even after a successful resume", async () => {
  const h = harness();
  h.attach();
  h.reply(1);
  await flush();
  h.script();
  h.reply(2);
  await flush();
  h.pause();
  await flush();
  h.reply(3);
  await h.gate.finish();
  h.pause();
  await expect(h.gate.finish()).rejects.toThrow("pause");
  expect(
    h.requests.filter((request) => request.method === "Debugger.resume"),
  ).toHaveLength(1);
});

it.each([
  "duplicate",
  "wrong session",
  "detach",
  "malformed",
  "oversized",
  "truncated",
])("fails closed on %s and never sends another command", async (kind) => {
  const h = harness();
  h.attach();
  if (kind === "duplicate") h.attach();
  if (kind === "wrong session") h.message({ id: 1, result: {} }, "2");
  if (kind === "detach")
    h.gate.notification("NodeWorker.detachedFromWorker", { sessionId: "1" });
  if (kind === "malformed")
    h.gate.notification("NodeWorker.receivedMessageFromWorker", {
      sessionId: "1",
      message: 3,
    });
  if (kind === "oversized")
    h.gate.notification("NodeWorker.receivedMessageFromWorker", {
      sessionId: "1",
      message: "x".repeat(1024 * 1024 + 1),
    });
  if (kind === "truncated")
    h.gate.notification("NodeWorker.receivedMessageFromWorker", {
      sessionId: "1",
      message: '{"id":1',
    });
  h.reply(1);
  await expect(h.gate.finish()).rejects.toThrow();
  await flush();
  expect(h.requests).toHaveLength(1);
  expect(h.gate.snapshot().complete).toBe(false);
  expect(typeof h.gate.snapshot().error).toBe("string");
});

it("propagates a root request failure without an unhandled rejection", async () => {
  const h = harness();
  h.root.mockRejectedValueOnce(new Error("disconnected"));
  h.attach();
  await expect(h.gate.finish()).rejects.toThrow("Root request failed");
  expect(h.root).toHaveBeenCalledTimes(1);
});

it("ignores unrelated root notifications but rejects an unexpected initial pause", async () => {
  const h = harness();
  h.gate.notification("Runtime.consoleAPICalled", null);
  h.attach();
  h.script();
  h.pause();
  await expect(h.gate.finish()).rejects.toThrow("pause");
  expect(h.requests).toHaveLength(1);
});
