import {
  extensionViewIpc,
  isHostedContentDescriptor,
  isHostedContentId,
  isHostedContentPresentation,
  type HostedContentBridge,
} from "../shared/extension-view";

type Listener = (event: Electron.IpcRendererEvent, payload: unknown) => void;
interface Transport {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, listener: Listener): unknown;
  removeListener(channel: string, listener: Listener): unknown;
}

// Compose into the trusted terminal preload only. Never expose this to a child.
export function createHostedContentBridge(ipc: Transport): HostedContentBridge {
  return {
    onOpen(listener) {
      const handler: Listener = (_event, value) => {
        if (isHostedContentDescriptor(value)) listener(value);
      };
      ipc.on(extensionViewIpc.open, handler);
      return () => {
        ipc.removeListener(extensionViewIpc.open, handler);
      };
    },
    onRetired(listener) {
      const handler: Listener = (_event, value) => {
        if (isHostedContentId(value)) listener(value);
      };
      ipc.on(extensionViewIpc.retired, handler);
      return () => {
        ipc.removeListener(extensionViewIpc.retired, handler);
      };
    },
    onFocus(listener) {
      const handler: Listener = (_event, value) => {
        if (value === null || isHostedContentId(value)) listener(value);
      };
      ipc.on(extensionViewIpc.focus, handler);
      return () => {
        ipc.removeListener(extensionViewIpc.focus, handler);
      };
    },
    onFailure(listener) {
      const handler: Listener = (_event, value) => {
        if (value === true) listener();
      };
      ipc.on(extensionViewIpc.failure, handler);
      return () => {
        ipc.removeListener(extensionViewIpc.failure, handler);
      };
    },
    async present(value) {
      if (!isHostedContentPresentation(value))
        throw new TypeError("Invalid hosted presentation");
      const result = await ipc.invoke(extensionViewIpc.present, value);
      if (typeof result !== "boolean")
        throw new TypeError("Invalid hosted presentation result");
      return result;
    },
    async close(id) {
      if (!isHostedContentId(id))
        throw new TypeError("Invalid hosted identity");
      const result = await ipc.invoke(extensionViewIpc.close, id);
      if (result !== undefined)
        throw new TypeError("Invalid hosted close result");
    },
  };
}
