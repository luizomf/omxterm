import { terminalIpc } from "../shared/terminal-ipc";
import {
  isTerminalContextMenuRequest,
  isTerminalExportSaveRequest,
} from "../shared/terminal-contract";
import type { RejectBoundary } from "./terminal-ipc-boundaries";
import type {
  IpcEvent,
  IpcMainPort,
  TerminalIpcControllerOptions,
} from "./terminal-ipc-types";

export interface TerminalExportOwner {
  saveTerminalExport(payload?: unknown): Promise<void>;
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
    return owner.saveTerminalExport(payload);
  });
  return () => ipc.removeHandler(terminalIpc.exportSave);
}

// The context menu reports its UI target, selection state and opaque context.
export function contextMenuBoundary(
  options: Pick<TerminalIpcControllerOptions, "showClipboardContextMenu">,
  reject: RejectBoundary,
): (payload?: unknown) => void {
  return (payload) => {
    if (isTerminalContextMenuRequest(payload))
      options.showClipboardContextMenu(payload);
    else reject("clipboard", "invalid-payload");
  };
}

// Main owns the native save dialog and write; the renderer only supplies the
// requested text, which never reaches operational logs.
export function exportBoundary(
  options: Pick<TerminalIpcControllerOptions, "saveTerminalExport">,
  reject: RejectBoundary,
  isOwnerAlive: () => boolean,
): (payload?: unknown) => Promise<void> {
  return async (payload) => {
    if (!isTerminalExportSaveRequest(payload) || !options.saveTerminalExport) {
      reject("ipc", "invalid-payload");
      throw new TypeError("Invalid terminal export request");
    }
    if (isOwnerAlive()) await options.saveTerminalExport(payload, isOwnerAlive);
  };
}
