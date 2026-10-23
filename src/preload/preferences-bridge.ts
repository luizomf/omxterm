import type { IpcRenderer, IpcRendererEvent } from "electron";
import {
  isCapturedKeyPress,
  isPreferencesPatch,
  isPreferencesSaveResult,
  isPreferencesSnapshot,
  preferencesIpc,
} from "../shared/preferences";
import type { PreferencesBridge } from "../shared/terminal-bridge";

// The Preferences dialog's access to config.json: patches are validated
// before they leave the renderer and every answer before it enters it.
export function createPreferencesBridge(ipc: IpcRenderer): PreferencesBridge {
  const result = (value: unknown) => {
    if (!isPreferencesSaveResult(value))
      throw new TypeError("Invalid preferences response");
    return value;
  };
  return {
    async get() {
      const value: unknown = await ipc.invoke(preferencesIpc.get);
      if (!isPreferencesSnapshot(value))
        throw new TypeError("Invalid preferences response");
      return value;
    },
    async save(patch) {
      if (!isPreferencesPatch(patch))
        throw new TypeError("Invalid preferences change");
      return result(await ipc.invoke(preferencesIpc.save, patch));
    },
    async reset() {
      return result(await ipc.invoke(preferencesIpc.reset));
    },
    async captureShortcut(active) {
      if (typeof active !== "boolean")
        throw new TypeError("Invalid shortcut capture request");
      await ipc.invoke(preferencesIpc.capture, active);
    },
    onCapturedKey(listener) {
      const handler = (_event: IpcRendererEvent, payload: unknown) => {
        if (isCapturedKeyPress(payload)) listener(payload);
      };
      ipc.on(preferencesIpc.capturedKey, handler);
      return () => ipc.removeListener(preferencesIpc.capturedKey, handler);
    },
    onOpen(listener) {
      const handler = (_event: IpcRendererEvent, payload: unknown) => {
        if (payload === undefined) listener();
      };
      ipc.on(preferencesIpc.open, handler);
      return () => ipc.removeListener(preferencesIpc.open, handler);
    },
  };
}
