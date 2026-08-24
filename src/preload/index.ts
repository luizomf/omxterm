import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { TerminalBridge } from "../shared/terminal-bridge";
import {
  isClipboardText,
  isBoundedTerminalPayload,
  isNonemptyClipboardText,
  isTerminalClipboardAction,
  isTerminalFontZoom,
  isTerminalSessionExit,
  isTerminalSessionId,
  isTerminalSessionOutput,
  isTerminalSessionTitle,
  isTerminalSize,
  isTerminalTabCommand,
  isTerminalTitleRequest,
  type TerminalExit,
  type TerminalFontZoom,
  type TerminalSessionId,
  type TerminalSize,
  type TerminalTabCommand,
} from "../shared/terminal-contract";
import { terminalIpc } from "../shared/terminal-ipc";
import {
  formatFilePathInsertion,
  isFilePathPlatform,
  MAX_INSERTED_PATHS,
} from "../shared/file-path-insertion";
import {
  isTerminalRendererConfiguration,
  isTerminalThemeUpdate,
} from "../shared/user-configuration";
import { isTerminalSnippetsResponse } from "../shared/terminal-snippets";
import type { TerminalThemeUpdate } from "../shared/terminal-theme";

let latestThemeUpdate: TerminalThemeUpdate | undefined;
const themeUpdateListeners = new Set<(update: TerminalThemeUpdate) => void>();
ipcRenderer.on(terminalIpc.themeUpdate, (_event, payload: unknown) => {
  if (!isTerminalThemeUpdate(payload)) return;
  latestThemeUpdate = payload;
  for (const listener of themeUpdateListeners) listener(payload);
});

const terminal: TerminalBridge = {
  async configuration() {
    const configuration: unknown = await ipcRenderer.invoke(
      terminalIpc.configuration,
    );
    if (!isTerminalRendererConfiguration(configuration))
      throw new TypeError("Invalid User Configuration response");
    return latestThemeUpdate
      ? Object.freeze({ ...configuration, ...latestThemeUpdate })
      : configuration;
  },
  async snippets() {
    const response: unknown = await ipcRenderer.invoke(terminalIpc.snippets);
    if (!isTerminalSnippetsResponse(response))
      throw new TypeError("Invalid Snippets response");
    return response;
  },
  onSnippetsToggle(listener: () => void) {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      if (payload === undefined) listener();
    };
    ipcRenderer.on(terminalIpc.snippetsToggle, handler);
    return () =>
      ipcRenderer.removeListener(terminalIpc.snippetsToggle, handler);
  },
  onTerminalThemeUpdate(listener) {
    themeUpdateListeners.add(listener);
    if (latestThemeUpdate) listener(latestThemeUpdate);
    return () => themeUpdateListeners.delete(listener);
  },
  async start() {
    const sessionId: unknown = await ipcRenderer.invoke(terminalIpc.start);
    if (!isTerminalSessionId(sessionId))
      throw new TypeError("Invalid Live Terminal Session identifier");
    return sessionId;
  },
  input(sessionId: TerminalSessionId, data: string) {
    if (!isTerminalSessionId(sessionId) || !isBoundedTerminalPayload(data))
      throw new TypeError("Invalid terminal input payload");
    ipcRenderer.send(terminalIpc.input, { sessionId, data });
  },
  resize(sessionId: TerminalSessionId, size: TerminalSize) {
    if (!isTerminalSessionId(sessionId) || !isTerminalSize(size))
      throw new TypeError("Invalid terminal resize payload");
    ipcRenderer.send(terminalIpc.resize, {
      sessionId,
      cols: size.cols,
      rows: size.rows,
    });
  },
  close(sessionId: TerminalSessionId) {
    if (!isTerminalSessionId(sessionId))
      throw new TypeError("Invalid terminal close payload");
    ipcRenderer.send(terminalIpc.close, { sessionId });
  },
  title(sessionId: TerminalSessionId, request: string) {
    if (!isTerminalSessionId(sessionId) || !isTerminalTitleRequest(request))
      throw new TypeError("Invalid Terminal Title request");
    ipcRenderer.send(terminalIpc.title, { sessionId, title: request });
  },
  bell(sessionId: TerminalSessionId) {
    if (!isTerminalSessionId(sessionId))
      throw new TypeError("Invalid Terminal Bell signal");
    ipcRenderer.send(terminalIpc.bell, { sessionId });
  },
  openExternalLink(url: string) {
    if (typeof url !== "string" || url.length === 0)
      throw new TypeError("Invalid External Link request");
    ipcRenderer.send(terminalIpc.externalLink, url);
  },
  onOutput(listener: (sessionId: TerminalSessionId, data: string) => void) {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      if (isTerminalSessionOutput(payload))
        listener(payload.sessionId, payload.data);
    };
    ipcRenderer.on(terminalIpc.output, handler);
    return () => ipcRenderer.removeListener(terminalIpc.output, handler);
  },
  onExit(listener: (sessionId: TerminalSessionId, exit: TerminalExit) => void) {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      if (isTerminalSessionExit(payload))
        listener(payload.sessionId, {
          exitCode: payload.exitCode,
          signal: payload.signal,
        });
    };
    ipcRenderer.on(terminalIpc.exit, handler);
    return () => ipcRenderer.removeListener(terminalIpc.exit, handler);
  },
  onTabCommand(listener: (command: TerminalTabCommand) => void) {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      if (isTerminalTabCommand(payload)) listener(payload);
    };
    ipcRenderer.on(terminalIpc.tabCommand, handler);
    return () => ipcRenderer.removeListener(terminalIpc.tabCommand, handler);
  },
  onTabTitle(listener: (sessionId: TerminalSessionId, title: string) => void) {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      if (isTerminalSessionTitle(payload))
        listener(payload.sessionId, payload.title);
    };
    ipcRenderer.on(terminalIpc.tabTitle, handler);
    return () => ipcRenderer.removeListener(terminalIpc.tabTitle, handler);
  },
  notifyTabSelection(sessionId: TerminalSessionId) {
    if (!isTerminalSessionId(sessionId))
      throw new TypeError("Invalid Terminal Tab selection");
    ipcRenderer.send(terminalIpc.tabSelected, { sessionId });
  },
  onFontZoom(listener: (command: TerminalFontZoom) => void) {
    const handler = (_event: Electron.IpcRendererEvent, command: unknown) => {
      if (isTerminalFontZoom(command)) listener(command);
    };
    ipcRenderer.on(terminalIpc.fontZoom, handler);
    return () => ipcRenderer.removeListener(terminalIpc.fontZoom, handler);
  },
  async writeClipboardText(text: string) {
    if (!isNonemptyClipboardText(text))
      throw new TypeError("Invalid clipboard write payload");
    await ipcRenderer.invoke(terminalIpc.clipboardWrite, text);
  },
  async readClipboardText() {
    const text: unknown = await ipcRenderer.invoke(terminalIpc.clipboardRead);
    if (!isClipboardText(text))
      throw new TypeError("Invalid clipboard read response");
    return text;
  },
  droppedFilePathInsertion(files: readonly File[]) {
    if (
      !Array.isArray(files) ||
      files.length === 0 ||
      files.length > MAX_INSERTED_PATHS
    )
      return "";
    try {
      if (!isFilePathPlatform(process.platform)) return "";
      const droppedFiles = files as readonly File[];
      return formatFilePathInsertion(
        droppedFiles.map((file) => webUtils.getPathForFile(file)),
        process.platform,
      );
    } catch {
      return "";
    }
  },
  async confirmPaste(text: string) {
    if (!isNonemptyClipboardText(text))
      throw new TypeError("Invalid Protected Paste payload");
    const confirmed: unknown = await ipcRenderer.invoke(
      terminalIpc.clipboardConfirmPaste,
      text,
    );
    if (typeof confirmed !== "boolean")
      throw new TypeError("Invalid Protected Paste response");
    return confirmed;
  },
  requestClipboardContextMenu() {
    ipcRenderer.send(terminalIpc.clipboardContextMenu);
  },
  onClipboardAction(listener) {
    const handler = (_event: Electron.IpcRendererEvent, action: unknown) => {
      if (isTerminalClipboardAction(action)) listener(action);
    };
    ipcRenderer.on(terminalIpc.clipboardAction, handler);
    return () =>
      ipcRenderer.removeListener(terminalIpc.clipboardAction, handler);
  },
};

contextBridge.exposeInMainWorld(
  "omxterm",
  Object.freeze({ terminal: Object.freeze(terminal) }),
);
