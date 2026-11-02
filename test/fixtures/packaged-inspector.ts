import assert from "node:assert/strict";

export async function until(
  check: () => Promise<boolean> | boolean,
  label: string,
  timeout = 20000,
) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out: ${label}`);
}

// Disposable main-process observer only; never a replacement application entry.
export async function inspector(
  url: string,
  onNotification?: (method: string, params: unknown) => void,
) {
  assert.match(url, /^ws:\/\/127\.0\.0\.1:\d+\/[a-f0-9-]+$/);
  const socket = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("Inspector connection deadline"));
    }, 5000);
    socket.addEventListener(
      "open",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
    socket.addEventListener(
      "error",
      () => {
        clearTimeout(timeout);
        reject(new Error("Inspector connection failed"));
      },
      { once: true },
    );
  });
  let sequence = 0;
  const pending = new Map<
    number,
    {
      resolve(value: unknown): void;
      reject(error: Error): void;
    }
  >();
  const pauses: unknown[] = [];
  const scripts = new Map<string, string>();
  let pauseWaiter:
    { resolve(value: unknown): void; reject(error: Error): void } | undefined;
  let closed = false;
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)) as {
      id?: number;
      method?: string;
      params?: unknown;
      error?: unknown;
      result?: { exceptionDetails?: unknown; result?: { value?: unknown } };
    };
    if (message.method) onNotification?.(message.method, message.params);
    if (message.method === "Debugger.scriptParsed") {
      const parsed = message.params as { scriptId?: unknown; url?: unknown };
      if (
        typeof parsed?.scriptId === "string" &&
        typeof parsed.url === "string"
      ) {
        if (!scripts.has(parsed.scriptId) && scripts.size >= 10000) {
          socket.close();
          return;
        }
        scripts.set(parsed.scriptId, parsed.url);
      }
      return;
    }
    if (message.method === "Debugger.paused") {
      if (pauseWaiter) {
        const waiter = pauseWaiter;
        pauseWaiter = undefined;
        waiter.resolve(message.params);
      } else if (pauses.length < 8) pauses.push(message.params);
      else socket.close();
      return;
    }
    if (message.id === undefined) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error || message.result?.exceptionDetails)
      request.reject(
        new Error(
          JSON.stringify(message.error ?? message.result?.exceptionDetails),
        ),
      );
    else request.resolve(message.result);
  });
  socket.addEventListener("close", () => {
    closed = true;
    for (const request of pending.values())
      request.reject(new Error("Inspector closed during request"));
    pending.clear();
    pauseWaiter?.reject(new Error("Inspector closed while awaiting pause"));
    pauseWaiter = undefined;
  });
  const request = (method: string, params: object = {}, timeout = 90000) => {
    const id = ++sequence;
    return new Promise<unknown>((resolve, reject) => {
      if (closed) return reject(new Error("Inspector closed during request"));
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("Inspector request deadline"));
      }, timeout);
      pending.set(id, {
        resolve(value) {
          clearTimeout(timer);
          resolve(value);
        },
        reject(error) {
          clearTimeout(timer);
          reject(error);
        },
      });
      try {
        socket.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        pending.delete(id);
        clearTimeout(timer);
        reject(error);
      }
    });
  };
  return {
    request,
    scriptUrl(id: string) {
      return scripts.get(id);
    },
    nextEvent(method: "Debugger.paused", timeout = 5000) {
      assert.equal(method, "Debugger.paused");
      if (pauses.length) return Promise.resolve(pauses.shift());
      if (closed)
        return Promise.reject(
          new Error("Inspector closed while awaiting pause"),
        );
      assert.equal(pauseWaiter, undefined, "only one pause waiter");
      return new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => {
          pauseWaiter = undefined;
          reject(new Error("Inspector pause deadline"));
        }, timeout);
        pauseWaiter = {
          resolve(value) {
            clearTimeout(timer);
            resolve(value);
          },
          reject(error) {
            clearTimeout(timer);
            reject(error);
          },
        };
      });
    },
    async evaluate(expression: string, timeout = 90000) {
      const result = (await request(
        "Runtime.evaluate",
        {
          expression,
          awaitPromise: true,
          returnByValue: true,
        },
        timeout,
      )) as { result?: { value?: unknown } };
      return result?.result?.value;
    },
    close() {
      socket.close();
    },
  };
}
