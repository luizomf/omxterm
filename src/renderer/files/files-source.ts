import type {
  DirectoryListing,
  FileOperationResult,
  FileTransfer,
} from "../../shared/file-browser";
import type { FilesBridge } from "../../shared/terminal-bridge";
import type { TerminalSessionId } from "../../shared/terminal-contract";

// Where the Files panel reads and writes: the local file system, or an SSH
// pane's host over SFTP. Remote hosts have no trash and no copy operation;
// they offer downloads, uploads and editing a file locally instead.
export interface FilesSource {
  readonly kind: "local" | "remote";
  // The SSH pane this source belongs to, for a remote source.
  readonly sessionId?: TerminalSessionId;
  // user@host:port for a remote source.
  readonly label?: string;
  // How the shell in that pane quotes paths ("win32" or POSIX).
  readonly platform: string;
  readonly separator: "/" | "\\";
  home(): Promise<string>;
  list(directory: string): Promise<DirectoryListing>;
  // Local: the default application. Remote: a local copy whose saves are
  // uploaded back.
  open(filePath: string): Promise<FileOperationResult>;
  createFolder(parent: string, name: string): Promise<FileOperationResult>;
  createFile(parent: string, name: string): Promise<FileOperationResult>;
  rename(filePath: string, name: string): Promise<FileOperationResult>;
  // Local: to the trash. Remote: permanently.
  remove(paths: readonly string[]): Promise<FileOperationResult>;
  transfer(
    mode: FileTransfer,
    paths: readonly string[],
    directory: string,
  ): Promise<FileOperationResult>;
  reveal?(filePath: string): Promise<FileOperationResult>;
  download?(paths: readonly string[]): Promise<FileOperationResult>;
  upload?(directory: string): Promise<FileOperationResult>;
}

export async function localFilesSource(
  bridge: FilesBridge,
): Promise<FilesSource> {
  const home = await bridge.home();
  return {
    kind: "local",
    platform: home.platform,
    separator: home.separator,
    home: async () => home.home,
    list: (directory) => bridge.list(directory),
    open: (filePath) => bridge.open(filePath),
    createFolder: (parent, name) => bridge.createFolder(parent, name),
    createFile: (parent, name) => bridge.createFile(parent, name),
    rename: (filePath, name) => bridge.rename(filePath, name),
    remove: (paths) => bridge.trash(paths),
    transfer: (mode, paths, directory) =>
      bridge.transfer(mode, paths, directory),
    reveal: (filePath) => bridge.reveal(filePath),
  };
}

export function remoteFilesSource(
  bridge: FilesBridge,
  sessionId: TerminalSessionId,
  label: string,
  copyUnsupported: string,
): FilesSource {
  return {
    kind: "remote",
    sessionId,
    label,
    platform: "linux",
    separator: "/",
    home: () => bridge.remoteHome(sessionId),
    list: (directory) => bridge.remoteList(sessionId, directory),
    open: (filePath) => bridge.remoteEdit(sessionId, filePath),
    createFolder: (parent, name) =>
      bridge.remoteCreateFolder(sessionId, parent, name),
    createFile: (parent, name) =>
      bridge.remoteCreateFile(sessionId, parent, name),
    rename: (filePath, name) => bridge.remoteRename(sessionId, filePath, name),
    remove: (paths) => bridge.remoteDelete(sessionId, paths),
    transfer: async (mode, paths, directory) =>
      mode === "move"
        ? bridge.remoteMove(sessionId, paths, directory)
        : { ok: false, error: copyUnsupported },
    download: (paths) => bridge.remoteDownload(sessionId, paths),
    upload: (directory) => bridge.remoteUpload(sessionId, directory),
  };
}

// The source for each pane, asked of main once per pane: its launch never
// changes while it lives.
export function createSourceResolver(
  bridge: FilesBridge,
  local: () => FilesSource,
  copyUnsupported: string,
): (sessionId: TerminalSessionId) => Promise<FilesSource> {
  const locations = new Map<TerminalSessionId, Promise<FilesSource>>();
  return (sessionId) => {
    let found = locations.get(sessionId);
    if (!found) {
      found = bridge
        .location(sessionId)
        .then((location) =>
          location.kind === "remote"
            ? remoteFilesSource(
                bridge,
                sessionId,
                location.label,
                copyUnsupported,
              )
            : local(),
        );
      locations.set(sessionId, found);
      found.catch(() => locations.delete(sessionId));
    }
    return found;
  };
}
