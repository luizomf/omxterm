import type { TerminalRendererConfiguration } from "../shared/user-configuration";
import { terminalIpc } from "../shared/terminal-ipc";
import type { TrustedWebContents } from "./terminal-ipc-types";

// Keep requested configuration independent of native per-window presentation.
// Both initial requests and notifications receive the same effective snapshot.
export function createRendererConfigurationState(
  initial: TerminalRendererConfiguration,
  initialFullScreen: boolean,
  webContents: TrustedWebContents,
  backgroundTransparency?: () => number,
) {
  let configuration = initial;
  let fullScreen = initialFullScreen;
  const effective = () => {
    const nativeTitleInset = fullScreen ? 0 : configuration.nativeTitleInset;
    const transparency =
      backgroundTransparency?.() ?? configuration.transparency;
    return nativeTitleInset !== configuration.nativeTitleInset ||
      transparency !== configuration.transparency
      ? Object.freeze({ ...configuration, nativeTitleInset, transparency })
      : configuration;
  };
  const send = () =>
    webContents.send(terminalIpc.configurationUpdate, effective());
  return {
    current: () => configuration,
    effective,
    apply(next: TerminalRendererConfiguration) {
      configuration = Object.freeze({ ...next });
      send();
    },
    applyFullScreen(next: boolean) {
      if (fullScreen === next) return;
      fullScreen = next;
      send();
    },
  };
}
