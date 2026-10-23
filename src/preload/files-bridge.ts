import type { IpcRenderer, IpcRendererEvent } from "electron";
import { isTerminalSessionId } from "../shared/terminal-contract";
import {
  fileBrowserIpc,
  isPaneLocation,
  isTransferEvent,
  isDirectoryListing,
  isFileBrowserHome,
  isFileName,
  isFileOperationResult,
  isFilePath,
  isFilePathList,
} from "../shared/file-browser";
import type { FilesBridge } from "../shared/terminal-bridge";
import { filePeekIpc, isFilePeek } from "../shared/file-peek";

// The Files panel's access to the local file system through main; requests
// and answers are checked on this side too.
export function createFilesBridge(ipc: IpcRenderer): FilesBridge {
  const path = (value: unknown) => {
    if (!isFilePath(value)) throw new TypeError("Invalid file path");
    return value;
  };
  const name = (value: unknown) => {
    if (!isFileName(value)) throw new TypeError("Invalid file name");
    return value;
  };
  const session = (value: unknown) => {
    if (!isTerminalSessionId(value)) throw new TypeError("Invalid session");
    return value;
  };
  const list = (value: unknown) => {
    if (!isFilePathList(value)) throw new TypeError("Invalid file list");
    return [...value];
  };
  const operation = async (channel: string, payload: unknown) => {
    const result: unknown = await ipc.invoke(channel, payload);
    if (!isFileOperationResult(result))
      throw new TypeError("Invalid file operation response");
    return result;
  };
  return {
    async peek(filePath) {
      const peek: unknown = await ipc.invoke(filePeekIpc.peek, path(filePath));
      if (peek === null) return null;
      if (!isFilePeek(peek)) throw new TypeError("Invalid file preview");
      return peek;
    },
    async home() {
      const value: unknown = await ipc.invoke(fileBrowserIpc.home);
      if (!isFileBrowserHome(value)) throw new TypeError("Invalid response");
      return value;
    },
    async list(directory) {
      const value: unknown = await ipc.invoke(
        fileBrowserIpc.list,
        path(directory),
      );
      if (!isDirectoryListing(value)) throw new TypeError("Invalid listing");
      return value;
    },
    async resolve(uri) {
      if (typeof uri !== "string") throw new TypeError("Invalid URI");
      const value: unknown = await ipc.invoke(fileBrowserIpc.resolve, uri);
      if (value !== null && !isFilePath(value))
        throw new TypeError("Invalid response");
      return value;
    },
    open: (filePath) => operation(fileBrowserIpc.open, path(filePath)),
    reveal: (filePath) => operation(fileBrowserIpc.reveal, path(filePath)),
    createFolder: (parent, folder) =>
      operation(fileBrowserIpc.createFolder, {
        parent: path(parent),
        name: name(folder),
      }),
    createFile: (parent, file) =>
      operation(fileBrowserIpc.createFile, {
        parent: path(parent),
        name: name(file),
      }),
    rename: (filePath, newName) =>
      operation(fileBrowserIpc.rename, {
        path: path(filePath),
        name: name(newName),
      }),
    trash(paths) {
      if (!isFilePathList(paths)) throw new TypeError("Invalid file list");
      return operation(fileBrowserIpc.trash, [...paths]);
    },
    transfer(mode, sources, destination) {
      if (mode !== "copy" && mode !== "move")
        throw new TypeError("Invalid transfer");
      if (!isFilePathList(sources)) throw new TypeError("Invalid file list");
      return operation(fileBrowserIpc.copyOrMove, {
        mode,
        sources: [...sources],
        destination: path(destination),
      });
    },
    async location(sessionId) {
      const value: unknown = await ipc.invoke(
        fileBrowserIpc.location,
        session(sessionId),
      );
      if (!isPaneLocation(value)) throw new TypeError("Invalid response");
      return value;
    },
    async remoteHome(sessionId) {
      const value: unknown = await ipc.invoke(
        fileBrowserIpc.remoteHome,
        session(sessionId),
      );
      if (!isFilePath(value)) throw new TypeError("Invalid response");
      return value;
    },
    async remoteList(sessionId, directory) {
      const value: unknown = await ipc.invoke(fileBrowserIpc.remoteList, {
        sessionId: session(sessionId),
        path: path(directory),
      });
      if (!isDirectoryListing(value)) throw new TypeError("Invalid listing");
      return value;
    },
    remoteCreateFolder: (sessionId, parent, folder) =>
      operation(fileBrowserIpc.remoteCreateFolder, {
        sessionId: session(sessionId),
        parent: path(parent),
        name: name(folder),
      }),
    remoteCreateFile: (sessionId, parent, file) =>
      operation(fileBrowserIpc.remoteCreateFile, {
        sessionId: session(sessionId),
        parent: path(parent),
        name: name(file),
      }),
    remoteRename: (sessionId, filePath, newName) =>
      operation(fileBrowserIpc.remoteRename, {
        sessionId: session(sessionId),
        path: path(filePath),
        name: name(newName),
      }),
    remoteMove: (sessionId, paths, directory) =>
      operation(fileBrowserIpc.remoteMove, {
        sessionId: session(sessionId),
        paths: list(paths),
        directory: path(directory),
      }),
    remoteDelete: (sessionId, paths) =>
      operation(fileBrowserIpc.remoteDelete, {
        sessionId: session(sessionId),
        paths: list(paths),
      }),
    remoteDownload: (sessionId, paths) =>
      operation(fileBrowserIpc.remoteDownload, {
        sessionId: session(sessionId),
        paths: list(paths),
      }),
    remoteUpload: (sessionId, directory) =>
      operation(fileBrowserIpc.remoteUpload, {
        sessionId: session(sessionId),
        directory: path(directory),
      }),
    remoteEdit: (sessionId, filePath) =>
      operation(fileBrowserIpc.remoteEdit, {
        sessionId: session(sessionId),
        path: path(filePath),
      }),
    async cancelTransfer(id) {
      if (typeof id !== "string" || id.length > 64)
        throw new TypeError("Invalid transfer");
      await ipc.invoke(fileBrowserIpc.cancelTransfer, id);
    },
    onTransfer(listener) {
      const handler = (_event: IpcRendererEvent, payload: unknown) => {
        if (isTransferEvent(payload)) listener(payload);
      };
      ipc.on(fileBrowserIpc.transfer, handler);
      return () => ipc.removeListener(fileBrowserIpc.transfer, handler);
    },
    onToggle(listener) {
      const handler = (_event: IpcRendererEvent, payload: unknown) => {
        if (payload === undefined) listener();
      };
      ipc.on(fileBrowserIpc.toggle, handler);
      return () => ipc.removeListener(fileBrowserIpc.toggle, handler);
    },
  };
}
