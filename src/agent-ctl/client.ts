// The agent API's client side of one connection (ADR 0052): framing, the
// mutual handshake and id-matched requests, with no dependencies.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import net from "node:net";
import {
  AGENT_HANDSHAKE_TIMEOUT_MS,
  AGENT_PROTOCOL,
  agentNotGrantedSentence,
  agentProofMessage,
  isPlainRecord,
} from "../shared/agent-api";

export const EXIT = {
  ok: 0,
  api: 1,
  usage: 2,
  absent: 3,
  timeout: 124,
} as const;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

export class CtlError extends Error {
  constructor(
    readonly exitCode: number,
    message: string,
  ) {
    super(message);
  }
}

export interface Grant {
  readonly instance: string;
  readonly window: number;
  readonly endpoint: string;
  readonly token: Buffer;
}

/** One authenticated connection with overlapping, id-matched requests. */
export class Client {
  #socket: net.Socket;
  #buffer: Buffer[] = [];
  #size = 0;
  #waiting: ((message: unknown) => void)[] = [];
  #pending = new Map<number, (message: Record<string, unknown>) => void>();
  #nextId = 1;
  #closed?: CtlError;

  private constructor(socket: net.Socket) {
    this.#socket = socket;
    socket.on("data", (chunk: Buffer) => this.#data(chunk));
    socket.on("error", () => this.#close());
    socket.on("close", () => this.#close());
  }

  static connect(endpoint: string): Promise<Client> {
    return new Promise((resolve, reject) => {
      const socket = net.connect(endpoint);
      socket.once("connect", () => {
        socket.removeAllListeners("error");
        resolve(new Client(socket));
      });
      socket.once("error", () =>
        reject(new CtlError(EXIT.absent, agentNotGrantedSentence())),
      );
    });
  }

  #close() {
    if (this.#closed) return;
    this.#closed = new CtlError(
      EXIT.api,
      "OMXTerm closed the connection (agent access may have been stopped).",
    );
    for (const waiter of this.#waiting.splice(0)) waiter(undefined);
    for (const resolve of this.#pending.values()) resolve({});
    this.#pending.clear();
  }

  #data(chunk: Buffer) {
    let start = 0;
    for (;;) {
      const end = chunk.indexOf(0x0a, start);
      if (end < 0) {
        this.#buffer.push(chunk.subarray(start));
        this.#size += chunk.length - start;
        if (this.#size > MAX_RESPONSE_BYTES) this.#socket.destroy();
        return;
      }
      const line = Buffer.concat([...this.#buffer, chunk.subarray(start, end)]);
      this.#buffer = [];
      this.#size = 0;
      start = end + 1;
      let message: unknown;
      try {
        message = JSON.parse(line.toString("utf8"));
      } catch {
        this.#socket.destroy();
        return;
      }
      const id = isPlainRecord(message) ? message.id : undefined;
      if (typeof id === "number" && this.#pending.has(id)) {
        const resolve = this.#pending.get(id)!;
        this.#pending.delete(id);
        resolve(message as Record<string, unknown>);
      } else this.#waiting.shift()?.(message);
    }
  }

  #next(): Promise<unknown> {
    if (this.#closed) return Promise.resolve(undefined);
    return new Promise((resolve) => this.#waiting.push(resolve));
  }

  #write(message: unknown) {
    this.#socket.write(`${JSON.stringify(message)}\n`);
  }

  async handshake(grant: Grant, pane: string | undefined) {
    const timer = setTimeout(
      () => this.#socket.destroy(),
      AGENT_HANDSHAKE_TIMEOUT_MS,
    );
    try {
      const clientNonce = randomBytes(32).toString("hex");
      this.#write({
        hello: AGENT_PROTOCOL,
        instance: grant.instance,
        window: grant.window,
        nonce: clientNonce,
        ...(pane ? { pane } : {}),
      });
      const hello = await this.#next();
      if (
        !isPlainRecord(hello) ||
        hello.hello !== AGENT_PROTOCOL ||
        typeof hello.nonce !== "string" ||
        !/^[0-9a-f]{64}$/u.test(hello.nonce) ||
        typeof hello.proof !== "string" ||
        !/^[0-9a-f]{64}$/u.test(hello.proof)
      )
        throw new CtlError(EXIT.absent, agentNotGrantedSentence());
      const expected = createHmac("sha256", grant.token)
        .update(agentProofMessage("server", clientNonce, hello.nonce))
        .digest();
      // Whatever answers without the token isn't OMXTerm.
      if (!timingSafeEqual(expected, Buffer.from(hello.proof, "hex"))) {
        this.#socket.destroy();
        throw new CtlError(
          EXIT.api,
          "The endpoint couldn't prove it is OMXTerm; not sending anything.",
        );
      }
      this.#write({
        proof: createHmac("sha256", grant.token)
          .update(agentProofMessage("client", clientNonce, hello.nonce))
          .digest("hex"),
      });
      const ready = await this.#next();
      if (!isPlainRecord(ready) || ready.ok !== true)
        throw new CtlError(EXIT.absent, agentNotGrantedSentence());
    } finally {
      clearTimeout(timer);
    }
  }

  request(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
    if (this.#closed) return Promise.reject(this.#closed);
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, (message) => {
        if (message.ok === true) resolve(message.result);
        else if (isPlainRecord(message.error))
          reject(
            new CtlError(
              EXIT.api,
              `${String(message.error.message ?? "Request failed.")} (${String(message.error.code)})`,
            ),
          );
        else reject(this.#closed ?? new CtlError(EXIT.api, "No answer."));
      });
      this.#write({ id, cmd, ...(args ? { args } : {}) });
    });
  }

  end() {
    this.#socket.end();
  }
}
