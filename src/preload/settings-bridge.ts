import {
  isSettingsChange,
  isSettingsResult,
  isSettingsSnapshot,
  isSettingsTextSave,
  settingsIpc,
  type SettingsBridge,
} from "../shared/settings";
import { isSettingsThemesResult } from "../shared/settings-themes";
import {
  isLocalThemeDocumentPath,
  isThemeDocumentSave,
  isThemeDocumentOpenResult,
  isThemeDocumentSaveResult,
  isThemeDocumentExportResult,
  themeDocumentIpc,
} from "../shared/settings-theme-documents";
import { isTerminalTheme } from "../shared/terminal-theme";
import {
  isShortcutCaptureResult,
  isSettingsKeybindChange,
} from "../shared/settings-keybinds";

// Follows the About bridge: typed requests out, validated responses back, and
// an open request delivered once even if it arrives before the listener.
export function createSettingsBridge(ipc: {
  invoke(channel: string, payload?: unknown): Promise<unknown>;
  on(
    channel: string,
    listener: (event: unknown, payload: unknown) => void,
  ): unknown;
  removeListener(
    channel: string,
    listener: (event: unknown, payload: unknown) => void,
  ): unknown;
}): SettingsBridge {
  let pending = false;
  let stopCapture: (() => void) | undefined;
  let listener: (() => void) | undefined;
  const handler = (_event: unknown, payload: unknown) => {
    if (payload !== undefined) return;
    if (listener) listener();
    else pending = true;
  };
  ipc.on(settingsIpc.open, handler);
  const result = (value: unknown) => {
    if (!isSettingsResult(value))
      throw new TypeError("Invalid settings response");
    return value;
  };
  return {
    themeDocuments: {
      async openTheme(path) {
        if (!isLocalThemeDocumentPath(path))
          throw new TypeError("Invalid theme document request");
        const value = await ipc.invoke(themeDocumentIpc.open, path);
        if (!isThemeDocumentOpenResult(value))
          throw new TypeError("Invalid theme document response");
        return value;
      },
      async saveTheme(request) {
        if (!isThemeDocumentSave(request))
          throw new TypeError("Invalid theme document request");
        const value = await ipc.invoke(themeDocumentIpc.save, request);
        if (!isThemeDocumentSaveResult(value))
          throw new TypeError("Invalid theme document response");
        return value;
      },
      async importTheme() {
        const value = await ipc.invoke(themeDocumentIpc.import);
        if (!isThemeDocumentOpenResult(value))
          throw new TypeError("Invalid theme document response");
        return value;
      },
      async exportTheme(theme) {
        if (!isTerminalTheme(theme))
          throw new TypeError("Invalid theme document request");
        const value = await ipc.invoke(themeDocumentIpc.export, theme);
        if (!isThemeDocumentExportResult(value))
          throw new TypeError("Invalid theme document response");
        return value;
      },
    },
    async snapshot() {
      const value: unknown = await ipc.invoke(settingsIpc.snapshot);
      if (!isSettingsSnapshot(value))
        throw new TypeError("Invalid settings response");
      return value;
    },
    async themes() {
      const value: unknown = await ipc.invoke(settingsIpc.themes);
      if (!isSettingsThemesResult(value))
        throw new TypeError("Invalid settings themes response");
      return value;
    },
    async change(change) {
      if (!isSettingsChange(change))
        throw new TypeError("Invalid settings change");
      return result(await ipc.invoke(settingsIpc.change, change));
    },
    async saveText(text, revision) {
      const save = { text, revision };
      if (!isSettingsTextSave(save))
        throw new TypeError("Invalid settings text");
      return result(await ipc.invoke(settingsIpc.saveText, save));
    },
    async changeKeybind(change) {
      if (!isSettingsKeybindChange(change))
        throw new TypeError("Invalid shortcut change");
      return result(await ipc.invoke(settingsIpc.keybind, change));
    },
    // Main owns the keyboard while capturing and ends capture after one key;
    // stopping early (cancel, close, disposal) releases it as well.
    captureShortcut(next) {
      stopCapture?.();
      const captureId = crypto.randomUUID();
      let active = true;
      const stop = () => {
        if (!active) return;
        active = false;
        ipc.removeListener(settingsIpc.captured, onCaptured);
        if (stopCapture === stop) stopCapture = undefined;
        void ipc
          .invoke(settingsIpc.capture, { captureId, active: false })
          .catch(() => undefined);
      };
      const onCaptured = (_event: unknown, payload: unknown) => {
        if (
          !active ||
          !isShortcutCaptureResult(payload) ||
          payload.captureId !== captureId
        )
          return;
        // An unusable key keeps capture open for another try.
        if (!("invalid" in payload.shortcut)) stop();
        next(payload.shortcut);
      };
      stopCapture = stop;
      ipc.on(settingsIpc.captured, onCaptured);
      void ipc
        .invoke(settingsIpc.capture, { captureId, active: true })
        .catch(() => {
          if (!active) return;
          stop();
          next({ cancelled: true });
        });
      return stop;
    },
    onOpen(next) {
      listener = next;
      if (pending) {
        pending = false;
        next();
      }
      return () => {
        listener = undefined;
        pending = false;
        ipc.removeListener(settingsIpc.open, handler);
      };
    },
  };
}
