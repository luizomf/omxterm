import { spawn } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, statSync, existsSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentApiError } from "../../src/main/agent-commands";
import {
  AgentEndpointInUseError,
  createAgentEndpoint,
  type AgentEndpointHandlers,
} from "../../src/main/agent-endpoint";
import { agentProofMessage } from "../../src/shared/agent-api";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

// Unix socket paths are short (about 104 bytes on macOS); keep ours small.
function socketPath() {
  const root = mkdtempSync(path.join(os.tmpdir(), "oa-"));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  return path.join(root, "agent-api", "ctl.sock");
}

const token = randomBytes(32);
const INSTANCE = "0123456789abcdef";
const hmac = (key: Buffer, message: string) =>
  createHmac("sha256", key).update(message).digest("hex");

async function endpoint(handlers: Partial<AgentEndpointHandlers> = {}) {
  const file = socketPath();
  const request = vi.fn<AgentEndpointHandlers["request"]>(
    handlers.request ??
      (async (_window, command, _args, caller) => ({
        command,
        self: caller.pane ?? null,
      })),
  );
  const rejected = vi.fn<AgentEndpointHandlers["rejected"]>();
  const server = createAgentEndpoint(file, INSTANCE, {
    token: handlers.token ?? ((window) => (window === 3 ? token : undefined)),
    request,
    rejected,
  });
  await server.listen(vi.fn());
  cleanups.push(() => server.close());
  return { file, server, request, rejected };
}

// A minimal client: line reader plus the handshake.
function connect(file: string) {
  const socket = net.connect(file);
  const lines: unknown[] = [];
  const waiters: ((value: unknown) => void)[] = [];
  let closed = false;
  let buffer = "";
  socket.setEncoding("utf8");
  socket.on("data", (chunk: string) => {
    buffer += chunk;
    for (;;) {
      const end = buffer.indexOf("\n");
      if (end < 0) break;
      const line = JSON.parse(buffer.slice(0, end)) as unknown;
      buffer = buffer.slice(end + 1);
      const waiter = waiters.shift();
      if (waiter) waiter(line);
      else lines.push(line);
    }
  });
  const closedPromise = new Promise<void>((resolve) =>
    socket.on("close", () => {
      closed = true;
      for (const waiter of waiters.splice(0)) waiter(undefined);
      resolve();
    }),
  );
  socket.on("error", () => {});
  cleanups.push(() => socket.destroy());
  const next = () =>
    lines.length
      ? Promise.resolve(lines.shift())
      : closed
        ? Promise.resolve(undefined)
        : new Promise<unknown>((resolve) => waiters.push(resolve));
  const send = (value: unknown) => socket.write(`${JSON.stringify(value)}\n`);
  return {
    socket,
    next,
    send,
    closed: closedPromise,
    async handshake(
      window = 3,
      key = token,
      pane?: string,
      instance = INSTANCE,
    ) {
      const nonce = randomBytes(32).toString("hex");
      send({ hello: 1, instance, window, nonce, ...(pane ? { pane } : {}) });
      const hello = (await next()) as
        { nonce: string; proof: string } | undefined;
      if (!hello) return { hello, ready: undefined };
      send({
        proof: hmac(key, agentProofMessage("client", nonce, hello.nonce)),
      });
      return {
        hello,
        serverProofValid:
          hello.proof ===
          hmac(token, agentProofMessage("server", nonce, hello.nonce)),
        ready: await next(),
      };
    },
  };
}

// Unix sockets; the Windows named pipe is a later slice (ADR 0052).
describe.skipIf(process.platform === "win32")("agent endpoint", () => {
  it("listens on a user-only socket and removes it when closed", async () => {
    const { file, server } = await endpoint();
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(path.dirname(file)).mode & 0o777).toBe(0o700);
    server.close();
    expect(existsSync(file)).toBe(false);
  });

  it("proves itself, binds the connection to its window and answers by id", async () => {
    const { file, request } = await endpoint();
    const client = connect(file);
    const { serverProofValid, ready } = await client.handshake(3, token, "s4");
    expect(serverProofValid).toBe(true);
    expect(ready).toEqual({ ok: true, window: 3, protocol: 1 });
    client.send({ id: 7, cmd: "list" });
    client.send({ id: "x", cmd: "format-disk" });
    // Answers overlap; each carries its request's id.
    const answers = [await client.next(), await client.next()];
    expect(answers).toContainEqual({
      id: 7,
      ok: true,
      result: { command: "list", self: "s4" },
    });
    expect(answers).toContainEqual({
      id: "x",
      ok: false,
      error: {
        code: "invalid-request",
        message: "Expected {id, cmd, args} with a known command.",
      },
    });
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]?.[0]).toBe(3);
  });

  it("closes without detail on a wrong proof, an unknown window or a long line", async () => {
    const { file, request, rejected } = await endpoint();
    const wrong = connect(file);
    const attempt = await wrong.handshake(3, randomBytes(32));
    expect(attempt.ready).toBeUndefined();
    await wrong.closed;

    const unknown = connect(file);
    expect((await unknown.handshake(4)).hello).toBeUndefined();
    await unknown.closed;

    // The same window id in another OMXTerm process isn't this one.
    const elsewhere = connect(file);
    const other = await elsewhere.handshake(
      3,
      token,
      undefined,
      "fedcba9876543210",
    );
    expect(other.hello).toBeUndefined();
    await elsewhere.closed;

    const long = connect(file);
    long.socket.write("x".repeat(4096));
    await long.closed;

    expect(request).not.toHaveBeenCalled();
    expect(rejected.mock.calls.map((call) => call[0])).toEqual([
      "untrusted-sender",
      "untrusted-sender",
      "untrusted-sender",
      "invalid-payload",
    ]);
  });

  it("answers in-flight requests with revoked and ends the grant's connections", async () => {
    let started!: () => void;
    const begun = new Promise<void>((resolve) => (started = resolve));
    const { file, server } = await endpoint({
      request: () => {
        started();
        return new Promise(() => {});
      },
    });
    const client = connect(file);
    await client.handshake();
    client.send({ id: 1, cmd: "wait", args: { pane: "s1", timeoutMs: 1000 } });
    await begun;
    server.revoke(3);
    expect(await client.next()).toMatchObject({
      id: 1,
      ok: false,
      error: { code: "revoked" },
    });
    await client.closed;
  });

  it("turns command errors into codes and never leaks other failures", async () => {
    const { file } = await endpoint({
      request: async (_window, command) => {
        if (command === "send") throw new AgentApiError("not-live", "Ended.");
        throw new Error("/private/path secret");
      },
    });
    const client = connect(file);
    await client.handshake();
    client.send({ id: 1, cmd: "send", args: {} });
    client.send({ id: 2, cmd: "read", args: {} });
    expect(await client.next()).toEqual({
      id: 1,
      ok: false,
      error: { code: "not-live", message: "Ended." },
    });
    expect(await client.next()).toEqual({
      id: 2,
      ok: false,
      error: { code: "unavailable", message: "The window couldn't answer." },
    });
  });

  it("refuses a socket another live process holds and replaces a stale one", async () => {
    const { file, server } = await endpoint();
    const second = createAgentEndpoint(file, INSTANCE, {
      token: () => undefined,
      request: vi.fn(),
      rejected: vi.fn(),
    });
    await expect(second.listen(vi.fn())).rejects.toBeInstanceOf(
      AgentEndpointInUseError,
    );
    expect(server.isListening()).toBe(true);

    // A killed run leaves a socket file nobody answers on.
    server.close();
    const crashed = spawn(
      process.execPath,
      [
        "-e",
        "require('node:net').createServer().listen(process.argv[1], () => console.log('up'))",
        file,
      ],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    await new Promise((resolve) => crashed.stdout.once("data", resolve));
    crashed.kill("SIGKILL");
    await new Promise((resolve) => crashed.once("exit", resolve));
    expect(existsSync(file)).toBe(true);
    await second.listen(vi.fn());
    expect(second.isListening()).toBe(true);
    second.close();
  });
});
