import type { IpcMain } from "electron";
import { startCommandLibrary } from "./command-wiring";
import { startHighlightSettings } from "./highlight-wiring";
import type { OperationalEventLog } from "./operational-events";
import { startSavedSessions } from "./saved-session-wiring";
import type { IpcEvent } from "./terminal-ipc-types";

// Loads the Application Data documents (sessions, highlighting, commands) and
// serves their IPC to trusted windows.
export async function startApplicationDataServices(options: {
  readonly ipcMain: IpcMain;
  readonly homeDirectory: string;
  readonly isTrustedSender: (event: IpcEvent) => boolean;
  readonly operationalEvents: Pick<OperationalEventLog, "write">;
  readonly startupConnection: string | undefined;
}) {
  const { startupConnection, ...shared } = options;
  const savedSessions = await startSavedSessions({
    ...shared,
    ...(startupConnection === undefined ? {} : { startupConnection }),
  });
  const highlightSettings = await startHighlightSettings(shared);
  await startCommandLibrary(shared);
  return { savedSessions, highlightSettings };
}
