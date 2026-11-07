import { terminalIpc } from "../shared/terminal-ipc";
import { isTerminalExportSaveRequest } from "../shared/terminal-contract";
import type { RejectBoundary } from "./terminal-ipc-boundaries";
import type {
  IpcEvent,
  IpcMainPort,
  TerminalIpcControllerOptions,
} from "./terminal-ipc-types";

export interface TerminalExportOwner {
  saveExport(payload?: unknown): Promise<void>;
}

export function registerTerminalExportIpc(
  ipc: IpcMainPort,
  ownerFor: (event: IpcEvent) => TerminalExportOwner | undefined,
  rejectSender: () => void,
): () => void {
  ipc.handle(terminalIpc.exportSave, (event, payload) => {
    const owner = ownerFor(event);
    if (!owner) {
      rejectSender();
      throw new Error("Rejected export IPC from an untrusted sender");
    }
    return owner.saveExport(payload);
  });
  return () => ipc.removeHandler(terminalIpc.exportSave);
}

// Main owns the native save dialog and write; the renderer only supplies the
// requested text, which never reaches operational logs.
export function exportBoundary(
  options: Pick<TerminalIpcControllerOptions, "exportText">,
  reject: RejectBoundary,
  isOwnerAlive: () => boolean,
): (payload?: unknown) => Promise<void> {
  return async (payload) => {
    if (!isTerminalExportSaveRequest(payload) || !options.exportText) {
      reject("ipc", "invalid-payload");
      throw new TypeError("Invalid terminal export request");
    }
    if (isOwnerAlive()) await options.exportText(payload, isOwnerAlive);
  };
}
