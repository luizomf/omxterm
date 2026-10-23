import { spawn } from "node:child_process";
import { lstat } from "node:fs/promises";
import path from "node:path";
import {
  app,
  BrowserWindow,
  dialog,
  type IpcMain,
  type WebContents,
} from "electron";
import {
  fileBrowserIpc,
  isFileName,
  isFilePath,
  isFilePathList,
  type FileOperationResult,
  type PaneLocation,
} from "../shared/file-browser";
import { isTerminalSessionId } from "../shared/terminal-contract";
import type { OperationalEventLog } from "./operational-events";
import { createRemoteFiles, type RemoteTarget } from "./remote-files";
import { createRemoteTransfers } from "./remote-transfers";
import type { SavedSessionService } from "./saved-sessions";
import type {
  IpcEvent,
  IpcMainPort,
  TerminalIpcRouter,
} from "./terminal-ipc-types";
import { registerTrustedHandlers } from "./trusted-ipc";

function record(payload: unknown): Record<string, unknown> {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload))
    throw new TypeError("Invalid file request");
  return payload as Record<string, unknown>;
}

function remotePath(value: unknown): string {
  if (!isFilePath(value) || !value.startsWith("/"))
    throw new TypeError("Invalid remote path");
  return value;
}

function fileName(value: unknown): string {
  if (!isFileName(value)) throw new TypeError("Invalid file name");
  return value;
}

// "name.ext", then "name (1).ext", … for a local file that must not replace
// anything.
async function freeLocalPath(directory: string, name: string) {
  const extension = path.extname(name);
  const stem = name.slice(0, name.length - extension.length);
  for (let index = 0; index < 1_000; index += 1) {
    const candidate = path.join(
      directory,
      index === 0 ? name : `${stem} (${index})${extension}`,
    );
    const exists = await lstat(candidate).then(
      () => true,
      () => false,
    );
    if (!exists) return candidate;
  }
  throw new Error("No free file name");
}

// Remote browsing for the Files panel. A request names a pane by its session
// id; main looks up how that pane of the sender's window was started, so the
// renderer can only reach hosts the user already opened a session to.
export function startRemoteFiles(options: {
  readonly ipcMain: IpcMain;
  readonly isTrustedSender: (event: IpcEvent) => boolean;
  readonly sessionLaunch: TerminalIpcRouter["sessionLaunch"];
  readonly savedSessions: Pick<
    SavedSessionService,
    "sftpCommand" | "quickConnect"
  >;
  readonly operationalEvents: Pick<OperationalEventLog, "write">;
}): () => void {
  const remote = createRemoteFiles({
    spawn: ([executable, ...argv]) =>
      spawn(executable!, argv, {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      }),
  });

  const targetFor = (event: IpcEvent, sessionId: unknown) => {
    if (!isTerminalSessionId(sessionId)) return undefined;
    const launch = options.sessionLaunch(event, sessionId);
    if (launch?.kind === "saved-session")
      return options.savedSessions.sftpCommand(launch.id);
    if (launch?.kind === "quick-ssh") {
      const quick = options.savedSessions.quickConnect(launch.target);
      return quick ? options.savedSessions.sftpCommand(quick) : undefined;
    }
    return undefined;
  };
  const target = (event: IpcEvent, sessionId: unknown): RemoteTarget => {
    const command = targetFor(event, sessionId);
    if (!command) throw new TypeError("The pane is not an SSH session");
    const argv = [command.executable, ...command.arguments];
    return { key: JSON.stringify(argv), argv };
  };
  const attempt = async (
    task: () => Promise<string | void>,
  ): Promise<FileOperationResult> => {
    try {
      const result = await task();
      return typeof result === "string"
        ? { ok: true, path: result }
        : { ok: true };
    } catch (cause) {
      return { ok: false, error: remote.message(cause) };
    }
  };

  const windowOf = (event: IpcEvent) =>
    BrowserWindow.fromWebContents(event.sender as unknown as WebContents) ??
    undefined;
  const { track, editRemote, cancel, dispose } = createRemoteTransfers(
    remote,
    app.getPath("temp"),
  );
  app.on("will-quit", () => {
    dispose();
    remote.dispose();
  });

  return registerTrustedHandlers(
    options.ipcMain as unknown as IpcMainPort,
    options.isTrustedSender,
    {
      [fileBrowserIpc.location]: (event, payload): PaneLocation => {
        const command = targetFor(event, payload);
        return command
          ? { kind: "remote", label: command.label }
          : { kind: "local" };
      },
      [fileBrowserIpc.remoteHome]: (event, payload) =>
        remote.home(target(event, payload)),
      [fileBrowserIpc.remoteList]: (event, payload) => {
        const request = record(payload);
        return remote.list(
          target(event, request.sessionId),
          remotePath(request.path),
        );
      },
      [fileBrowserIpc.remoteCreateFolder]: (event, payload) => {
        const request = record(payload);
        return attempt(() =>
          remote.createFolder(
            target(event, request.sessionId),
            remotePath(request.parent),
            fileName(request.name),
          ),
        );
      },
      [fileBrowserIpc.remoteCreateFile]: (event, payload) => {
        const request = record(payload);
        return attempt(() =>
          remote.createFile(
            target(event, request.sessionId),
            remotePath(request.parent),
            fileName(request.name),
          ),
        );
      },
      [fileBrowserIpc.remoteRename]: (event, payload) => {
        const request = record(payload);
        return attempt(() =>
          remote.rename(
            target(event, request.sessionId),
            remotePath(request.path),
            fileName(request.name),
          ),
        );
      },
      [fileBrowserIpc.remoteMove]: (event, payload) => {
        const request = record(payload);
        const paths = request.paths;
        if (!isFilePathList(paths)) throw new TypeError("Invalid file list");
        return attempt(() =>
          remote.move(
            target(event, request.sessionId),
            paths.map(remotePath),
            remotePath(request.directory),
          ),
        );
      },
      [fileBrowserIpc.remoteDelete]: (event, payload) => {
        const request = record(payload);
        const paths = request.paths;
        if (!isFilePathList(paths)) throw new TypeError("Invalid file list");
        return attempt(() =>
          remote.remove(
            target(event, request.sessionId),
            paths.map(remotePath),
          ),
        );
      },
      [fileBrowserIpc.remoteDownload]: async (event, payload) => {
        const request = record(payload);
        if (!isFilePathList(request.paths))
          throw new TypeError("Invalid file list");
        const connection = target(event, request.sessionId);
        const files = request.paths.map(remotePath);
        const window = windowOf(event);
        const choice = await (window
          ? dialog.showOpenDialog(window, {
              properties: ["openDirectory", "createDirectory"],
            })
          : dialog.showOpenDialog({
              properties: ["openDirectory", "createDirectory"],
            }));
        if (choice.canceled || !choice.filePaths[0]) return { ok: true };
        const destination = choice.filePaths[0];
        return attempt(async () => {
          for (const file of files) {
            const name = path.posix.basename(file);
            const local = await freeLocalPath(destination, name);
            await track(
              event.sender as unknown as WebContents,
              "download",
              name,
              (progress, signal) =>
                remote.download(connection, file, local, progress, signal),
            );
          }
          return destination;
        });
      },
      [fileBrowserIpc.remoteUpload]: async (event, payload) => {
        const request = record(payload);
        const connection = target(event, request.sessionId);
        const directory = remotePath(request.directory);
        const window = windowOf(event);
        const options_ = {
          properties: ["openFile", "multiSelections"] as Array<
            "openFile" | "multiSelections"
          >,
        };
        const choice = await (window
          ? dialog.showOpenDialog(window, options_)
          : dialog.showOpenDialog(options_));
        if (choice.canceled) return { ok: true };
        return attempt(async () => {
          for (const local of choice.filePaths) {
            const name = path.basename(local);
            await track(
              event.sender as unknown as WebContents,
              "upload",
              name,
              (progress, signal) =>
                remote.upload(
                  connection,
                  local,
                  path.posix.join(directory, name),
                  progress,
                  signal,
                ),
            );
          }
        });
      },
      [fileBrowserIpc.remoteEdit]: (event, payload) => {
        const request = record(payload);
        return attempt(() =>
          editRemote(
            target(event, request.sessionId),
            event.sender as unknown as WebContents,
            remotePath(request.path),
          ),
        );
      },
      [fileBrowserIpc.cancelTransfer]: (_event, payload) => {
        if (typeof payload === "string") cancel(payload);
        return { ok: true };
      },
    },
    () =>
      options.operationalEvents.write({
        name: "boundary.rejected",
        boundary: "ipc",
        reason: "untrusted-sender",
      }),
  );
}
