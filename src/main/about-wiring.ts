import { aboutIpc, isAboutLink } from "../shared/about";
import type {
  IpcEvent,
  IpcMainPort,
  TrustedWebContents,
} from "./terminal-ipc-types";

// Version/fixed-link route adapted from ruscher/omxterm PR #622,
// b3c3a4ad6c1f2224bded65873ba0b09a07ec5d38 (MIT).
const links = {
  website: "https://github.com/luizomf/omxterm",
  contributors: "https://github.com/luizomf/omxterm/blob/main/CONTRIBUTORS.md",
  issues: "https://github.com/luizomf/omxterm/issues",
  license: "https://github.com/luizomf/omxterm/blob/main/LICENSE",
} as const;

export function startAbout(options: {
  readonly ipcMain: Pick<IpcMainPort, "handle" | "removeHandler">;
  readonly isTrustedSender: (event: IpcEvent) => boolean;
  readonly getVersion: () => string;
  readonly openExternal: (url: string) => Promise<unknown>;
  readonly selectedContents: () => TrustedWebContents | undefined;
}) {
  let disposed = false;
  const trusted = (event: IpcEvent) =>
    !disposed && !event.sender.isDestroyed() && options.isTrustedSender(event);
  options.ipcMain.handle(aboutIpc.info, async (event, payload) => {
    if (!trusted(event)) throw new Error("Rejected About sender");
    if (payload !== undefined) throw new TypeError("Invalid About request");
    return {
      name: "OMXTerm",
      version: options.getVersion(),
      copyright: "Copyright © 2026 Luiz Otávio Miranda",
    };
  });
  options.ipcMain.handle(aboutIpc.openLink, async (event, payload) => {
    if (!trusted(event)) throw new Error("Rejected About sender");
    if (!isAboutLink(payload)) throw new TypeError("Invalid About request");
    try {
      await options.openExternal(links[payload]);
    } catch {
      throw new Error("Could not open the About link");
    }
  });
  return {
    show() {
      const sender = options.selectedContents();
      if (sender && trusted({ sender, senderFrame: sender.mainFrame }))
        sender.send(aboutIpc.open, undefined);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      options.ipcMain.removeHandler(aboutIpc.info);
      options.ipcMain.removeHandler(aboutIpc.openLink);
    },
  };
}
