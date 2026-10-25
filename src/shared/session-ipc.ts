import {
  isSavedSessionId,
  isTerminalLaunchSpec,
  type TerminalLaunchSpec,
} from "./terminal-launch";

export const sessionIpc = {
  list: "sessions:list",
  saveSession: "sessions:save-session",
  deleteSession: "sessions:delete-session",
  saveFolder: "sessions:save-folder",
  deleteFolder: "sessions:delete-folder",
  importSshConfig: "sessions:import-ssh-config",
  importFile: "sessions:import-file",
  exportFile: "sessions:export-file",
  chooseFile: "sessions:choose-file",
  changed: "sessions:changed",
  toggleSidebar: "sessions:toggle-sidebar",
  startupConnection: "sessions:startup-connection",
  passwordState: "sessions:password-state",
  setPassword: "sessions:set-password",
  forgetHostKey: "sessions:forget-host-key",
} as const;

export type SessionFileChoice = "identity-file" | "directory" | "program";

export function isSessionFileChoice(
  value: unknown,
): value is SessionFileChoice {
  return (
    value === "identity-file" || value === "directory" || value === "program"
  );
}

// An SSH Saved Session's optional stored password. It lives in the system
// keyring, never in sessions.json, exports or backups, and never returns to
// the renderer: the editor only learns whether one is saved.
export type SessionPasswordStorage =
  "available" | "unavailable" | "unsupported";

export interface SessionPasswordState {
  // "unavailable": no secure keyring; "unsupported": no askpass on this
  // platform. Either way the password is typed when ssh asks.
  readonly storage: SessionPasswordStorage;
  readonly saved: boolean;
}

// A password to store, or null to remove the stored one.
export interface SessionPasswordChange {
  readonly id: string;
  readonly password: string | null;
}

export const MAX_SESSION_PASSWORD_LENGTH = 1024;

// ssh reads the askpass answer up to a newline, so line breaks and NUL are
// refused rather than silently truncating the password.
export function isSessionPassword(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_SESSION_PASSWORD_LENGTH &&
    !/[\0\r\n]/u.test(value)
  );
}

export function isSessionPasswordChange(
  value: unknown,
): value is SessionPasswordChange {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).sort().join(",") === "id,password" &&
    isSavedSessionId(record.id) &&
    (record.password === null || isSessionPassword(record.password))
  );
}

export function isSessionPasswordState(
  value: unknown,
): value is SessionPasswordState {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).sort().join(",") === "saved,storage" &&
    typeof record.saved === "boolean" &&
    (record.storage === "available" ||
      record.storage === "unavailable" ||
      record.storage === "unsupported")
  );
}

// The SSH session whose host a Solution acts on: a Saved Session or a Quick
// Connect target, resolved again in main from its definition.
export type SshSessionReference = Extract<
  TerminalLaunchSpec,
  { readonly kind: "saved-session" | "quick-ssh" }
>;

export function isSshSessionReference(
  value: unknown,
): value is SshSessionReference {
  return (
    isTerminalLaunchSpec(value) &&
    (value.kind === "saved-session" || value.kind === "quick-ssh")
  );
}
