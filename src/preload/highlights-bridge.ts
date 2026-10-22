import type { IpcRenderer, IpcRendererEvent } from "electron";
import { highlightIpc } from "../shared/highlight-ipc";
import { validateHighlightSettings } from "../shared/highlight-settings";
import type { HighlightsBridge } from "../shared/terminal-bridge";

// Output highlighting preferences: validated on both sides of the bridge.
export function createHighlightsBridge(ipc: IpcRenderer): HighlightsBridge {
  return {
    async get() {
      return validateHighlightSettings(await ipc.invoke(highlightIpc.get));
    },
    async save(settings) {
      return validateHighlightSettings(
        await ipc.invoke(
          highlightIpc.save,
          validateHighlightSettings(settings),
        ),
      );
    },
    onChanged(listener) {
      const handler = (_event: IpcRendererEvent, payload: unknown) => {
        try {
          listener(validateHighlightSettings(payload));
        } catch {
          // A malformed broadcast is ignored; get() stays authoritative.
        }
      };
      ipc.on(highlightIpc.changed, handler);
      return () => ipc.removeListener(highlightIpc.changed, handler);
    },
    onOpenEditor(listener) {
      const handler = (_event: IpcRendererEvent, payload: unknown) => {
        if (payload === undefined) listener();
      };
      ipc.on(highlightIpc.openEditor, handler);
      return () => ipc.removeListener(highlightIpc.openEditor, handler);
    },
  };
}
