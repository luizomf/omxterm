export const fileBrowserIpc = {
  home: "files:home",
  list: "files:list",
  resolve: "files:resolve",
  open: "files:open",
  reveal: "files:reveal",
  createFolder: "files:create-folder",
  createFile: "files:create-file",
  rename: "files:rename",
  trash: "files:trash",
  copyOrMove: "files:copy-or-move",
  // Main asks the focused window to show or hide the Files panel.
  toggle: "files:toggle",
  // Remote (SFTP) browsing of the pane a request names.
  location: "files:location",
  remoteHome: "files:remote-home",
  remoteList: "files:remote-list",
  remoteCreateFolder: "files:remote-create-folder",
  remoteCreateFile: "files:remote-create-file",
  remoteRename: "files:remote-rename",
  remoteMove: "files:remote-move",
  remoteDelete: "files:remote-delete",
  remoteDownload: "files:remote-download",
  remoteUpload: "files:remote-upload",
  remoteEdit: "files:remote-edit",
  cancelTransfer: "files:cancel-transfer",
  transfer: "files:transfer-event",
} as const;

export const MAX_FILE_PATH_LENGTH = 4_096;
export const MAX_FILE_NAME_LENGTH = 255;
export const MAX_DIRECTORY_ENTRIES = 5_000;
export const MAX_FILE_SELECTION = 1_000;

export type FileEntryKind = "directory" | "file" | "symlink" | "other";

export interface FileEntry {
  readonly name: string;
  readonly kind: FileEntryKind;
  // For a symlink: what it points to, when that can be read.
  readonly targetKind?: "directory" | "file" | "other" | "missing";
  readonly size: number;
  // Milliseconds since the epoch.
  readonly modified: number;
  // Like ls: "rwxr-xr-x" (empty where the platform has no POSIX modes).
  readonly mode: string;
}

export interface DirectoryListing {
  readonly path: string;
  // undefined at a file system root.
  readonly parent?: string;
  readonly entries: readonly FileEntry[];
  // More entries than MAX_DIRECTORY_ENTRIES; the rest are not listed.
  readonly truncated: boolean;
}

export interface FileBrowserHome {
  readonly home: string;
  readonly platform: string;
  readonly separator: "/" | "\\";
}

export type FileTransfer = "copy" | "move";

// Results of operations that can fail for ordinary reasons (permissions,
// existing names) carry a message instead of rejecting.
export type FileOperationResult =
  | { readonly ok: true; readonly path?: string }
  | { readonly ok: false; readonly error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const CONTROL = /[\u0000-\u001f\u007f]/u;

export function isFilePath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_FILE_PATH_LENGTH &&
    !value.includes("\0")
  );
}

// A single path component: no separators, no "." or "..", no control
// characters, and none of the characters Windows forbids.
export function isFileName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_FILE_NAME_LENGTH &&
    value !== "." &&
    value !== ".." &&
    !/[/\\:*?"<>|]/u.test(value) &&
    !CONTROL.test(value) &&
    value.trim() === value
  );
}

export function isFilePathList(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= MAX_FILE_SELECTION &&
    value.every(isFilePath)
  );
}

const KINDS = ["directory", "file", "symlink", "other"];
const TARGET_KINDS = ["directory", "file", "other", "missing"];

function isFileEntry(value: unknown): value is FileEntry {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    value.name.length > 0 &&
    value.name.length <= MAX_FILE_NAME_LENGTH * 4 &&
    KINDS.includes(value.kind as string) &&
    (value.targetKind === undefined ||
      TARGET_KINDS.includes(value.targetKind as string)) &&
    typeof value.size === "number" &&
    Number.isFinite(value.size) &&
    typeof value.modified === "number" &&
    Number.isFinite(value.modified) &&
    typeof value.mode === "string" &&
    value.mode.length <= 10
  );
}

export function isDirectoryListing(value: unknown): value is DirectoryListing {
  return (
    isRecord(value) &&
    isFilePath(value.path) &&
    (value.parent === undefined || isFilePath(value.parent)) &&
    Array.isArray(value.entries) &&
    value.entries.length <= MAX_DIRECTORY_ENTRIES &&
    value.entries.every(isFileEntry) &&
    typeof value.truncated === "boolean"
  );
}

export function isFileBrowserHome(value: unknown): value is FileBrowserHome {
  return (
    isRecord(value) &&
    isFilePath(value.home) &&
    typeof value.platform === "string" &&
    (value.separator === "/" || value.separator === "\\")
  );
}

export function isFileOperationResult(
  value: unknown,
): value is FileOperationResult {
  if (!isRecord(value)) return false;
  if (value.ok === true)
    return value.path === undefined || isFilePath(value.path);
  return (
    value.ok === false &&
    typeof value.error === "string" &&
    value.error.length <= 2_048
  );
}

// Quotes a path as one literal argument for the shell that will read it.
export function quotePathForShell(filePath: string, platform: string): string {
  if (platform === "win32") return `'${filePath.replaceAll("'", "''")}'`;
  return `'${filePath.replaceAll("'", `'\\''`)}'`;
}

// The command that changes the shell's directory, typed for the user.
export function changeDirectoryCommand(
  filePath: string,
  platform: string,
): string {
  const quoted = quotePathForShell(filePath, platform);
  return platform === "win32"
    ? `Set-Location -LiteralPath ${quoted}`
    : `cd -- ${quoted}`;
}

// Where a pane's files are: the local file system, or an SSH host reached
// over SFTP (label is user@host:port, never a secret).
export type PaneLocation =
  | { readonly kind: "local" }
  | { readonly kind: "remote"; readonly label: string };

export interface TransferEvent {
  readonly id: string;
  readonly name: string;
  readonly direction: "download" | "upload";
  readonly transferred: number;
  readonly total?: number;
  readonly state: "running" | "done" | "failed" | "cancelled";
  readonly error?: string;
}

export function isPaneLocation(value: unknown): value is PaneLocation {
  return (
    isRecord(value) &&
    (value.kind === "local" ||
      (value.kind === "remote" &&
        typeof value.label === "string" &&
        value.label.length <= 512))
  );
}

const TRANSFER_STATES = ["running", "done", "failed", "cancelled"];

export function isTransferEvent(value: unknown): value is TransferEvent {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length <= 64 &&
    typeof value.name === "string" &&
    value.name.length <= MAX_FILE_NAME_LENGTH * 4 &&
    (value.direction === "download" || value.direction === "upload") &&
    typeof value.transferred === "number" &&
    (value.total === undefined || typeof value.total === "number") &&
    TRANSFER_STATES.includes(value.state as string) &&
    (value.error === undefined ||
      (typeof value.error === "string" && value.error.length <= 2_048))
  );
}
