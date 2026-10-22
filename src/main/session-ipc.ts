import { readFile, writeFile } from "node:fs/promises";
import { isSavedSessionId } from "../shared/terminal-launch";
import { isSessionFileChoice, sessionIpc } from "../shared/session-ipc";
import { SessionValidationError } from "../shared/saved-sessions";
import type { SavedSessionService } from "./saved-sessions";
import type { IpcEvent, IpcMainPort } from "./terminal-ipc-types";
import { registerTrustedHandlers } from "./trusted-ipc";

const MAX_IMPORT_BYTES = 4 * 1024 * 1024;

export interface SessionIpcDialogs {
  chooseOpenPath(
    event: IpcEvent,
    kind: "identity-file" | "directory" | "program" | "import",
  ): Promise<string | undefined>;
  chooseSavePath(
    event: IpcEvent,
    defaultName: string,
  ): Promise<string | undefined>;
}

// Errors crossing to the renderer carry a short user-facing reason only.
export class SessionIpcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionIpcError";
  }
}

export function registerSessionIpc(
  ipcMain: IpcMainPort,
  isTrusted: (event: IpcEvent) => boolean,
  service: SavedSessionService,
  dialogs: SessionIpcDialogs,
  onRejected?: () => void,
  // The --ssh target, handed to the first renderer that asks.
  consumeStartupConnection: () => string | undefined = () => undefined,
): () => void {
  const guard = async <T>(action: () => Promise<T>): Promise<T> => {
    try {
      return await action();
    } catch (cause) {
      if (cause instanceof SessionValidationError)
        throw new SessionIpcError(cause.message);
      throw new SessionIpcError(
        cause instanceof Error ? cause.message.slice(0, 300) : "Request failed",
      );
    }
  };
  const requireId = (payload: unknown) => {
    if (!isSavedSessionId(payload))
      throw new SessionIpcError("Invalid identifier");
    return payload;
  };
  return registerTrustedHandlers(
    ipcMain,
    isTrusted,
    {
      [sessionIpc.list]: () => service.current(),
      [sessionIpc.startupConnection]: () => consumeStartupConnection() ?? null,
      [sessionIpc.saveSession]: (_event, payload) =>
        guard(() => service.saveSession(payload)),
      [sessionIpc.deleteSession]: (_event, payload) =>
        guard(() => service.deleteSession(requireId(payload))),
      [sessionIpc.saveFolder]: (_event, payload) =>
        guard(() => service.saveFolder(payload)),
      [sessionIpc.deleteFolder]: (_event, payload) =>
        guard(() => service.deleteFolder(requireId(payload))),
      [sessionIpc.importSshConfig]: () =>
        guard(() => service.importSshConfig()),
      [sessionIpc.chooseFile]: (event, payload) => {
        if (!isSessionFileChoice(payload))
          throw new SessionIpcError("Invalid file choice");
        return dialogs
          .chooseOpenPath(event, payload)
          .then((chosen) => chosen ?? null);
      },
      [sessionIpc.importFile]: (event) =>
        guard(async () => {
          const chosen = await dialogs.chooseOpenPath(event, "import");
          if (!chosen) return null;
          const bytes = await readFile(chosen);
          if (bytes.byteLength > MAX_IMPORT_BYTES)
            throw new SessionIpcError("The file is too large");
          const document = parseExport(bytes);
          return service.importDocument(document);
        }),
      [sessionIpc.exportFile]: (event) =>
        guard(async () => {
          const chosen = await dialogs.chooseSavePath(
            event,
            "omxterm-sessions.json",
          );
          if (!chosen) return false;
          await writeFile(chosen, service.exportDocument(), { mode: 0o600 });
          return true;
        }),
    },
    onRejected,
  );
}

function parseExport(bytes: Uint8Array): unknown {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new SessionIpcError("The file is not an OMXTerm sessions export");
  }
  if (
    typeof value !== "object" ||
    value === null ||
    (value as Record<string, unknown>).format !== "omxterm-sessions" ||
    (value as Record<string, unknown>).version !== 1
  )
    throw new SessionIpcError("The file is not an OMXTerm sessions export");
  const { folders, sessions } = value as Record<string, unknown>;
  return { folders, sessions };
}
