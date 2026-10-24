import {
  aboutIpc,
  isAboutInfo,
  isAboutLink,
  type AboutBridge,
} from "../shared/about";

// Adapted from ruscher/omxterm PR #622 at
// b3c3a4ad6c1f2224bded65873ba0b09a07ec5d38 (MIT).
export function createAboutBridge(ipc: {
  invoke(channel: string, payload?: unknown): Promise<unknown>;
  on(
    channel: string,
    listener: (event: unknown, payload: unknown) => void,
  ): unknown;
  removeListener(
    channel: string,
    listener: (event: unknown, payload: unknown) => void,
  ): unknown;
}): AboutBridge {
  let pending = false;
  let listener: (() => void) | undefined;
  const handler = (_event: unknown, payload: unknown) => {
    if (payload !== undefined) return;
    if (listener) listener();
    else pending = true;
  };
  ipc.on(aboutIpc.open, handler);
  return {
    async info() {
      const info: unknown = await ipc.invoke(aboutIpc.info);
      if (!isAboutInfo(info)) throw new TypeError("Invalid About response");
      return info;
    },
    async openLink(link) {
      if (!isAboutLink(link)) throw new TypeError("Invalid About link");
      await ipc.invoke(aboutIpc.openLink, link);
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
        ipc.removeListener(aboutIpc.open, handler);
      };
    },
  };
}
