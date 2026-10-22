import path from "node:path";
import type {
  PortForward,
  SshSessionDefinition,
} from "../shared/saved-sessions";

export const DEFAULT_SSH_CONNECT_TIMEOUT = 30;
export const DEFAULT_SSH_KEEP_ALIVE = 30;
export const SSH_CONTROL_PERSIST_SECONDS = 60;

export interface SshCommandOptions {
  readonly platform: string;
  // Private per-user directory for ControlMaster sockets (Unix only).
  readonly controlDirectory?: string;
  readonly homeDirectory: string;
}

export interface SshCommand {
  readonly arguments: readonly string[];
  readonly multiplexed: boolean;
}

export type SshCommandSession = Pick<
  SshSessionDefinition,
  | "host"
  | "port"
  | "user"
  | "authentication"
  | "identityFile"
  | "proxyJump"
  | "forwardAgent"
  | "x11"
  | "compression"
  | "multiplex"
  | "hostKeyPolicy"
  | "keepAliveInterval"
  | "connectTimeout"
  | "forwards"
  | "remoteCommand"
  | "options"
>;

// Builds the literal ssh argument vector for a Saved Session. Every value is
// its own argv element; nothing is ever joined into a local shell string.
export function sshArguments(
  session: SshCommandSession,
  options: SshCommandOptions,
): SshCommand {
  const multiplexed = canMultiplex(session, options);
  const argv = [
    ...connectionOptions(session, options, multiplexed),
    ...authenticationArguments(session, options.homeDirectory),
    ...featureArguments(session),
    ...destinationArguments(session),
  ];
  return { arguments: argv, multiplexed };
}

// Forwards, X11 and jump hosts need a fresh connection: a shared master would
// silently ignore them (AshyTerm made the same choice). Windows' OpenSSH has
// no ControlMaster support.
function canMultiplex(
  session: SshCommandSession,
  options: SshCommandOptions,
): boolean {
  return (
    session.multiplex === true &&
    options.platform !== "win32" &&
    options.controlDirectory !== undefined &&
    (session.forwards ?? []).length === 0 &&
    !session.x11 &&
    !session.proxyJump
  );
}

function connectionOptions(
  session: SshCommandSession,
  options: SshCommandOptions,
  multiplexed: boolean,
): string[] {
  const values = [
    `ConnectTimeout=${session.connectTimeout ?? DEFAULT_SSH_CONNECT_TIMEOUT}`,
  ];
  const keepAlive = session.keepAliveInterval ?? DEFAULT_SSH_KEEP_ALIVE;
  if (keepAlive > 0)
    values.push(`ServerAliveInterval=${keepAlive}`, "ServerAliveCountMax=3");
  // OpenSSH's own default ("ask") verifies unknown hosts interactively in the
  // terminal; OMXTerm never disables host key checking.
  if (session.hostKeyPolicy && session.hostKeyPolicy !== "ask")
    values.push(`StrictHostKeyChecking=${session.hostKeyPolicy}`);
  if (multiplexed)
    values.push(
      "ControlMaster=auto",
      // %C is OpenSSH's hash of the connection tuple: short, and never
      // derived from untrusted text by OMXTerm.
      `ControlPath=${path.join(options.controlDirectory!, "%C")}`,
      `ControlPersist=${SSH_CONTROL_PERSIST_SECONDS}`,
    );
  if ((session.forwards ?? []).length > 0)
    values.push("ExitOnForwardFailure=yes");
  values.push(...(session.options ?? []));
  return values.flatMap((value) => ["-o", value]);
}

function authenticationArguments(
  session: SshCommandSession,
  homeDirectory: string,
): string[] {
  if (session.authentication === "key" && session.identityFile)
    return [
      "-i",
      expandHome(session.identityFile, homeDirectory),
      "-o",
      "IdentitiesOnly=yes",
    ];
  // Passwords are typed at ssh's own prompt; OMXTerm never handles them.
  if (session.authentication === "password")
    return [
      "-o",
      "PreferredAuthentications=keyboard-interactive,password",
      "-o",
      "PubkeyAuthentication=no",
    ];
  return [];
}

function featureArguments(session: SshCommandSession): string[] {
  return [
    ...(session.proxyJump ? ["-J", session.proxyJump] : []),
    ...(session.forwardAgent ? ["-A"] : []),
    ...(session.x11 ? ["-Y"] : []),
    ...(session.compression ? ["-C"] : []),
    ...(session.forwards ?? []).flatMap(forwardArguments),
    ...(session.port !== undefined && session.port !== 22
      ? ["-p", String(session.port)]
      : []),
    ...(session.user ? ["-l", session.user] : []),
  ];
}

function destinationArguments(session: SshCommandSession): string[] {
  // Quick Connect writes IPv6 literals in brackets; ssh wants them bare.
  const destination = session.host.replace(/^\[(.*)\]$/u, "$1");
  // A remote command runs in the remote shell, then hands over to an
  // interactive login shell so the session stays usable.
  return session.remoteCommand
    ? ["-t", destination, `${session.remoteCommand}; exec "$SHELL" -l`]
    : [destination];
}

function forwardArguments(forward: PortForward): string[] {
  const bind = forward.bindAddress ? `${forward.bindAddress}:` : "";
  if (forward.kind === "dynamic") return ["-D", `${bind}${forward.listenPort}`];
  return [
    forward.kind === "local" ? "-L" : "-R",
    `${bind}${forward.listenPort}:${forward.host}:${forward.hostPort}`,
  ];
}

export function expandHome(value: string, homeDirectory: string): string {
  if (value === "~") return homeDirectory;
  if (value.startsWith("~/") || value.startsWith("~\\"))
    return path.join(homeDirectory, value.slice(2));
  return value;
}

// A display label that never contains secrets: user@host:port.
export function sshDisplayTarget(
  session: Pick<SshSessionDefinition, "host" | "user" | "port">,
): string {
  const user = session.user ? `${session.user}@` : "";
  const port =
    session.port !== undefined && session.port !== 22 ? `:${session.port}` : "";
  return `${user}${session.host}${port}`;
}
