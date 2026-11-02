type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const boundedString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 8192;

// This gate owns only the inspector-induced startup pause, not PTY readiness or
// worker/thread settlement. All errors are retained for finish and snapshot.
export function createWindowsInspectorWorkers(
  expectedWorkerUrl: string,
  rootRequest: (
    method: string,
    params: object,
    timeout?: number,
  ) => Promise<unknown>,
) {
  let identity:
    { sessionId: string; workerId: string; url: string } | undefined;
  let error: string | undefined;
  let failureCause: unknown;
  let complete = false;
  let detached = false;
  let paused = false;
  let stage = 0;
  const scripts = new Set<string>();
  const trace: string[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: { id: number; ack: boolean; reply: boolean } | undefined;
  const waiters = new Set<() => void>();
  const note = (event: string) => {
    if (trace.length < 64) trace.push(event);
  };
  const wake = () => {
    for (const resolve of waiters) resolve();
    waiters.clear();
  };
  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const fail = (message: string, cause?: unknown) => {
    if (!error) {
      error = message;
      failureCause = cause;
      note(`error: ${message}`);
    }
    clear();
    wake();
  };
  const deadline = (label: string) => {
    clear();
    timer = setTimeout(() => fail(`${label} deadline`), 5000);
  };
  const send = (id: number, method: string) => {
    if (error || !identity) return;
    stage = id;
    pending = { id, ack: false, reply: false };
    note(`send ${method}`);
    deadline(method);
    try {
      const request = rootRequest(
        "NodeWorker.sendMessageToWorker",
        {
          sessionId: identity.sessionId,
          message: JSON.stringify({ id, method }),
        },
        5000,
      );
      void Promise.resolve(request).then(
        () => {
          if (error || pending?.id !== id) return;
          pending.ack = true;
          advance();
        },
        (cause: unknown) => fail(`Root request failed: ${method}`, cause),
      );
    } catch (cause) {
      fail(`Root request failed: ${method}`, cause);
    }
  };
  const advance = () => {
    if (error || !pending?.ack || !pending.reply) return;
    const id = pending.id;
    pending = undefined;
    clear();
    if (id === 1) send(2, "Runtime.runIfWaitingForDebugger");
    else if (id === 2) {
      if (paused) send(3, "Debugger.resume");
      else deadline("Worker startup pause");
    } else {
      complete = true;
      note("startup resumed");
      wake();
    }
  };
  const attach = (params: RecordValue & { sessionId: string }) => {
    if (identity) return fail("Duplicate worker");
    const info = params.workerInfo;
    if (
      !record(info) ||
      !boundedString(info.workerId) ||
      !boundedString(info.url) ||
      !boundedString(info.type) ||
      !boundedString(info.title) ||
      params.waitingForDebugger !== true
    )
      return fail("Malformed worker attachment");
    identity = {
      sessionId: params.sessionId,
      workerId: info.workerId,
      url: info.url,
    };
    if (info.url !== expectedWorkerUrl || info.type !== "worker")
      return fail("Unexpected worker identity");
    note("worker attached");
    send(1, "Debugger.enable");
  };
  const workerMessage = (value: unknown) => {
    if (
      typeof value !== "string" ||
      Buffer.byteLength(value, "utf8") > 1024 * 1024
    )
      return fail("Malformed or oversized worker message");
    let message: unknown;
    try {
      message = JSON.parse(value);
    } catch {
      return fail("Malformed worker JSON");
    }
    if (!record(message)) return fail("Malformed worker message");
    if ("id" in message) {
      if (
        !Number.isSafeInteger(message.id) ||
        !pending ||
        message.id !== pending.id ||
        pending.reply
      )
        return fail("Unexpected worker response");
      if ("error" in message || !record(message.result))
        return fail("Worker method failed or malformed response");
      pending.reply = true;
      note(`worker response ${pending.id}`);
      advance();
      return;
    }
    if (!boundedString(message.method) || !record(message.params))
      return fail("Malformed worker event");
    workerEvent(message.method, message.params);
  };
  const workerEvent = (method: string, params: RecordValue) => {
    if (method === "Debugger.scriptParsed") {
      if (
        !boundedString(params.scriptId) ||
        typeof params.url !== "string" ||
        params.url.length > 8192
      )
        return fail("Malformed worker script");
      if (params.url === expectedWorkerUrl) {
        if (!scripts.has(params.scriptId) && scripts.size >= 32)
          return fail("Too many matching worker scripts");
        scripts.add(params.scriptId);
      } else if (scripts.has(params.scriptId))
        return fail("Conflicting worker script identity");
    } else if (method === "Debugger.paused") {
      const frames: unknown = params.callFrames;
      const top: unknown = Array.isArray(frames) ? frames[0] : undefined;
      if (
        paused ||
        stage !== 2 ||
        params.reason !== "Break on start" ||
        !Array.isArray(params.hitBreakpoints) ||
        params.hitBreakpoints.length !== 0 ||
        !record(top) ||
        !record(top.location) ||
        !boundedString(top.location.scriptId) ||
        !scripts.has(top.location.scriptId)
      )
        return fail("Unexpected worker pause");
      paused = true;
      note("expected startup pause");
      if (!pending) {
        clear();
        send(3, "Debugger.resume");
      }
    }
  };
  const notification = (method: string, params: unknown) => {
    if (
      ![
        "NodeWorker.attachedToWorker",
        "NodeWorker.receivedMessageFromWorker",
        "NodeWorker.detachedFromWorker",
      ].includes(method)
    )
      return;
    if (error) return;
    if (!record(params) || !boundedString(params.sessionId))
      return fail("Malformed worker notification");
    if (method === "NodeWorker.attachedToWorker")
      return attach({ ...params, sessionId: params.sessionId });
    if (!identity || params.sessionId !== identity.sessionId)
      return fail("Unexpected worker session");
    if (method === "NodeWorker.detachedFromWorker") {
      if (detached) return fail("Duplicate worker detach");
      detached = true;
      note("worker detached");
      if (!complete) fail("Worker detached before startup resume completed");
      return;
    }
    if (detached) return fail("Message after worker detach");
    workerMessage(params.message);
  };
  return {
    notification,
    async finish() {
      if (!identity && !error) fail("Expected worker was not admitted");
      while (!error && !complete)
        await new Promise<void>((resolve) => waiters.add(resolve));
      if (error) throw new Error(error, { cause: failureCause });
    },
    snapshot() {
      return {
        identity: identity ? { ...identity } : null,
        stage,
        paused,
        complete,
        detached,
        error: error ?? null,
        trace: [...trace],
      };
    },
  };
}
