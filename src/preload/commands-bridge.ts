import type { IpcRenderer, IpcRendererEvent } from "electron";
import { commandIpc } from "../shared/command-ipc";
import {
  validateCommandDefinition,
  validateCommandLibrary,
} from "../shared/commands";
import type { CommandsBridge } from "../shared/terminal-bridge";

export function createCommandsBridge(ipc: IpcRenderer): CommandsBridge {
  return {
    async list() {
      return validateCommandLibrary(await ipc.invoke(commandIpc.list));
    },
    async save(command) {
      return validateCommandDefinition(
        await ipc.invoke(commandIpc.save, validateCommandDefinition(command)),
      );
    },
    async delete(id) {
      await ipc.invoke(commandIpc.delete, id);
    },
    async setFavorite(id, on) {
      await ipc.invoke(commandIpc.favorite, { id, on });
    },
    async setHidden(id, on) {
      await ipc.invoke(commandIpc.hide, { id, on });
    },
    async availability(tools) {
      const response: unknown = await ipc.invoke(commandIpc.availability, [
        ...tools,
      ]);
      if (typeof response !== "object" || response === null)
        throw new TypeError("Invalid availability response");
      return Object.fromEntries(
        Object.entries(response).filter(
          (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
        ),
      );
    },
    async platform() {
      const response: unknown = await ipc.invoke(commandIpc.platform);
      if (typeof response !== "string" || response.length > 32)
        throw new TypeError("Invalid platform response");
      return response;
    },
    onChanged(listener) {
      const handler = (_event: IpcRendererEvent, payload: unknown) => {
        try {
          listener(validateCommandLibrary(payload));
        } catch {
          // Ignore malformed broadcasts; list() stays authoritative.
        }
      };
      ipc.on(commandIpc.changed, handler);
      return () => ipc.removeListener(commandIpc.changed, handler);
    },
    onToggleSidebar(listener) {
      const handler = (_event: IpcRendererEvent, payload: unknown) => {
        if (payload === undefined) listener();
      };
      ipc.on(commandIpc.toggleSidebar, handler);
      return () => ipc.removeListener(commandIpc.toggleSidebar, handler);
    },
  };
}
