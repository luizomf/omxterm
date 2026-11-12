import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import path from "node:path";
import type { LeaseAdapter } from "../installed-packages/native-leases";
import {
  exactLayoutKeys,
  isSavedLayout,
  type SavedLayout,
} from "../shared/terminal-layout";

/** Declared by an enabled extension (Saved Layout) to turn reopening on. */
export const REOPEN_LAYOUT_CAPABILITY = "terminal.reopenLayout.v1";
export const LAYOUT_SESSION_MAX_WINDOWS = 16;
const MAX_BYTES = 4 * 1024 * 1024;

export type LayoutSession = { version: 1; windows: SavedLayout[] };

export function isLayoutSession(value: unknown): value is LayoutSession {
  return (
    exactLayoutKeys(value, ["version", "windows"]) &&
    value.version === 1 &&
    Array.isArray(value.windows) &&
    value.windows.length > 0 &&
    value.windows.length <= LAYOUT_SESSION_MAX_WINDOWS &&
    value.windows.every(isSavedLayout)
  );
}

// The arrangement, without the capture time, decides whether anything changed.
const arrangement = (windows: readonly SavedLayout[]) =>
  JSON.stringify(windows.map(({ savedAt: _savedAt, ...layout }) => layout));

/**
 * Remembers every terminal window's layout while reopening is on, and hands it
 * back once at startup. Only the process holding the profile's lease takes
 * part, so a second OMXTerm on the same profile neither reopens nor overwrites.
 * Nothing is written while quitting, for an empty window set, or when any
 * window can't be captured; the last good arrangement stays.
 */
export function createLayoutSession<Window>(options: {
  directory: string;
  platform: string;
  leases?: LeaseAdapter;
  enabled(): boolean;
  windows(): Window[];
  capture(window: Window): Promise<SavedLayout>;
  quitting(): boolean;
  interval?: number;
}) {
  const file = path.join(options.directory, "last.json");
  const marker = path.join(options.directory, "reopening");
  let owner = false;
  let lease: unknown;
  let last: string | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let saving: Promise<void> | undefined;
  let disposed = false;

  const exists = (target: string) =>
    fs.lstat(target).then(
      () => true,
      () => false,
    );
  async function read(): Promise<SavedLayout[]> {
    try {
      const handle = await fs.open(file, "r");
      try {
        const { size } = await handle.stat();
        if (size > MAX_BYTES) return [];
        const value: unknown = JSON.parse(await handle.readFile("utf8"));
        return isLayoutSession(value)
          ? value.windows.filter(
              (window) => window.platform === options.platform,
            )
          : [];
      } finally {
        await handle.close();
      }
    } catch {
      return [];
    }
  }
  async function write(windows: SavedLayout[]) {
    const temporary = path.join(options.directory, `last-${randomUUID()}.tmp`);
    const bytes = JSON.stringify({
      version: 1,
      windows,
    } satisfies LayoutSession);
    if (Buffer.byteLength(bytes) > MAX_BYTES) return;
    try {
      await fs.writeFile(temporary, bytes, { mode: 0o600, flag: "wx" });
      await fs.rename(temporary, file);
    } catch {
      await fs.rm(temporary, { force: true }).catch(() => {});
    }
  }
  async function save() {
    if (!owner || disposed || options.quitting() || !options.enabled()) return;
    const windows = options.windows();
    if (windows.length === 0 || windows.length > LAYOUT_SESSION_MAX_WINDOWS)
      return;
    const captured = await Promise.allSettled(windows.map(options.capture));
    // A window that opened, closed or failed meanwhile makes this a partial
    // picture; keep the previous one and look again on the next tick.
    if (
      disposed ||
      options.quitting() ||
      !options.enabled() ||
      captured.some((result) => result.status === "rejected") ||
      options.windows().length !== windows.length
    )
      return;
    const layouts = captured.map(
      (result) => (result as PromiseFulfilledResult<SavedLayout>).value,
    );
    const next = arrangement(layouts);
    if (next === last) return;
    last = next;
    await write(layouts);
  }
  const tick = () => {
    saving ??= save().finally(() => {
      saving = undefined;
    });
    return saving;
  };
  async function forget() {
    last = undefined;
    await fs.rm(file, { force: true }).catch(() => {});
  }

  function refresh() {
    if (!owner || disposed) return;
    if (!options.enabled()) {
      clearInterval(timer);
      timer = undefined;
      void forget();
      return;
    }
    timer ??= setInterval(() => void tick(), options.interval ?? 3000);
    timer.unref?.();
  }

  return {
    /**
     * Claims the profile and returns the windows to reopen: none when another
     * process owns the profile, reopening is off, or the previous reopening
     * never finished (so a layout that crashes OMXTerm can't loop).
     */
    async start(reopen: boolean): Promise<SavedLayout[]> {
      try {
        await fs.mkdir(options.directory, { recursive: true, mode: 0o700 });
        lease = await options.leases?.tryAcquire(
          path.join(options.directory, "session.lock"),
          true,
        );
        // Held until the process exits; the OS releases it after a crash.
        owner = !!lease;
      } catch {
        owner = false;
      }
      if (!owner) return [];
      if (!options.enabled()) {
        await forget();
        return [];
      }
      if (await exists(marker)) {
        await fs.rm(marker, { force: true }).catch(() => {});
        return [];
      }
      if (!reopen) return [];
      const windows = await read();
      if (windows.length > 0)
        await fs.writeFile(marker, "", { mode: 0o600 }).catch(() => {});
      return windows;
    },
    /** The reopened windows exist; start remembering changes. */
    async reopened() {
      await fs.rm(marker, { force: true }).catch(() => {});
      refresh();
    },
    /** Reopening was turned on or off (an extension changed). */
    refresh,
    /** Saves now if something changed (tests and window close). */
    flush: tick,
    dispose() {
      disposed = true;
      clearInterval(timer);
      timer = undefined;
    },
  };
}
