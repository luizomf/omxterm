import { execFile } from "node:child_process";
import path from "node:path";
import type {
  SessionDefinition,
  SshSessionDefinition,
} from "../shared/saved-sessions";
import {
  isSshSessionReference,
  sessionIpc,
  type SshSessionReference,
} from "../shared/session-ipc";
import type { IpcEvent, IpcMainPort } from "./terminal-ipc-types";
import { registerTrustedHandlers } from "./trusted-ipc";

// Removes a host's keys from the user's own known_hosts with
// `ssh-keygen -R`, which keeps the previous file as known_hosts.old. Only an
// explicit Solution request does this, for a host taken from the session
// definition; the reconnect that follows makes ssh ask about the new key in
// the terminal (ADR 0039).

// ssh-keygen's name for a host on a non-default port: [host]:port.
export function knownHostsName(
  session: Pick<SshSessionDefinition, "host" | "port">,
): string {
  const host = session.host.replace(/^\[(.*)\]$/u, "$1");
  return session.port !== undefined && session.port !== 22
    ? `[${host}]:${session.port}`
    : host;
}

export function userKnownHostsFile(
  homeDirectory: string,
  platform: string = process.platform,
): string {
  const join = platform === "win32" ? path.win32.join : path.posix.join;
  return join(homeDirectory, ".ssh", "known_hosts");
}

export type RunFile = (
  executable: string,
  arguments_: readonly string[],
) => Promise<{ readonly stdout: string }>;

const runFile: RunFile = (executable, arguments_) =>
  new Promise((resolve, reject) => {
    execFile(
      executable,
      [...arguments_],
      { timeout: 10_000, windowsHide: true },
      (error, stdout) => (error ? reject(error) : resolve({ stdout })),
    );
  });

// Resolves whether ssh-keygen found and removed a key for the host.
export async function forgetHostKey(
  session: Pick<SshSessionDefinition, "host" | "port">,
  options: {
    readonly sshKeygen: string;
    readonly knownHostsFile: string;
    readonly run?: RunFile;
  },
): Promise<boolean> {
  const { stdout } = await (options.run ?? runFile)(options.sshKeygen, [
    "-R",
    knownHostsName(session),
    "-f",
    options.knownHostsFile,
  ]);
  return /\bfound: line \d+/u.test(stdout);
}

// Serves the Solution's "remove the old key" request. The renderer names the
// session, never a host; failures cross as short fixed reasons.
export function registerHostKeyIpc(
  ipcMain: IpcMainPort,
  isTrusted: (event: IpcEvent) => boolean,
  options: {
    readonly resolve: (
      reference: SshSessionReference,
    ) => SessionDefinition | undefined;
    readonly sshKeygen: () => string | undefined;
    readonly knownHostsFile: string;
    readonly run?: RunFile;
  },
  onRejected?: () => void,
): () => void {
  return registerTrustedHandlers(
    ipcMain,
    isTrusted,
    {
      [sessionIpc.forgetHostKey]: async (_event, payload) => {
        if (!isSshSessionReference(payload))
          throw new Error("Invalid session reference");
        const session = options.resolve(payload);
        if (session?.kind !== "ssh")
          throw new Error("The session is not an SSH session");
        const sshKeygen = options.sshKeygen();
        if (!sshKeygen) throw new Error("ssh-keygen was not found on PATH");
        try {
          return {
            removed: await forgetHostKey(session, {
              sshKeygen,
              knownHostsFile: options.knownHostsFile,
              ...(options.run ? { run: options.run } : {}),
            }),
          };
        } catch {
          throw new Error("ssh-keygen could not update known_hosts");
        }
      },
    },
    onRejected,
  );
}
