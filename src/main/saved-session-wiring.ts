import { app, BrowserWindow, dialog, type IpcMain } from "electron";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { sessionIpc } from "../shared/session-ipc";
import { resolveApplicationDataDirectory } from "./application-data";
import { findExecutable } from "./executable-lookup";
import type { OperationalEventLog } from "./operational-events";
import {
  createSavedSessionService,
  type SavedSessionService,
} from "./saved-sessions";
import type { CredentialStore } from "./credential-store";
import { registerSessionIpc } from "./session-ipc";
import {
  createSessionPasswords,
  registerSessionPasswordIpc,
} from "./session-passwords";
import { startSshAskpass, type SshAskpass } from "./ssh-askpass";
import { registerHostKeyIpc, userKnownHostsFile } from "./ssh-known-hosts";
import type { IpcEvent, IpcMainPort } from "./terminal-ipc-types";

// Creates the Saved Session service, loads sessions.json, keeps every window's
// Sessions sidebar current and serves its IPC requests with native pickers.
export async function startSavedSessions(options: {
  readonly ipcMain: IpcMain;
  readonly homeDirectory: string;
  readonly isTrustedSender: (event: IpcEvent) => boolean;
  readonly operationalEvents: Pick<OperationalEventLog, "write">;
  readonly startupConnection?: string;
  readonly credentials: CredentialStore;
}): Promise<SavedSessionService> {
  const { homeDirectory, operationalEvents } = options;
  let startupConnection = options.startupConnection;
  const control = sshControlDirectory(homeDirectory);
  const askpass = await startAskpass(control.controlDirectory, (id) =>
    options.credentials.get(id),
  );
  const passwords = await createSessionPasswords(options.credentials, askpass);
  const service = createSavedSessionService({
    directory: resolveApplicationDataDirectory(process.env, homeDirectory),
    homeDirectory,
    platform: process.platform,
    sshExecutable: () => {
      const executable = findExecutable(
        process.platform === "win32" ? "ssh.exe" : "ssh",
        process.env,
        process.platform,
      );
      if (!executable)
        throw new Error("The OpenSSH client (ssh) was not found on PATH");
      return executable;
    },
    ...control,
    passwordEnvironment: (id) => passwords.environment(id),
  });
  const loaded = await service.load();
  void passwords.reconcile(service.current()).catch(() => {});
  if (loaded.recovered)
    operationalEvents.write({
      name: "application-data.recovered",
      document: "sessions",
      reason: loaded.recovered.reason,
    });
  service.subscribe((document) => {
    void passwords.reconcile(document).catch(() => {});
    for (const window of BrowserWindow.getAllWindows())
      if (!window.webContents.isDestroyed())
        window.webContents.send(sessionIpc.changed, document);
  });
  const ownerOf = (event: IpcEvent) =>
    BrowserWindow.fromWebContents(event.sender as Electron.WebContents);
  registerSessionIpc(
    options.ipcMain as unknown as IpcMainPort,
    options.isTrustedSender,
    service,
    {
      async chooseOpenPath(event, kind) {
        const owner = ownerOf(event);
        const dialogOptions: Electron.OpenDialogOptions = {
          properties:
            kind === "directory"
              ? ["openDirectory", "showHiddenFiles"]
              : ["openFile", "showHiddenFiles"],
          ...(kind === "import"
            ? { filters: [{ name: "JSON", extensions: ["json"] }] }
            : {}),
          ...(kind === "identity-file"
            ? { defaultPath: path.join(homeDirectory, ".ssh") }
            : {}),
        };
        const result = owner
          ? await dialog.showOpenDialog(owner, dialogOptions)
          : await dialog.showOpenDialog(dialogOptions);
        return result.canceled ? undefined : result.filePaths[0];
      },
      async chooseSavePath(event, defaultName) {
        const owner = ownerOf(event);
        const dialogOptions = {
          defaultPath: path.join(homeDirectory, defaultName),
        };
        const result = owner
          ? await dialog.showSaveDialog(owner, dialogOptions)
          : await dialog.showSaveDialog(dialogOptions);
        return result.canceled ? undefined : result.filePath;
      },
    },
    () =>
      operationalEvents.write({
        name: "boundary.rejected",
        boundary: "ipc",
        reason: "untrusted-sender",
      }),
    () => {
      const target = startupConnection;
      startupConnection = undefined;
      return target;
    },
  );
  const rejected = () =>
    operationalEvents.write({
      name: "boundary.rejected",
      boundary: "ipc",
      reason: "untrusted-sender",
    });
  registerSessionPasswordIpc(
    options.ipcMain as unknown as IpcMainPort,
    options.isTrustedSender,
    passwords,
    () => service.current(),
    rejected,
  );
  registerHostKeyIpc(
    options.ipcMain as unknown as IpcMainPort,
    options.isTrustedSender,
    {
      resolve: (reference) =>
        reference.kind === "quick-ssh"
          ? service.quickConnect(reference.target)
          : service
              .current()
              .sessions.find((session) => session.id === reference.id),
      sshKeygen: () =>
        findExecutable(
          process.platform === "win32" ? "ssh-keygen.exe" : "ssh-keygen",
          process.env,
          process.platform,
        ),
      knownHostsFile: userKnownHostsFile(homeDirectory),
    },
    rejected,
  );
  return service;
}

// Stored passwords reach ssh through SSH_ASKPASS, which needs the private
// socket directory; Windows' OpenSSH keeps typing at ssh's prompt.
async function startAskpass(
  directory: string | undefined,
  lookup: (credentialId: string) => Promise<string | undefined>,
): Promise<SshAskpass | undefined> {
  if (process.platform === "win32" || directory === undefined) return undefined;
  try {
    const askpass = await startSshAskpass({
      directory,
      executable: process.execPath,
      lookup,
    });
    app.once("will-quit", () => askpass.dispose());
    return askpass;
  } catch {
    return undefined;
  }
}

// ControlMaster sockets need a short private path (sun_path is ~104 bytes).
function sshControlDirectory(homeDirectory: string): {
  readonly controlDirectory?: string;
} {
  if (process.platform === "win32") return {};
  const root =
    process.platform === "darwin"
      ? path.join(homeDirectory, "Library", "Caches", "OMXTerm")
      : process.env.XDG_RUNTIME_DIR
        ? path.join(process.env.XDG_RUNTIME_DIR, "omxterm")
        : path.join(homeDirectory, ".cache", "omxterm");
  const directory = path.join(root, "ssh");
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    return { controlDirectory: directory };
  } catch {
    return {};
  }
}
