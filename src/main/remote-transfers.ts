import { randomUUID } from "node:crypto";
import { watch, type FSWatcher } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { shell, type WebContents } from "electron";
import { fileBrowserIpc, type TransferEvent } from "../shared/file-browser";
import type { RemoteFiles, RemoteTarget } from "./remote-files";

const PROGRESS_INTERVAL_MS = 150;
const SAVE_DELAY_MS = 400;

// Transfers with progress events and cancellation, and remote editing: a
// private temporary copy opened in the local default application whose
// saves are uploaded over the remote file.
export function createRemoteTransfers(
  remote: RemoteFiles,
  temporaryDirectory: string,
) {
  const transfers = new Map<string, AbortController>();
  const editing = new Map<string, { watcher: FSWatcher; directory: string }>();
  const report = (sender: WebContents, event: TransferEvent) => {
    if (!sender.isDestroyed()) sender.send(fileBrowserIpc.transfer, event);
  };
  // Runs one transfer with throttled progress events and a cancel handle.
  const track = async (
    sender: WebContents,
    direction: TransferEvent["direction"],
    name: string,
    run: (
      progress: (transferred: number, total?: number) => void,
      signal: AbortSignal,
    ) => Promise<void>,
  ) => {
    const id = randomUUID();
    const controller = new AbortController();
    transfers.set(id, controller);
    let last = 0;
    const base = { id, name, direction };
    report(sender, { ...base, transferred: 0, state: "running" });
    try {
      await run((transferred, total) => {
        const now = Date.now();
        if (now - last < PROGRESS_INTERVAL_MS) return;
        last = now;
        report(sender, {
          ...base,
          transferred,
          ...(total === undefined ? {} : { total }),
          state: "running",
        });
      }, controller.signal);
      report(sender, { ...base, transferred: 0, state: "done" });
    } catch (cause) {
      report(sender, {
        ...base,
        transferred: 0,
        state: controller.signal.aborted ? "cancelled" : "failed",
        ...(controller.signal.aborted ? {} : { error: remote.message(cause) }),
      });
      throw cause;
    } finally {
      transfers.delete(id);
    }
  };

  const editRemote = async (
    connection: RemoteTarget,
    sender: WebContents,
    file: string,
  ) => {
    const directory = path.join(
      temporaryDirectory,
      "omxterm-remote-edit",
      randomUUID(),
    );
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const local = path.join(directory, path.posix.basename(file));
    await track(
      sender,
      "download",
      path.posix.basename(file),
      (progress, signal) =>
        remote.download(connection, file, local, progress, signal),
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Each save is uploaded over the remote file after a short pause.
    const watcher = watch(local, () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void track(
          sender,
          "upload",
          path.posix.basename(file),
          (progress, signal) =>
            remote.upload(connection, local, file, progress, signal, false),
        ).catch(() => undefined);
      }, SAVE_DELAY_MS);
    });
    editing.set(local, { watcher, directory });
    const failure = await shell.openPath(local);
    if (failure !== "") throw new Error(failure.slice(0, 512));
  };

  return {
    track,
    editRemote,
    cancel: (id: string) => transfers.get(id)?.abort(),
    // Closes watchers and removes the temporary copies.
    dispose() {
      for (const { watcher, directory } of editing.values()) {
        watcher.close();
        void rm(directory, { recursive: true, force: true });
      }
      editing.clear();
    },
  };
}
