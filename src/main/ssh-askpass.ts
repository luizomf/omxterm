import { randomBytes } from "node:crypto";
import { chmodSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Socket } from "node:net";
import path from "node:path";

// ssh asks a helper for passwords when SSH_ASKPASS is set with
// SSH_ASKPASS_REQUIRE=force (OpenSSH 8.4+). For a Saved Session with a stored
// password, the helper's first password prompt is answered by main over a
// private socket that accepts a one-time token; every other prompt (an
// unknown host key, a verification code, a retry after a wrong password) is
// asked on the session's own terminal, as ssh itself would. The password
// never reaches argv, the environment, the terminal, a log or a file.

// A token is valid this long after the launch, enough for a slow connection
// and an interactive host key confirmation.
export const ASKPASS_TOKEN_LIFETIME_MS = 10 * 60 * 1000;
const MAX_REQUEST_LENGTH = 256;
const CONNECTION_TIMEOUT_MS = 5_000;

export interface SshAskpass {
  // The environment that lets one ssh process ask for this credential once.
  environment(credentialId: string): Readonly<Record<string, string>>;
  dispose(): void;
}

export interface SshAskpassOptions {
  // A private (0700) per-user directory for the helper and its socket.
  readonly directory: string;
  // The Electron executable, which runs the helper as plain Node.js.
  readonly executable: string;
  readonly lookup: (credentialId: string) => Promise<string | undefined>;
  readonly now?: () => number;
}

export async function startSshAskpass(
  options: SshAskpassOptions,
): Promise<SshAskpass> {
  const now = options.now ?? Date.now;
  const helper = path.join(options.directory, "askpass.cjs");
  const launcher = path.join(options.directory, "askpass");
  writePrivate(helper, ASKPASS_HELPER_SOURCE, 0o600);
  writePrivate(launcher, askpassLauncher(options.executable, helper), 0o700);
  const socketPath = path.join(
    options.directory,
    `askpass-${randomBytes(6).toString("hex")}.sock`,
  );
  const tokens = new Map<
    string,
    { readonly credentialId: string; readonly expires: number }
  >();
  const answer = (socket: Socket, token: string) => {
    const entry = tokens.get(token);
    // One answer per launch: a retry after a wrong password is typed.
    tokens.delete(token);
    if (!entry || entry.expires < now()) {
      socket.end();
      return;
    }
    options.lookup(entry.credentialId).then(
      (password) => socket.end(password ?? ""),
      () => socket.end(),
    );
  };
  const server = createServer((socket) => {
    socket.setEncoding("utf8");
    socket.setTimeout(CONNECTION_TIMEOUT_MS, () => socket.destroy());
    socket.on("error", () => {});
    let received = "";
    socket.on("data", (chunk: string) => {
      received += chunk;
      const end = received.indexOf("\n");
      if (end >= 0) {
        socket.removeAllListeners("data");
        answer(socket, received.slice(0, end));
      } else if (received.length > MAX_REQUEST_LENGTH) socket.destroy();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      server.off("error", reject);
      resolve();
    });
  });
  chmodSync(socketPath, 0o600);
  return {
    environment(credentialId) {
      const time = now();
      for (const [token, entry] of tokens)
        if (entry.expires < time) tokens.delete(token);
      const token = randomBytes(24).toString("hex");
      tokens.set(token, {
        credentialId,
        expires: time + ASKPASS_TOKEN_LIFETIME_MS,
      });
      return {
        SSH_ASKPASS: launcher,
        SSH_ASKPASS_REQUIRE: "force",
        OMXTERM_ASKPASS_SOCKET: socketPath,
        OMXTERM_ASKPASS_TOKEN: token,
      };
    },
    dispose() {
      tokens.clear();
      server.close();
      rmSync(socketPath, { force: true });
    },
  };
}

function writePrivate(file: string, contents: string, mode: number): void {
  writeFileSync(file, contents, { mode });
  // An existing file keeps its old mode on write.
  chmodSync(file, mode);
}

// ssh runs SSH_ASKPASS with the prompt as its only argument, so a small
// launcher starts the helper with Electron as Node.js. Paths are single-quoted
// literals, never interpolated shell text.
export function askpassLauncher(executable: string, helper: string): string {
  const quote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`;
  return [
    "#!/bin/sh",
    "# OMXTerm SSH_ASKPASS launcher; see ssh-askpass.ts.",
    `ELECTRON_RUN_AS_NODE=1 exec ${quote(executable)} ${quote(helper)} "$@"`,
    "",
  ].join("\n");
}

// The helper ssh runs. It asks main only for a password prompt, and asks the
// terminal otherwise or when main has no answer. Prompts with "yes/no" echo
// what is typed; every other prompt is hidden, like ssh's own.
export const ASKPASS_HELPER_SOURCE = String.raw`"use strict";
const fs = require("node:fs");
const net = require("node:net");
const tty = require("node:tty");

const prompt = process.argv[2] || "";
let settled = false;

function finish(answer) {
  if (settled) return;
  settled = true;
  if (answer === undefined) process.exit(1);
  process.stdout.write(answer + "\n", () => process.exit(0));
}

function askTerminal() {
  if (settled) return;
  let fd;
  try {
    fd = fs.openSync("/dev/tty", "r+");
  } catch {
    finish(undefined);
    return;
  }
  const echo = /yes\/no/i.test(prompt);
  const write = (text) => {
    try {
      fs.writeSync(fd, text);
    } catch {}
  };
  const input = new tty.ReadStream(fd);
  const end = (answer) => {
    input.setRawMode(false);
    write("\r\n");
    input.destroy();
    finish(answer);
  };
  let line = [];
  write(prompt);
  input.setRawMode(true);
  input.setEncoding("utf8");
  input.on("data", (chunk) => {
    for (const character of chunk) {
      if (character === "\r" || character === "\n") return end(line.join(""));
      if (character === "\u0003") return end(undefined);
      if (character === "\u0004" && line.length === 0) return end(undefined);
      if (character === "\u007f" || character === "\b") {
        if (line.length > 0) {
          line.pop();
          if (echo) write("\b \b");
        }
      } else if (character === "\u0015") {
        if (echo) write("\b \b".repeat(line.length));
        line = [];
      } else if (character >= " ") {
        line.push(character);
        if (echo) write(character);
      }
    }
  });
}

const socketPath = process.env.OMXTERM_ASKPASS_SOCKET;
const token = process.env.OMXTERM_ASKPASS_TOKEN;
if (!socketPath || !token || !/password:\s*$/i.test(prompt)) {
  askTerminal();
} else {
  let answer = "";
  const client = net.createConnection(socketPath);
  client.setEncoding("utf8");
  client.setTimeout(5000, () => client.destroy());
  client.on("connect", () => client.write(token + "\n"));
  client.on("data", (data) => {
    answer += data;
  });
  client.on("error", () => {});
  client.on("close", () => (answer ? finish(answer) : askTerminal()));
}
`;
