import { app, ipcMain, type BrowserWindow } from "electron";
import path from "node:path";
import {
  createNativeLeaseAdapter,
  type LeaseAdapter,
} from "../installed-packages/native-leases";
import { createLayoutSession } from "./layout-session";
import { registerTerminalLayoutIpc } from "./terminal-layout-ipc";
import {
  createLayoutDirectoryResolver,
  createTerminalLayoutTransfer,
  prepareSavedLayout,
} from "./terminal-layout-transfer";
import type { TerminalApplication } from "./terminal-application";
import type { IpcEvent } from "./terminal-ipc-types";

export function startApplicationLayout(options: {
  trusted(event: IpcEvent): boolean;
  home: string;
  application(): TerminalApplication<BrowserWindow> | undefined;
}) {
  const ipc = registerTerminalLayoutIpc({
    ipc: ipcMain,
    trusted: options.trusted,
    platform: process.platform as "linux" | "darwin" | "win32",
    quitting: () => options.application()?.isQuitting() === true,
  });
  const transfer = createTerminalLayoutTransfer<BrowserWindow>({
    platform: process.platform,
    home: options.home,
    alive: (window) =>
      !window.isDestroyed() &&
      !window.webContents.isDestroyed() &&
      options.application()?.isQuitting() !== true,
    available: () => !ipc.constructing(),
    create: (plan, focus, accepted) =>
      options.application()!.newWindow({ plan, focus, accepted }),
  });
  return {
    initial: ipc.initial,
    capture: ipc.capture,
    windows: ipc.windows,
    open: transfer.open,
    register: ipc.register,
    consume: ipc.consume,
    remembered: ipc.remembered,
    dispose() {
      transfer.dispose();
      ipc.dispose();
    },
  };
}

/**
 * Reopens the last windows at startup and remembers changes while an enabled
 * extension declares `terminal.reopenLayout.v1` (ADR 0047).
 */
export function startLayoutSession(options: {
  layouts: ReturnType<typeof startApplicationLayout>;
  applicationRoot: string;
  home: string;
  enabled(): boolean;
  application(): TerminalApplication<BrowserWindow> | undefined;
}) {
  let leases: LeaseAdapter | undefined;
  try {
    leases = createNativeLeaseAdapter(
      path.join(
        options.applicationRoot,
        "extension-runtime",
        "extension-leases.node",
      ),
    );
  } catch {
    // Without the lease addon (no extension runtime), nothing is reopened.
  }
  const session = createLayoutSession<BrowserWindow>({
    directory: path.join(app.getPath("userData"), "layout-session"),
    platform: process.platform,
    ...(leases ? { leases } : {}),
    enabled: options.enabled,
    windows: () =>
      options.layouts.windows().filter((window) => !window.isDestroyed()),
    capture: (window) =>
      options.layouts.capture(window, new AbortController().signal),
    quitting: () => options.application()?.isQuitting() === true,
  });
  const resolve = createLayoutDirectoryResolver();
  return {
    /** Opens the remembered windows, or one ordinary window. */
    async openWindows(reopen: boolean) {
      const application = options.application()!;
      let opened = 0;
      for (const layout of await session.start(reopen)) {
        try {
          const plan = await prepareSavedLayout(layout, options.home, resolve);
          await application.newWindow({
            plan,
            focus: () => true,
            accepted() {},
          });
          opened++;
        } catch {
          // A window that can't open is skipped; the others still come back.
        }
      }
      if (opened === 0) await application.newWindow();
      session.started();
    },
    refresh: session.refresh,
    touch: session.touch,
    /** Remembers the remaining windows right after one closes. */
    windowClosed() {
      setImmediate(() => void session.flush());
    },
    dispose: session.dispose,
  };
}
