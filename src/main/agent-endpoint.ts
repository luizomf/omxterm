import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { unlinkSync } from "node:fs";
import { chmod, lstat, mkdir, unlink } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import {
  AGENT_COMMANDS,
  AGENT_HANDSHAKE_TIMEOUT_MS,
  AGENT_PROTOCOL,
  agentProofMessage,
  hasOnlyKeys,
  isAgentInstance,
  isAgentNonce,
  isAgentPaneId,
  isAgentRequestId,
  isAgentWindowId,
  isPlainRecord,
  MAX_AGENT_HANDSHAKE_BYTES,
  MAX_AGENT_REQUEST_BYTES,
  type AgentCommand,
  type AgentErrorCode,
  type AgentRequestId,
} from "../shared/agent-api";
import { AgentApiError, type AgentCaller } from "./agent-commands";

export const MAX_AGENT_CONNECTIONS_PER_GRANT = 16;
export const MAX_AGENT_PENDING_CONNECTIONS = 8;
export const MAX_AGENT_REQUESTS_PER_CONNECTION = 32;
// A client that stops reading can't make main hold its answers forever.
const MAX_UNREAD_RESPONSE_BYTES = 32 * 1024 * 1024;
const REJECT_DELAY_MS = 200;

/** The longest Unix socket path, NUL excluded (sockaddr_un.sun_path). */
export function maxSocketPathBytes(platform: NodeJS.Platform): number {
  return platform === "darwin" ? 103 : 107;
}

export class AgentEndpointInUseError extends Error {
  constructor() {
    super("Another process holds the agent endpoint");
    this.name = "AgentEndpointInUseError";
  }
}

export interface AgentEndpointHandlers {
  /** The token of an admitted grant, or nothing. */
  token(window: number): Buffer | undefined;
  request(
    window: number,
    command: AgentCommand,
    args: unknown,
    caller: AgentCaller,
  ): Promise<unknown>;
  rejected(reason: "invalid-payload" | "untrusted-sender" | "limit"): void;
}

type Connection = {
  readonly socket: net.Socket;
  stage: "hello" | "proof" | "ready" | "closed";
  window?: number;
  pane?: string;
  clientNonce?: string;
  serverNonce?: string;
  readonly pending: Map<AgentRequestId, AbortController>;
};

const isMissing = (error: unknown) =>
  (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT";

// The directory is the boundary against other users: owned by us, not a link,
// and closed to everyone else.
async function prepareDirectory(directory: string) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await lstat(directory);
  if (
    !stat.isDirectory() ||
    (typeof process.getuid === "function" && stat.uid !== process.getuid())
  )
    throw new Error("The agent directory isn't a private directory");
  await chmod(directory, 0o700);
}

/** True when a live process accepts connections on the socket path. */
export function socketIsLive(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.connect(socketPath);
    const done = (live: boolean) => {
      probe.removeAllListeners();
      probe.on("error", () => {});
      probe.destroy();
      resolve(live);
    };
    probe.once("connect", () => done(true));
    probe.once("error", () => done(false));
    probe.setTimeout(1000, () => done(false));
  });
}

async function removeStaleSocket(socketPath: string) {
  let stat;
  try {
    stat = await lstat(socketPath);
  } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
  if (!stat.isSocket()) throw new Error("The agent socket path isn't a socket");
  if (await socketIsLive(socketPath)) throw new AgentEndpointInUseError();
  try {
    await unlink(socketPath);
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
}

const proof = (token: Buffer, message: string) =>
  createHmac("sha256", token).update(message).digest("hex");

function parseHello(message: unknown) {
  return isPlainRecord(message) &&
    hasOnlyKeys(message, ["hello", "instance", "window", "nonce"], ["pane"]) &&
    message.hello === AGENT_PROTOCOL &&
    isAgentInstance(message.instance) &&
    isAgentWindowId(message.window) &&
    isAgentNonce(message.nonce) &&
    (message.pane === undefined || isAgentPaneId(message.pane))
    ? {
        instance: message.instance,
        window: message.window,
        nonce: message.nonce,
        ...(typeof message.pane === "string" ? { pane: message.pane } : {}),
      }
    : undefined;
}

function parseRequest(message: unknown) {
  if (!isPlainRecord(message) || !isAgentRequestId(message.id))
    return { id: null };
  const known =
    hasOnlyKeys(message, ["id", "cmd"], ["args"]) &&
    AGENT_COMMANDS.includes(message.cmd as AgentCommand);
  return known
    ? {
        id: message.id,
        command: message.cmd as AgentCommand,
        args: message.args,
      }
    : { id: message.id };
}

function parseProof(message: unknown): Buffer | undefined {
  return isPlainRecord(message) &&
    hasOnlyKeys(message, ["proof"]) &&
    typeof message.proof === "string" &&
    /^[0-9a-f]{64}$/u.test(message.proof)
    ? Buffer.from(message.proof, "hex")
    : undefined;
}

/**
 * Splits a socket's bytes into lines (newline excluded), on bytes rather than
 * decoded text, and stops at the first line longer than limit().
 */
function readLines(
  socket: net.Socket,
  limit: () => number,
  onLine: (bytes: Buffer) => boolean,
  onOverflow: () => void,
) {
  let buffered: Buffer[] = [];
  let size = 0;
  socket.on("data", (chunk: Buffer) => {
    let start = 0;
    for (;;) {
      const end = chunk.indexOf(0x0a, start);
      const piece = chunk.subarray(start, end < 0 ? chunk.length : end);
      if (size + piece.length > limit()) return onOverflow();
      if (end < 0) {
        buffered.push(piece);
        size += piece.length;
        return;
      }
      const bytes = buffered.length
        ? Buffer.concat([...buffered, piece])
        : piece;
      buffered = [];
      size = 0;
      start = end + 1;
      // onLine answers false once the connection is gone.
      if (bytes.length > 0 && !onLine(bytes)) return;
    }
  });
}

/**
 * The agent API's Unix socket (ADR 0052): newline-delimited JSON, a mutual
 * HMAC handshake over a grant's token, and connections bound to one window.
 * It listens only while its owner holds at least one grant.
 */
export function createAgentEndpoint(
  socketPath: string,
  instance: string,
  handlers: AgentEndpointHandlers,
) {
  const connections = new Set<Connection>();
  let server: net.Server | undefined;
  let listening: Promise<void> | undefined;
  // Each listen() or stop() starts a generation; a stale start gives up.
  let generations = 0;
  let onFailure: (() => void) | undefined;

  const send = (connection: Connection, message: unknown) => {
    const { socket } = connection;
    if (connection.stage === "closed" || socket.destroyed) return;
    socket.write(`${JSON.stringify(message)}\n`);
    if (socket.writableLength > MAX_UNREAD_RESPONSE_BYTES) close(connection);
  };
  const close = (connection: Connection) => {
    if (connection.stage === "closed") return;
    connection.stage = "closed";
    for (const controller of connection.pending.values()) controller.abort();
    connection.pending.clear();
    connections.delete(connection);
    connection.socket.end();
  };
  // No detail for a client that failed the handshake, and no fast retries.
  const refuse = (
    connection: Connection,
    reason: "invalid-payload" | "untrusted-sender" | "limit",
  ) => {
    if (connection.stage === "closed") return;
    handlers.rejected(reason);
    connection.stage = "closed";
    connections.delete(connection);
    connection.socket.pause();
    setTimeout(() => connection.socket.destroy(), REJECT_DELAY_MS).unref();
  };
  const fail = (
    connection: Connection,
    id: AgentRequestId | null,
    code: AgentErrorCode,
    message: string,
  ) => send(connection, { id, ok: false, error: { code, message } });

  const handshake = (connection: Connection, message: unknown) => {
    if (connection.stage === "hello") {
      const hello = parseHello(message);
      if (!hello) return refuse(connection, "invalid-payload");
      // Another OMXTerm process's window with the same id isn't this one.
      const token =
        hello.instance === instance ? handlers.token(hello.window) : undefined;
      if (!token) return refuse(connection, "untrusted-sender");
      const bound = [...connections].filter(
        (other) => other.stage === "ready" && other.window === hello.window,
      ).length;
      if (bound >= MAX_AGENT_CONNECTIONS_PER_GRANT)
        return refuse(connection, "limit");
      const serverNonce = randomBytes(32).toString("hex");
      Object.assign(connection, {
        window: hello.window,
        clientNonce: hello.nonce,
        serverNonce,
        stage: "proof",
        ...(hello.pane ? { pane: hello.pane } : {}),
      });
      send(connection, {
        hello: AGENT_PROTOCOL,
        nonce: serverNonce,
        proof: proof(
          token,
          agentProofMessage("server", hello.nonce, serverNonce),
        ),
      });
      return;
    }
    const received = parseProof(message);
    if (!received) return refuse(connection, "invalid-payload");
    // The grant may have ended between the two lines.
    const token = handlers.token(connection.window!);
    const expected =
      token &&
      Buffer.from(
        proof(
          token,
          agentProofMessage(
            "client",
            connection.clientNonce!,
            connection.serverNonce!,
          ),
        ),
        "hex",
      );
    if (!expected || !timingSafeEqual(expected, received))
      return refuse(connection, "untrusted-sender");
    connection.stage = "ready";
    send(connection, {
      ok: true,
      window: connection.window,
      protocol: AGENT_PROTOCOL,
    });
  };

  const request = (connection: Connection, message: unknown) => {
    const { id, command, args } = parseRequest(message);
    if (id === null || !command)
      return fail(
        connection,
        id,
        "invalid-request",
        "Expected {id, cmd, args} with a known command.",
      );
    if (connection.pending.has(id))
      return fail(connection, id, "invalid-request", "That id is in use.");
    if (connection.pending.size >= MAX_AGENT_REQUESTS_PER_CONNECTION)
      return fail(connection, id, "limit", "Too many requests in flight.");
    const controller = new AbortController();
    connection.pending.set(id, controller);
    const caller: AgentCaller = {
      signal: controller.signal,
      ...(connection.pane ? { pane: connection.pane } : {}),
    };
    void handlers.request(connection.window!, command, args, caller).then(
      (result) => {
        if (connection.pending.get(id) !== controller) return;
        connection.pending.delete(id);
        send(connection, { id, ok: true, result });
      },
      (error: unknown) => {
        if (connection.pending.get(id) !== controller) return;
        connection.pending.delete(id);
        if (error instanceof AgentApiError)
          fail(connection, id, error.code, error.message);
        else fail(connection, id, "unavailable", "The window couldn't answer.");
      },
    );
  };

  const line = (connection: Connection, bytes: Buffer) => {
    let message: unknown;
    try {
      message = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      );
    } catch {
      if (connection.stage === "ready")
        return fail(connection, null, "invalid-request", "Not JSON.");
      return refuse(connection, "invalid-payload");
    }
    if (connection.stage === "ready") request(connection, message);
    else handshake(connection, message);
  };

  const accept = (socket: net.Socket) => {
    const connection: Connection = {
      socket,
      stage: "hello",
      pending: new Map(),
    };
    socket.on("error", () => close(connection));
    const unauthenticated = [...connections].filter(
      (other) => other.stage !== "ready",
    ).length;
    connections.add(connection);
    if (unauthenticated >= MAX_AGENT_PENDING_CONNECTIONS)
      return refuse(connection, "limit");
    const timer = setTimeout(() => {
      if (connection.stage === "hello" || connection.stage === "proof")
        refuse(connection, "invalid-payload");
    }, AGENT_HANDSHAKE_TIMEOUT_MS);
    timer.unref();
    readLines(
      socket,
      () =>
        connection.stage === "ready"
          ? MAX_AGENT_REQUEST_BYTES
          : MAX_AGENT_HANDSHAKE_BYTES,
      (bytes) => {
        if (connection.stage === "closed") return false;
        line(connection, bytes);
        if (connection.stage === "ready") clearTimeout(timer);
        return true;
      },
      () => {
        if (connection.stage !== "ready")
          return refuse(connection, "invalid-payload");
        fail(connection, null, "invalid-request", "The line is too long.");
        close(connection);
      },
    );
    socket.on("end", () => close(connection));
    socket.on("close", () => {
      clearTimeout(timer);
      close(connection);
    });
  };

  const stop = () => {
    for (const connection of [...connections]) close(connection);
    const current = server;
    server = undefined;
    listening = undefined;
    generations += 1;
    if (!current) return;
    current.removeAllListeners("connection");
    current.close();
    // Ours to remove, synchronously so a new grant can't lose its socket.
    try {
      unlinkSync(socketPath);
    } catch {
      // Closing the server usually removed it already.
    }
  };

  return {
    /** Starts listening once; refuses a socket another process holds. */
    listen(failed: () => void): Promise<void> {
      onFailure = failed;
      if (listening) return listening;
      const generation = ++generations;
      const pending = (async () => {
        await prepareDirectory(path.dirname(socketPath));
        await removeStaleSocket(socketPath);
        const created = net.createServer({ allowHalfOpen: false }, accept);
        await new Promise<void>((resolve, reject) => {
          created.once("error", reject);
          created.listen(socketPath, () => {
            created.removeListener("error", reject);
            resolve();
          });
        });
        if (generation !== generations) {
          created.close();
          throw new Error("The endpoint stopped while starting");
        }
        server = created;
        created.on("error", () => {
          stop();
          onFailure?.();
        });
        await chmod(socketPath, 0o600);
      })();
      listening = pending;
      pending.catch(() => {
        if (generation === generations) listening = undefined;
      });
      return pending;
    },
    /** Ends one grant's connections; in-flight requests answer `revoked`. */
    revoke(window: number) {
      for (const connection of [...connections]) {
        if (connection.window !== window) continue;
        for (const id of connection.pending.keys())
          fail(connection, id, "revoked", "The user stopped agent access.");
        close(connection);
      }
    },
    /** Stops listening and removes the socket. */
    close: stop,
    isListening: () => server !== undefined,
  };
}

export type AgentEndpoint = ReturnType<typeof createAgentEndpoint>;
