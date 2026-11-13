import type { TerminalNotification } from "../shared/terminal-attention";
import {
  MAX_NOTIFICATION_BODY_CODE_POINTS,
  MAX_NOTIFICATION_TITLE_CODE_POINTS,
  sanitizedNotificationText,
} from "../shared/terminal-attention";
import type { TerminalSessionId } from "../shared/terminal-contract";
import type { NotificationPreferences } from "../shared/user-configuration";

// One live notification per session; a program that repeats itself faster
// than this replaces nothing and plays nothing until the interval passes.
export const NOTIFICATION_INTERVAL_MS = 1000;

export interface NativeNotification {
  on(event: "click", listener: () => void): void;
  show(): void;
  close(): void;
}

export interface TerminalNotificationsOptions {
  readonly platform: string;
  readonly preferences: () => NotificationPreferences;
  readonly isSupported: () => boolean;
  readonly create: (options: {
    readonly title: string;
    readonly body: string;
    readonly silent: boolean;
  }) => NativeNotification;
  // Bring the window forward and select the session's pane.
  readonly reveal: (sessionId: TerminalSessionId) => void;
  // The system's alert sound, when no notification plays one.
  readonly beep: () => void;
  readonly playSoundFile: (path: string) => void;
  readonly now?: () => number;
}

/**
 * Native desktop notifications for one Terminal Window (ADR 0053). Text is
 * the program's plain text, bounded again here; it is never logged.
 */
export function createTerminalNotifications(
  options: TerminalNotificationsOptions,
) {
  const now = options.now ?? Date.now;
  // Kept referenced so the native object (and its click) outlives this call.
  const shown = new Map<TerminalSessionId, NativeNotification>();
  const lastShown = new Map<TerminalSessionId, number>();
  let disposed = false;

  const close = (sessionId: TerminalSessionId) => {
    const notification = shown.get(sessionId);
    shown.delete(sessionId);
    notification?.close();
  };

  return {
    show(sessionId: TerminalSessionId, notification: TerminalNotification) {
      if (disposed) return;
      const at = now();
      const previous = lastShown.get(sessionId);
      if (previous !== undefined && at - previous < NOTIFICATION_INTERVAL_MS)
        return;
      lastShown.set(sessionId, at);
      const preferences = options.preferences();
      const banner = preferences.enabled && options.isSupported();
      const systemSound = preferences.sound && !preferences.soundFile;
      if (preferences.sound && preferences.soundFile)
        options.playSoundFile(preferences.soundFile);
      else if (systemSound && !banner) options.beep();
      if (!banner) return;
      close(sessionId);
      const native = options.create({
        title: sanitizedNotificationText(
          notification.title,
          MAX_NOTIFICATION_TITLE_CODE_POINTS,
        ),
        body: plainBody(notification.body, options.platform),
        silent: !systemSound,
      });
      shown.set(sessionId, native);
      native.on("click", () => {
        if (shown.get(sessionId) === native) shown.delete(sessionId);
        if (!disposed) options.reveal(sessionId);
      });
      native.show();
    },
    clear(sessionId: TerminalSessionId) {
      close(sessionId);
    },
    ended(sessionId: TerminalSessionId) {
      close(sessionId);
      lastShown.delete(sessionId);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const sessionId of [...shown.keys()]) close(sessionId);
      lastShown.clear();
    },
  };
}

export type TerminalNotifications = ReturnType<
  typeof createTerminalNotifications
>;

// Linux notification servers may read the body as markup; escape it so the
// program's text stays text everywhere.
function plainBody(text: string, platform: string): string {
  const clean = sanitizedNotificationText(
    text,
    MAX_NOTIFICATION_BODY_CODE_POINTS,
  );
  return platform === "linux"
    ? clean
        .replace(/&/gu, "&amp;")
        .replace(/</gu, "&lt;")
        .replace(/>/gu, "&gt;")
    : clean;
}
