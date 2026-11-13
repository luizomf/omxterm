import { app, Notification, shell, type BrowserWindow } from "electron";
import { open } from "node:fs/promises";
import { MAX_ATTENTION_SOUND_BYTES } from "../shared/terminal-attention";
import type { TerminalSessionId } from "../shared/terminal-contract";
import { terminalIpc } from "../shared/terminal-ipc";
import type { NotificationPreferences } from "../shared/user-configuration";
import { createTerminalNotifications } from "./terminal-notifications";

// Native notifications for one Terminal Window. A click brings the window
// forward and asks its renderer to select the session's pane.
export function createWindowNotifications(
  window: BrowserWindow,
  options: {
    readonly preferences: () => NotificationPreferences;
    readonly reveal: (sessionId: TerminalSessionId) => void;
    readonly platform?: string;
  },
) {
  const platform = options.platform ?? process.platform;
  return createTerminalNotifications({
    platform,
    preferences: options.preferences,
    isSupported: () => Notification.isSupported(),
    create: (notification) => new Notification(notification),
    reveal(sessionId) {
      if (window.isDestroyed()) return;
      if (window.isMinimized()) window.restore();
      window.show();
      if (platform === "darwin") app.focus({ steal: true });
      window.focus();
      options.reveal(sessionId);
    },
    beep: () => shell.beep(),
    playSoundFile(path) {
      void readSoundFile(path).then((sound) => {
        if (!sound) shell.beep();
        else if (!window.isDestroyed() && !window.webContents.isDestroyed())
          window.webContents.send(terminalIpc.attentionSound, sound);
      });
    },
  });
}

// A bounded read of the user's sound file; undefined when it is missing, not
// a regular file, empty or too large. The path is never logged.
export async function readSoundFile(
  path: string,
): Promise<Uint8Array | undefined> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(path, "r");
    const status = await handle.stat();
    if (
      !status.isFile() ||
      status.size === 0 ||
      status.size > MAX_ATTENTION_SOUND_BYTES
    )
      return undefined;
    const bytes = new Uint8Array(status.size);
    const { bytesRead } = await handle.read(bytes, 0, status.size, 0);
    return bytesRead === status.size ? bytes : undefined;
  } catch {
    return undefined;
  } finally {
    await handle?.close().catch(() => {});
  }
}
