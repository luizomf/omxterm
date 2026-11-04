import { app, BrowserWindow, ipcMain } from "electron";
import { createSettingsService } from "./settings-service";
import { startSettings } from "./settings-wiring";
import type {
  TerminalIpcRouter,
  TrustedWebContents,
} from "./terminal-ipc-types";
import type { KeybindCapture } from "./keybind-capture";
import type { LoadUserConfigurationOptions } from "./user-configuration";
import type { SettingsChange } from "../shared/settings";
import type { AuxiliaryPanelSide } from "../shared/user-configuration";
import type { UserConfigurationReloader } from "./user-configuration-reloader";

export function startApplicationSettings(
  router: TerminalIpcRouter,
  loadOptions: LoadUserConfigurationOptions,
  reloader: UserConfigurationReloader,
  capture: Pick<KeybindCapture, "set">,
  sendAction?: (
    sender: TrustedWebContents,
    channel: string,
    payload?: unknown,
  ) => void,
) {
  const service = createSettingsService({
    loadOptions,
    reload: () => reloader.reload(),
  });
  const settings = startSettings({
    ipcMain,
    ...(sendAction ? { sendAction } : {}),
    isTrustedSender: router.isTrustedSender,
    service,
    selectedContents: () => BrowserWindow.getFocusedWindow()?.webContents,
    capture,
  });
  app.once("will-quit", settings.dispose);
  const sideSwitch: { pending?: AuxiliaryPanelSide } = {};
  return {
    show: () => settings.show(),
    switchAuxiliaryPanelSide() {
      const next = takeAuxiliaryPanelSideSwitch(
        sideSwitch,
        reloader.current().configuration.auxiliaryPanelSide,
      );
      void Promise.resolve(
        service.change({ path: "window.auxiliaryPanelSide", value: next }),
      ).finally(() => settleAuxiliaryPanelSideSwitch(sideSwitch, next));
    },
  };
}

/** Flip the persisted side through the Settings write queue. */
export function switchPersistedAuxiliaryPanelSide(
  current: AuxiliaryPanelSide,
  change: (change: SettingsChange) => unknown,
) {
  return change({
    path: "window.auxiliaryPanelSide",
    value: current === "left" ? "right" : "left",
  });
}

// The write queue applies absolute values and does not coalesce this field.
// A repeated shortcut must flip from the value already queued, then drop that
// memory only when no newer flip replaced it.
export function takeAuxiliaryPanelSideSwitch(
  state: { pending?: AuxiliaryPanelSide },
  current: AuxiliaryPanelSide,
): AuxiliaryPanelSide {
  const next = (state.pending ?? current) === "left" ? "right" : "left";
  state.pending = next;
  return next;
}

export function settleAuxiliaryPanelSideSwitch(
  state: { pending?: AuxiliaryPanelSide },
  written: AuxiliaryPanelSide,
): void {
  if (state.pending === written) delete state.pending;
}
