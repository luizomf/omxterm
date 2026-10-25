import {
  isSettingsChange,
  isSettingsTextSave,
  settingsIpc,
} from "../shared/settings";
import type { SettingsService } from "./settings-service";
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
      ])
        options.ipcMain.removeHandler(channel);
    },
  };
}
