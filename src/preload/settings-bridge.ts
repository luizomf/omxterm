import {
  isSettingsChange,
  isSettingsResult,
  isSettingsSnapshot,
  isSettingsTextSave,
  settingsIpc,
  type SettingsBridge,
} from "../shared/settings";
import {
  isCapturedShortcut,
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
      let active = true;
      const stop = () => {
        if (!active) return;
        active = false;
        ipc.removeListener(settingsIpc.captured, onCaptured);
        void ipc.invoke(settingsIpc.capture, false).catch(() => undefined);
      };
      const onCaptured = (_event: unknown, payload: unknown) => {
        if (!active || !isCapturedShortcut(payload)) return;
        // An unusable key keeps capture open for another try.
        if (!("invalid" in payload)) stop();
        next(payload);
      };
      ipc.on(settingsIpc.captured, onCaptured);
      void ipc.invoke(settingsIpc.capture, true).catch(() => {
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
