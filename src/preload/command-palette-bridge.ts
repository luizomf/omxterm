import {
  paletteIpc,
  paletteActionChannels,
  isPaletteIdentity,
  isPaletteSnapshot,
  type CommandPaletteBridge,
} from "../shared/command-palette";

import { shortcutText } from "../shared/terminal-keybinds";

type Listener = (event: Electron.IpcRendererEvent, payload: unknown) => void;
interface Transport {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, listener: Listener): unknown;
  removeListener(channel: string, listener: Listener): unknown;
}

// Both transports feed the original subscription's payload validator and handler.
export function createPaletteTransport(
  ipc: Transport,
  platform = process.platform,
) {
  let guard: ((token: string) => boolean) | undefined;
  const envelopes = new Map<Listener, Map<string, Listener>>();
  const transport: Transport = {
    invoke: (channel, ...args) => ipc.invoke(channel, ...args),
    on(channel, listener) {
      ipc.on(channel, listener);
      if (!paletteActionChannels.has(channel)) return;
      const envelope: Listener = (event, value) => {
        if (!value || typeof value !== "object") return;
        const data = value as {
          token?: unknown;
          channel?: unknown;
          payload?: unknown;
        };
        if (data.channel !== channel || !isPaletteIdentity(data.token)) return;
        if (guard?.(data.token) === true) listener(event, data.payload);
      };
      let channels = envelopes.get(listener);
      if (!channels)
        envelopes.set(listener, (channels = new Map<string, Listener>()));
      channels.set(channel, envelope);
      ipc.on(paletteIpc.dispatch, envelope);
    },
    removeListener(channel, listener) {
      ipc.removeListener(channel, listener);
      const channels = envelopes.get(listener);
      const envelope = channels?.get(channel);
      if (envelope) ipc.removeListener(paletteIpc.dispatch, envelope);
      channels?.delete(channel);
      if (!channels?.size) envelopes.delete(listener);
    },
  };
  const palette: CommandPaletteBridge = {
    async snapshot() {
      const response = await ipc.invoke(paletteIpc.snapshot);
      if (!isPaletteSnapshot(response))
        throw new TypeError("Invalid palette snapshot");
      return {
        ...response,
        actions: response.actions.map((action) => ({
          ...action,
          accelerator:
            action.accelerator === null
              ? null
              : (shortcutText(action.accelerator, platform) ?? null),
        })),
      };
    },
    async invoke(token, id) {
      if (!isPaletteIdentity(token) || !isPaletteIdentity(id))
        throw new TypeError("Invalid palette invocation");
      await ipc.invoke(paletteIpc.invoke, token, id);
    },
    onOpen(listener) {
      const handler: Listener = (_event, payload) => {
        if (payload === undefined) listener();
      };
      ipc.on(paletteIpc.open, handler);
      return () => ipc.removeListener(paletteIpc.open, handler);
    },
    setDispatchGuard(next) {
      guard = next;
    },
  };
  return { transport, palette };
}
