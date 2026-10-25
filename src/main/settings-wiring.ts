import {
  isSettingsChange,
  isSettingsTextSave,
  settingsIpc,
} from "../shared/settings";
import type { SettingsService } from "./settings-service";
import { isSettingsKeybindChange } from "../shared/settings-keybinds";
import type { KeybindCapture } from "./keybind-capture";
import type {
  IpcEvent,
  IpcMainPort,
  TrustedWebContents,
} from "./terminal-ipc-types";

// Only a trusted main frame may read or write settings; payloads are bounded
// and typed before the service sees them.
export function startSettings(options: {
  readonly ipcMain: Pick<IpcMainPort, "handle" | "removeHandler">;
  readonly isTrustedSender: (event: IpcEvent) => boolean;
  readonly service: SettingsService;
  readonly selectedContents: () => TrustedWebContents | undefined;
  readonly capture?: Pick<KeybindCapture, "set">;
}) {
  let disposed = false;
  const trusted = (event: IpcEvent) =>
    !disposed && !event.sender.isDestroyed() && options.isTrustedSender(event);
  options.ipcMain.handle(settingsIpc.snapshot, async (event, payload) => {
    if (!trusted(event)) throw new Error("Rejected settings sender");
    if (payload !== undefined) throw new TypeError("Invalid settings request");
    return options.service.snapshot();
  });
  options.ipcMain.handle(settingsIpc.change, async (event, payload) => {
    if (!trusted(event)) throw new Error("Rejected settings sender");
    if (!isSettingsChange(payload))
      throw new TypeError("Invalid settings change");
    return options.service.change(payload);
  });
  options.ipcMain.handle(settingsIpc.keybind, async (event, payload) => {
    if (!trusted(event)) throw new Error("Rejected settings sender");
    if (!isSettingsKeybindChange(payload))
      throw new TypeError("Invalid shortcut change");
    return options.service.changeKeybind(payload);
  });
  // Capture belongs to the requesting window only.
  options.ipcMain.handle(settingsIpc.capture, async (event, payload) => {
    if (!trusted(event)) throw new Error("Rejected settings sender");
    if (typeof payload !== "boolean")
      throw new TypeError("Invalid shortcut capture request");
    options.capture?.set(event.sender, payload);
  });
  options.ipcMain.handle(settingsIpc.saveText, async (event, payload) => {
    if (!trusted(event)) throw new Error("Rejected settings sender");
    if (!isSettingsTextSave(payload))
      throw new TypeError("Invalid settings text");
    return options.service.saveText(payload.text, payload.revision);
  });
  return {
    show() {
      const sender = options.selectedContents();
      if (sender && trusted({ sender, senderFrame: sender.mainFrame }))
        sender.send(settingsIpc.open, undefined);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const channel of [
        settingsIpc.snapshot,
        settingsIpc.change,
        settingsIpc.saveText,
        settingsIpc.keybind,
        settingsIpc.capture,
      ])
        options.ipcMain.removeHandler(channel);
    },
  };
}
