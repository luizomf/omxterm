import { randomUUID } from "node:crypto";
import type { BrowserWindow } from "electron";
import type { ExtensionViewRequestContext } from "./extension-view-host";
import {
  formatFilePathInsertion,
  isFilePathPlatform,
  MAX_INSERTED_PATH_LENGTH,
} from "../shared/file-path-insertion";
import { isSelectionRevision } from "../shared/semantic-input";
import {
  isFilesDragClaim,
  isFilesEntryToken,
  type FilesDragEntry,
  type FilesDragResult,
} from "../shared/files-terminal-drag";

// Composition must supply #768's captured-target quoting/Protected Paste owner.
// The transport does not send text, focus a pane, or expose a path to core IPC.
export type FilesTerminalDropConsumer = (input: {
  entry: Readonly<FilesDragEntry>;
  source: ExtensionViewRequestContext;
  revision: number;
  signal: AbortSignal;
}) => Promise<FilesDragResult>;
export const FILES_DRAG_LIFETIME_MS = 10_000;
type Gesture = {
  ticket: string;
  entry: FilesDragEntry;
  source: ExtensionViewRequestContext;
  consume: FilesTerminalDropConsumer;
  signal: AbortSignal;
  abort: AbortController;
  phase: "dragging" | "claimed" | "handing-off";
  expires: number;
  cleanup(): void;
};
/** One path, one gesture/claim, one deadline per actual owner window. */
export function createFilesTerminalDrag(window: BrowserWindow) {
  let current: Gesture | undefined;
  const owner = window.webContents;
  const windowLive = () =>
    !window.isDestroyed() &&
    !owner.isDestroyed() &&
    window.webContents === owner &&
    window.isVisible() &&
    !window.isMinimized() &&
    window.isFocused();
  const revoke = (id?: string) => {
    if (!current || (id !== undefined && current.source.id !== id)) return;
    const old = current;
    current = undefined;
    old.abort.abort();
    old.cleanup();
  };
  const live = (gesture: Gesture) =>
    current === gesture &&
    windowLive() &&
    performance.now() < gesture.expires &&
    !gesture.signal.aborted &&
    gesture.source.isCurrentVisible();
  return {
    revoke,
    start(
      value: unknown,
      source: ExtensionViewRequestContext,
      signal: AbortSignal,
      consume: FilesTerminalDropConsumer,
    ): string | null {
      // Replace, never accumulate abandoned gestures, including claimed ones.
      revoke();
      if (!value || typeof value !== "object" || Array.isArray(value))
        return null;
      const input = value as Record<string, unknown>;
      if (
        Object.keys(input).sort().join() !== "entryToken,kind,path" ||
        !isFilesEntryToken(input.entryToken) ||
        !["file", "directory", "link"].includes(input.kind as string) ||
        typeof input.path !== "string" ||
        input.path.length > MAX_INSERTED_PATH_LENGTH ||
        /[\u0000-\u001f\u007f-\u009f]/u.test(input.path) ||
        !isFilePathPlatform(process.platform) ||
        !formatFilePathInsertion([input.path], process.platform) ||
        !windowLive() ||
        signal.aborted ||
        !source.isCurrentVisible()
      )
        return null;
      const abort = new AbortController();
      const ticket = randomUUID();
      const lost = () => {
        if (current?.ticket === ticket) revoke();
      };
      const timer = setTimeout(lost, FILES_DRAG_LIFETIME_MS);
      timer.unref?.();
      signal.addEventListener("abort", lost, { once: true });
      const gesture: Gesture = {
        ticket,
        entry: {
          path: input.path,
          kind: input.kind as FilesDragEntry["kind"],
          entryToken: input.entryToken,
        },
        source,
        consume,
        signal: AbortSignal.any([signal, abort.signal]),
        abort,
        phase: "dragging",
        expires: performance.now() + FILES_DRAG_LIFETIME_MS,
        cleanup() {
          clearTimeout(timer);
          signal.removeEventListener("abort", lost);
        },
      };
      current = gesture;
      return gesture.ticket;
    },
    end(id: string, ticket: unknown) {
      // Cross-WebContents drop claims before dragend. Only an unclaimed source
      // gesture ends here; later visibility/epoch/timeout loss still revokes all.
      if (
        current?.source.id === id &&
        current.ticket === ticket &&
        current.phase === "dragging"
      )
        revoke(id);
    },
    claim(value: unknown): boolean {
      const gesture = current;
      if (
        !isFilesDragClaim(value) ||
        !gesture ||
        gesture.phase !== "dragging" ||
        value.ticket !== gesture.ticket ||
        value.entryToken !== gesture.entry.entryToken
      )
        return false;
      if (!live(gesture)) {
        revoke();
        return false;
      }
      gesture.phase = "claimed";
      return true;
    },
    async handoff(
      ticket: unknown,
      revision: unknown,
    ): Promise<FilesDragResult> {
      const gesture = current;
      if (!gesture || gesture.ticket !== ticket || gesture.phase !== "claimed")
        return { status: "refused" };
      // Consume even a malformed first redemption; a claim is never reusable.
      gesture.phase = "handing-off";
      if (!isSelectionRevision(revision) || !live(gesture)) {
        revoke();
        return { status: "refused" };
      }
      const source: ExtensionViewRequestContext = {
        id: gesture.source.id,
        isCurrentVisible: () => live(gesture),
      };
      let stop!: () => void;
      const revoked = new Promise<FilesDragResult>((resolve) => {
        stop = () => resolve({ status: "unknown" });
        gesture.signal.addEventListener("abort", stop, { once: true });
      });
      try {
        const result = await Promise.race([
          gesture.consume({
            entry: Object.freeze({ ...gesture.entry }),
            source,
            revision,
            signal: gesture.signal,
          }),
          revoked,
        ]);
        // Consumer acceptance means Surface-owned input; transport revocation
        // after that point is not rollback. Consumer must check source + signal
        // at its final protected admission, never after-the-fact retargeting.
        return result?.status === "accepted" || result?.status === "refused"
          ? { status: result.status }
          : { status: "unknown" };
      } catch {
        return { status: "unknown" };
      } finally {
        gesture.signal.removeEventListener("abort", stop);
        if (current === gesture) revoke();
      }
    },
  };
}
