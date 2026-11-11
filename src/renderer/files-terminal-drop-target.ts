import { claimFilesTerminalDrop } from "./files-terminal-drop";
import {
  FILES_TERMINAL_DRAG_TYPE,
  isFilesTerminalDrag,
  type FilesTerminalDragBridge,
} from "../shared/files-terminal-drag";
import type { TerminalTabs } from "./terminal-tabs";
import type { RendererLanguage } from "./renderer-language";
import type { SnippetTarget } from "./snippet-target";

/** Retains the drop-turn Surface until the ordinary semantic owner consumes it.
 * The ticket identifies this private capture, never a later selected target.
 */
export function createFilesTerminalDropTarget(
  document: Document,
  bridge: FilesTerminalDragBridge | undefined,
  tabs: TerminalTabs,
  language: RendererLanguage,
  blocked: () => boolean,
) {
  let disposed = false;
  let pending:
    { ticket: string; target: SnippetTarget; taken: boolean } | undefined;
  let area: HTMLElement | undefined;
  let refusal: ReturnType<typeof setTimeout> | undefined;
  const hint = document.createElement("div");
  hint.className = "files-terminal-drop-hint ui-overlay";
  hint.setAttribute("role", "status");
  const label = () => {
    hint.textContent = language.t(
      refusal ? "terminal.filesDropRefused" : "terminal.filesDropCandidate",
    );
  };
  const removeLanguage = language.bind(label);
  const clear = () => {
    if (refusal) {
      clearTimeout(refusal);
      refusal = undefined;
      label();
    }
    area?.classList.remove("files-terminal-drop-candidate");
    area = undefined;
    hint.remove();
  };
  const eligible = (event: DragEvent) =>
    !disposed &&
    !pending &&
    bridge &&
    !blocked() &&
    event.dataTransfer &&
    isFilesTerminalDrag(event.dataTransfer)
      ? tabs.fileDropArea(event)
      : undefined;
  return {
    clear,
    over(event: DragEvent) {
      const next = eligible(event);
      if (event.dataTransfer)
        event.dataTransfer.dropEffect = next ? "copy" : "none";
      if (area !== next) clear();
      if (next) {
        area = next;
        area.classList.add("files-terminal-drop-candidate");
        area.append(hint);
      }
    },
    drop(event: DragEvent) {
      const dropArea = eligible(event);
      clear();
      if (!dropArea || !bridge) return;
      const claimed = claimFilesTerminalDrop(event, bridge, () => {
        const original = tabs.captureSnippetTarget();
        if (!original?.isCurrent?.()) return undefined;
        const revision = tabs.selectionRevision();
        const focused = document.activeElement;
        const target: SnippetTarget = {
          ...original,
          isCurrent: () =>
            !disposed &&
            !blocked() &&
            revision === tabs.selectionRevision() &&
            original.isCurrent?.() === true &&
            document.activeElement === focused,
        };
        const capture = {
          ticket: event.dataTransfer!.getData(FILES_TERMINAL_DRAG_TYPE),
          target,
          taken: false,
        };
        pending = capture;
        return {
          revision,
          completed() {
            if (pending === capture) pending = undefined;
          },
        };
      });
      if (claimed) return;
      pending = undefined;
      // The candidate promised insertion. Main holds no gesture for a drag from
      // another window's Files, or after its deadline: say so where it was dropped.
      refusal = setTimeout(clear, 5000);
      label();
      dropArea.append(hint);
    },
    takeTarget(ticket: string) {
      if (
        !pending ||
        pending.taken ||
        pending.ticket !== ticket ||
        !pending.target.isCurrent?.()
      )
        return undefined;
      pending.taken = true;
      return pending.target;
    },
    dispose() {
      disposed = true;
      pending = undefined;
      clear();
      removeLanguage();
    },
  };
}
