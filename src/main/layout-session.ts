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

// `capture` rejects with EmptyLayoutError for a window without a terminal tab;
// that window is skipped instead of failing the whole save.
const emptyWindow = (reason: unknown) =>
  reason instanceof Error && reason.name === "EmptyLayoutError";

/**
 * Remembers every terminal window's layout while reopening is on, and hands it
 * back once at startup. Only the process holding the profile's lease takes
 * part, so a second OMXTerm on the same profile neither reopens nor overwrites.
 * A tick does work only after `touch()` reported activity. Nothing is written
 * while quitting, for an empty window set, or when a window can't be captured
 * right now; the last good arrangement stays. Windows without a terminal tab
 * are skipped, and only the first 16 windows are kept.
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
  const temporary = path.join(options.directory, "last.json.tmp");
  const marker = path.join(options.directory, "reopening");
  let owner = false;
  let lease: unknown;
  let last: string | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let saving: Promise<void> | undefined;
  let disposed = false;
  // Something may have changed since the last good capture.
  let dirty = true;
  let reopening = false;

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
  async function write(windows: SavedLayout[]): Promise<boolean> {
    const bytes = JSON.stringify({
      version: 1,
      windows,
    } satisfies LayoutSession);
    if (Buffer.byteLength(bytes) > MAX_BYTES) return false;
    try {
      // Only the lease owner writes, so one fixed temp name is enough.
      await fs.writeFile(temporary, bytes, { mode: 0o600 });
      await fs.rename(temporary, file);
      return true;
    } catch {
      await fs.rm(temporary, { force: true }).catch(() => {});
      return false;
    }
  }
  async function save() {
    if (!owner || disposed || options.quitting() || !options.enabled()) return;
    if (!dirty) return;
    dirty = false;
    const windows = options.windows().slice(0, LAYOUT_SESSION_MAX_WINDOWS);
    const captured = await Promise.allSettled(windows.map(options.capture));
    // A window that opened, closed or failed meanwhile makes this a partial
    // picture; keep the previous one and look again on the next tick.
    const settled =
      !disposed &&
      !options.quitting() &&
      options.enabled() &&
      captured.every(
        (result) => result.status === "fulfilled" || emptyWindow(result.reason),
      ) &&
      sameWindows(windows);
    if (!settled) {
      dirty = true;
      return;
    }
    const layouts = captured.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    if (layouts.length === 0) return;
    const next = arrangement(layouts);
    if (next !== last) {
      if (!(await write(layouts))) {
        dirty = true;
        return;
      }
      last = next;
    }
    // The reopened windows have been captured once; a crash from now on isn't
    // the reopening's fault.
    if (reopening) {
      reopening = false;
      await fs.rm(marker, { force: true }).catch(() => {});
    }
  }
  const sameWindows = (before: Window[]) => {
    const now = options.windows().slice(0, LAYOUT_SESSION_MAX_WINDOWS);
    return (
      now.length === before.length &&
      now.every((window, index) => window === before[index])
    );
  };
  // One save at a time; a request during a save runs once after it.
  let queued: Promise<void> | undefined;
  const tick = () => {
    saving ??= save().finally(() => {
      saving = undefined;
    });
    return saving;
  };
  const flush = () => {
    dirty = true;
    queued ??= (saving ?? Promise.resolve()).then(() => {
      queued = undefined;
      return tick();
    });
    return queued;
  };
  async function forget() {
    last = undefined;
    await fs.rm(file, { force: true }).catch(() => {});
  }

  function refresh() {
    if (!owner || disposed) return;
    if (!options.enabled()) {
      // Forget only when reopening was on and is now turned off, never because
      // the extension runtime couldn't load at startup.
      if (timer) void forget();
      clearInterval(timer);
      timer = undefined;
      return;
    }
    dirty = true;
    timer ??= setInterval(() => void tick(), options.interval ?? 3000);
    timer.unref?.();
  }

  return {
    /**
     * Claims the profile and returns the windows to reopen. A start with `-e`
     * (`reopen` false) takes no part at all, so it never overwrites them.
     * Nothing comes back when another process owns the profile, reopening is
     * off, or the previous reopening never finished: then the remembered
     * windows are dropped, so a layout that crashes OMXTerm can't loop.
     */
    async start(reopen: boolean): Promise<SavedLayout[]> {
      if (!reopen) return [];
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
      if (!owner || !options.enabled()) return [];
      if (await exists(marker)) {
        await fs.rm(marker, { force: true }).catch(() => {});
        await forget();
        return [];
      }
      const windows = await read();
      if (windows.length > 0) {
        reopening = true;
        await fs.writeFile(marker, "", { mode: 0o600 }).catch(() => {});
      }
      return windows;
    },
    /** The startup windows exist; start remembering changes. */
    started() {
      refresh();
    },
    /** Reopening was turned on or off (an extension changed). */
    refresh,
    /** Activity that may change a layout or a folder; the next tick saves. */
    touch() {
      dirty = true;
    },
    /** Saves now, after any save in progress (window close, tests). */
    flush,
    dispose() {
      disposed = true;
      clearInterval(timer);
      timer = undefined;
    },
  };
}
