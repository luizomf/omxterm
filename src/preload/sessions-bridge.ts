import type { IpcRenderer, IpcRendererEvent } from "electron";
import type { SessionsBridge } from "../shared/terminal-bridge";
import {
  isSessionFileChoice,
  isSessionPassword,
  isSessionPasswordState,
  isSshSessionReference,
  sessionIpc,
} from "../shared/session-ipc";
import { isSavedSessionId } from "../shared/terminal-launch";
import { parseSshTarget } from "../shared/saved-session-primitives";
import {
  validateFolder,
  validateSession,
  validateSessionDocument,
} from "../shared/saved-sessions";

// Saved Session management for the sidebar. Definitions are validated on
// both sides of the bridge; main remains the only writer of sessions.json.
export function createSessionsBridge(ipc: IpcRenderer): SessionsBridge {
  const requireId = (id: string) => {
    if (!isSavedSessionId(id)) throw new TypeError("Invalid identifier");
    return id;
  };
  const added = (value: unknown) => {
    if (
      typeof value !== "object" ||
      value === null ||
      !Number.isInteger((value as Record<string, unknown>).added)
    )
      throw new TypeError("Invalid import response");
    return { added: (value as { added: number }).added };
  };
  return {
    async list() {
      return validateSessionDocument(await ipc.invoke(sessionIpc.list));
    },
    async saveSession(session) {
      return validateSession(await ipc.invoke(sessionIpc.saveSession, session));
    },
    async deleteSession(id) {
      await ipc.invoke(sessionIpc.deleteSession, requireId(id));
    },
    async saveFolder(folder) {
      return validateFolder(await ipc.invoke(sessionIpc.saveFolder, folder));
    },
    async deleteFolder(id) {
      await ipc.invoke(sessionIpc.deleteFolder, requireId(id));
    },
    async importSshConfig() {
      return added(await ipc.invoke(sessionIpc.importSshConfig));
    },
    async importFile() {
      const response: unknown = await ipc.invoke(sessionIpc.importFile);
      return response === null ? null : added(response);
    },
    async exportFile() {
      return (await ipc.invoke(sessionIpc.exportFile)) === true;
    },
    async chooseFile(kind) {
      if (!isSessionFileChoice(kind))
        throw new TypeError("Invalid file choice");
      const response: unknown = await ipc.invoke(sessionIpc.chooseFile, kind);
      return typeof response === "string" && response.length <= 4096
        ? response
        : null;
    },
    onChanged(listener) {
      const handler = (_event: IpcRendererEvent, payload: unknown) => {
        try {
          listener(validateSessionDocument(payload));
        } catch {
          // Ignore malformed broadcasts; the next list() is authoritative.
        }
      };
      ipc.on(sessionIpc.changed, handler);
      return () => ipc.removeListener(sessionIpc.changed, handler);
    },
    onToggleSidebar(listener) {
      const handler = (_event: IpcRendererEvent, payload: unknown) => {
        if (payload === undefined) listener();
      };
      ipc.on(sessionIpc.toggleSidebar, handler);
      return () => ipc.removeListener(sessionIpc.toggleSidebar, handler);
    },
    async startupConnection() {
      const response: unknown = await ipc.invoke(sessionIpc.startupConnection);
      return typeof response === "string" &&
        parseSshTarget(response) !== undefined
        ? response
        : null;
    },
    async passwordState(id) {
      const response: unknown = await ipc.invoke(
        sessionIpc.passwordState,
        id === undefined ? null : requireId(id),
      );
      if (!isSessionPasswordState(response))
        throw new TypeError("Invalid password state");
      return response;
    },
    async setPassword(id, password) {
      if (password !== null && !isSessionPassword(password))
        throw new TypeError("Invalid password");
      await ipc.invoke(sessionIpc.setPassword, { id: requireId(id), password });
    },
    async forgetHostKey(reference) {
      if (!isSshSessionReference(reference))
        throw new TypeError("Invalid session reference");
      const response: unknown = await ipc.invoke(
        sessionIpc.forgetHostKey,
        reference.kind === "saved-session"
          ? { kind: reference.kind, id: reference.id }
          : { kind: reference.kind, target: reference.target },
      );
      if (
        typeof response !== "object" ||
        response === null ||
        typeof (response as { removed?: unknown }).removed !== "boolean"
      )
        throw new TypeError("Invalid host key response");
      return { removed: (response as { removed: boolean }).removed };
    },
  };
}
