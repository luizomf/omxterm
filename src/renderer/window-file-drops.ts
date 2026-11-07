import {
  FILES_ENTRY_DRAG_TYPE,
  FILES_TERMINAL_DRAG_TYPE,
} from "../shared/files-terminal-drag";
import { TERMINAL_TAB_DRAG_DATA_TYPE } from "./terminal-tabs";
import { createFilesTerminalDropTarget } from "./files-terminal-drop-target";

/** Own document navigation exclusion and keep Files, tab and native-file routes distinct. */
export function installWindowFileDrops(
  document: Document,
  blocked: () => boolean,
  inject: (text: string) => void,
  format: ((files: readonly File[]) => string) | undefined,
  filesTarget: ReturnType<typeof createFilesTerminalDropTarget>,
) {
  const isInternalTabDrag = (event: DragEvent) =>
    event.dataTransfer?.types?.includes(TERMINAL_TAB_DRAG_DATA_TYPE) ?? false;
  const isFilesEntryDrag = (event: DragEvent) =>
    [...(event.dataTransfer?.types ?? [])].some(
      (type) =>
        type === FILES_ENTRY_DRAG_TYPE || type === FILES_TERMINAL_DRAG_TYPE,
    );
  const onDragOver = (event: DragEvent) => {
    event.preventDefault();
    // MIME/area is only a candidate; main authenticates the single-use ticket
    // at drop. Mixtures never fall through to native files/tab handling.
    const filesEntry = isFilesEntryDrag(event);
    if (filesEntry) filesTarget.over(event);
    else filesTarget.clear();
    if (blocked() || filesEntry || !isInternalTabDrag(event))
      event.stopPropagation();
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    if (isFilesEntryDrag(event)) {
      filesTarget.drop(event);
      event.stopPropagation();
      return;
    }
    filesTarget.clear();
    if (blocked()) {
      event.stopPropagation();
      return;
    }
    if (isInternalTabDrag(event)) return;
    event.stopPropagation();
    const files = event.dataTransfer?.files;
    if (!files?.length || !format) return;
    const insertion = format([...files]);
    if (insertion.length > 0) inject(insertion);
  };
  document.addEventListener("dragover", onDragOver, true);
  document.addEventListener("dragleave", filesTarget.clear, true);
  document.addEventListener("dragend", filesTarget.clear, true);
  document.addEventListener("drop", onDrop, true);
  return () => {
    document.removeEventListener("dragover", onDragOver, true);
    document.removeEventListener("dragleave", filesTarget.clear, true);
    document.removeEventListener("dragend", filesTarget.clear, true);
    document.removeEventListener("drop", onDrop, true);
    filesTarget.dispose();
  };
}
