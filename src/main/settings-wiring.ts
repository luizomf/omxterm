import {
  isSettingsChange,
  isSettingsTextSave,
  settingsIpc,
} from "../shared/settings";
import type { SettingsService } from "./settings-service";
import {
  isLocalThemeDocumentPath,
  isThemeDocumentSave,
  themeDocumentIpc,
} from "../shared/settings-theme-documents";
import { isTerminalTheme } from "../shared/terminal-theme";
import {
  isSettingsKeybindChange,
  isShortcutCaptureRequest,
} from "../shared/settings-keybinds";
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
  readonly sendAction?: (
    sender: TrustedWebContents,
    channel: string,
    payload?: unknown,
  ) => void;
  readonly capture?: Pick<KeybindCapture, "set">;
  readonly themeDialogs?: {
    chooseImport(owner: TrustedWebContents): Promise<string | null>;
    chooseExport(owner: TrustedWebContents): Promise<string | null>;
  };
}) {
  let disposed = false;
  const trusted = (event: IpcEvent) =>
    !disposed && !event.sender.isDestroyed() && options.isTrustedSender(event);
  options.ipcMain.handle(settingsIpc.snapshot, async (event, payload) => {
    if (!trusted(event)) throw new Error("Rejected settings sender");
    if (payload !== undefined) throw new TypeError("Invalid settings request");
    return options.service.snapshot();
  });
  options.ipcMain.handle(
    settingsIpc.themes,
    async (event, payload, ...extra: unknown[]) => {
      if (!trusted(event)) throw new Error("Rejected settings sender");
      if (payload !== undefined || extra.length > 0)
        throw new TypeError("Invalid settings request");
      return options.service.themes();
    },
  );
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
    if (!isShortcutCaptureRequest(payload))
      throw new TypeError("Invalid shortcut capture request");
    options.capture?.set(event.sender, payload);
  });
  options.ipcMain.handle(settingsIpc.saveText, async (event, payload) => {
    if (!trusted(event)) throw new Error("Rejected settings sender");
    if (!isSettingsTextSave(payload))
      throw new TypeError("Invalid settings text");
    return options.service.saveText(payload.text, payload.revision);
  });
  const documents = options.service.themeDocumentFiles;
  if (documents) {
    options.ipcMain.handle(
      themeDocumentIpc.open,
      async (event, payload, ...extra) => {
        if (!trusted(event)) throw new Error("Rejected settings sender");
        if (extra.length || !isLocalThemeDocumentPath(payload))
          throw new TypeError("Invalid theme document request");
        return documents.openTheme(payload);
      },
    );
    options.ipcMain.handle(
      themeDocumentIpc.save,
      async (event, payload, ...extra) => {
        if (!trusted(event)) throw new Error("Rejected settings sender");
        if (extra.length || !isThemeDocumentSave(payload))
          throw new TypeError("Invalid theme document request");
        return documents.saveTheme(structuredClone(payload));
      },
    );
    options.ipcMain.handle(
      themeDocumentIpc.import,
      async (event, payload, ...extra) => {
        if (!trusted(event)) throw new Error("Rejected settings sender");
        if (payload !== undefined || extra.length)
          throw new TypeError("Invalid theme document request");
        try {
          const path = await options.themeDialogs?.chooseImport(event.sender);
          if (!path || !trusted(event)) return { status: "cancelled" };
          return await documents.importTheme(path);
        } catch {
          return { status: "failed", reason: "read" };
        }
      },
    );
    options.ipcMain.handle(
      themeDocumentIpc.export,
      async (event, payload, ...extra) => {
        if (!trusted(event)) throw new Error("Rejected settings sender");
        if (extra.length || !isTerminalTheme(payload))
          throw new TypeError("Invalid theme document request");
        const theme = structuredClone(payload);
        try {
          const path = await options.themeDialogs?.chooseExport(event.sender);
          if (!path || !trusted(event)) return { status: "cancelled" };
          return await documents.exportTheme(path, theme);
        } catch {
          return { status: "failed", reason: "write" };
        }
      },
    );
  }
  return {
    show() {
      const sender = options.selectedContents();
      if (sender && trusted({ sender, senderFrame: sender.mainFrame }))
        (
          options.sendAction ??
          ((owner, channel, payload) => owner.send(channel, payload))
        )(sender, settingsIpc.open);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const channel of [
        settingsIpc.snapshot,
        settingsIpc.themes,
        settingsIpc.change,
        settingsIpc.saveText,
        settingsIpc.keybind,
        settingsIpc.capture,
        ...Object.values(themeDocumentIpc),
      ])
        options.ipcMain.removeHandler(channel);
    },
  };
}
