import {
  isSettingsChange,
  isSettingsResult,
  isSettingsSnapshot,
  isSettingsTextSave,
  settingsIpc,
  type SettingsBridge,
} from "../shared/settings";
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
    async snapshot() {
      const value: unknown = await ipc.invoke(settingsIpc.snapshot);
      if (!isSettingsSnapshot(value))
        throw new TypeError("Invalid settings response");
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
