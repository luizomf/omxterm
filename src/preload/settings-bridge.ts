import {
  isSettingsChange,
  isSettingsResult,
  isSettingsSnapshot,
  isSettingsTextSave,
  settingsIpc,
  type SettingsBridge,
} from "../shared/settings";

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
