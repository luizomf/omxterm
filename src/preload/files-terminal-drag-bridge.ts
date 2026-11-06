import {
  filesTerminalDragIpc,
  isFilesDragClaim,
  isFilesDragTicket,
  type FilesTerminalDragBridge,
} from "../shared/files-terminal-drag";
import { isSelectionRevision } from "../shared/semantic-input";

export function createFilesTerminalDragBridge(ipc: {
  sendSync(channel: string, value: unknown): unknown;
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
}): FilesTerminalDragBridge {
  return {
    claim(value) {
      if (!isFilesDragClaim(value)) return false;
      try {
        return ipc.sendSync(filesTerminalDragIpc.claim, value) === true;
      } catch {
        return false;
      }
    },
    async handoff(ticket, revision) {
      if (!isFilesDragTicket(ticket) || !isSelectionRevision(revision))
        return { status: "refused" };
      try {
        const value = await ipc.invoke(
          filesTerminalDragIpc.handoff,
          ticket,
          revision,
        );
        if (
          value &&
          typeof value === "object" &&
          Object.keys(value).join() === "status" &&
          "status" in value &&
          (value.status === "accepted" || value.status === "refused")
        )
          return { status: value.status };
        return { status: "unknown" };
      } catch {
        return { status: "unknown" };
      }
    },
  };
}
