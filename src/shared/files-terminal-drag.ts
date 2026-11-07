// Internal Files transport, not an extension drag SDK or a paste route.
export const FILES_ENTRY_DRAG_TYPE = "application/x-omxterm-files-entry";
export const FILES_TERMINAL_DRAG_TYPE = "application/x-omxterm-files-terminal";
export const filesTerminalDragIpc = {
  start: "files-terminal-drag:start",
  end: "files-terminal-drag:end",
  claim: "files-terminal-drag:claim",
  handoff: "files-terminal-drag:handoff",
} as const;
export type FilesDragEntry = {
  path: string;
  kind: "file" | "directory" | "link";
  entryToken: string;
};
export type FilesDragClaim = { ticket: string; entryToken: string };
export type FilesDragResult = {
  status: "refused" | "unknown" | "accepted";
};
export interface FilesTerminalDragBridge {
  // Must settle synchronously in the drop turn, before dragend or any await.
  claim(value: FilesDragClaim): boolean;
  handoff(ticket: string, revision: number): Promise<FilesDragResult>;
}
export function isFilesDragTicket(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u.test(value)
  );
}
export function isFilesEntryToken(value: unknown): value is string {
  return typeof value === "string" && /^[1-9][0-9]{0,15}$/u.test(value);
}
export function isFilesDragClaim(value: unknown): value is FilesDragClaim {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return (
    Object.keys(input).sort().join() === "entryToken,ticket" &&
    isFilesDragTicket(input.ticket) &&
    isFilesEntryToken(input.entryToken)
  );
}
/** Candidate only: the exact ticket is authenticated by main at drop. */
export function isFilesTerminalDrag(
  data: Pick<DataTransfer, "types" | "files">,
): boolean {
  const types = Array.from(data.types);
  return (
    data.files.length === 0 &&
    types.length >= 2 &&
    types.length <= 3 &&
    new Set(types).size === types.length &&
    types.includes(FILES_ENTRY_DRAG_TYPE) &&
    types.includes(FILES_TERMINAL_DRAG_TYPE) &&
    types.every((type) =>
      [
        FILES_ENTRY_DRAG_TYPE,
        FILES_TERMINAL_DRAG_TYPE,
        "application/x-chromium-drag-id",
      ].includes(type),
    )
  );
}
