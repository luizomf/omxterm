import {
  FILES_ENTRY_DRAG_TYPE,
  FILES_TERMINAL_DRAG_TYPE,
  isFilesDragClaim,
  isFilesTerminalDrag,
  type FilesDragResult,
  type FilesTerminalDragBridge,
} from "../shared/files-terminal-drag";

/** Narrow composition seam, not installed as a live drop target in this slice.
 * The protected consumer must synchronously capture the exact selected/focused
 * live pane + Surface and selection revision from this event's visible area.
 * Its continuation must never reacquire a successor or move focus on refusal.
 */
export function claimFilesTerminalDrop(
  event: DragEvent,
  bridge: FilesTerminalDragBridge,
  capture: (event: DragEvent) =>
    | {
        revision: number;
        isCurrent(): boolean;
        completed(result: FilesDragResult): void;
      }
    | undefined,
): boolean {
  const data = event.dataTransfer;
  if (!data || !isFilesTerminalDrag(data)) return false;
  const value = {
    ticket: data.getData(FILES_TERMINAL_DRAG_TYPE),
    entryToken: data.getData(FILES_ENTRY_DRAG_TYPE),
  };
  if (!isFilesDragClaim(value)) return false;
  const target = capture(event); // No await before capture AND main's claim.
  if (!target) return false;
  const revision = target.revision;
  if (!bridge.claim(value)) return false;
  event.preventDefault();
  event.stopPropagation();
  // Do not defer the claim to this continuation: child dragend may run first.
  void Promise.resolve()
    .then(async () => {
      if (!target.isCurrent()) return { status: "refused" } as const;
      return bridge.handoff(value.ticket, revision);
    })
    .catch(() => ({ status: "unknown" }) as const)
    .then((result) => target.completed(result));
  return true;
}
