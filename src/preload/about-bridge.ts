import type { IpcRenderer } from "electron";
import { aboutIpc, isAboutInfo, isAboutLink } from "../shared/about";
import type { AboutBridge } from "../shared/terminal-bridge";

export function createAboutBridge(ipc: IpcRenderer): AboutBridge {
  return {
    async info() {
      const info: unknown = await ipc.invoke(aboutIpc.info);
      if (!isAboutInfo(info)) throw new TypeError("Invalid response");
      return info;
    },
    async openLink(link) {
      if (!isAboutLink(link)) throw new TypeError("Invalid link");
      await ipc.invoke(aboutIpc.openLink, link);
    },
    onOpen(listener) {
      const handler = () => listener();
      ipc.on(aboutIpc.open, handler);
      return () => ipc.removeListener(aboutIpc.open, handler);
    },
  };
}
