import { contextBridge, ipcRenderer, webUtils } from "electron";
import { createAboutBridge } from "./about-bridge";
import type { TerminalBridge } from "../shared/terminal-bridge";
import {
  isWindowChromeCommand,
  isWindowChromeState,
} from "../shared/window-chrome";
import {
  isClipboardText,
  isBoundedTerminalPayload,
  isNonemptyClipboardText,
  isTerminalClipboardAction,
  isTerminalContextMenuRequest,
  isTerminalExportKind,
  isTerminalExportRequest,
  isTerminalFontZoom,
  isTerminalSessionExit,
  isTerminalSessionId,
  isTerminalSessionOutput,
  isTerminalSessionOutputAck,
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
  isSurfaceFontIdentity as isSurfaceIdentity,
} from "../shared/user-configuration";
import { isTerminalSnippetsResponse } from "../shared/terminal-snippets";
import type { TerminalRendererConfiguration } from "../shared/user-configuration";
import {
  isLocalImageData,
  isLocalImageRequest,
  type LocalImageActivation,
  type LocalImageRequest,
} from "../shared/local-image";
import {
  isTerminalFontData,
  isTerminalFontFamily,
} from "../shared/terminal-font-data";

let latestConfiguration: TerminalRendererConfiguration | undefined;
let configurationRevision = 0;
const configurationUpdateListeners = new Set<
  (configuration: TerminalRendererConfiguration) => void
>();
ipcRenderer.on(terminalIpc.configurationUpdate, (_event, payload: unknown) => {
  if (!isTerminalRendererConfiguration(payload)) return;
  latestConfiguration = payload;
  configurationRevision += 1;
  for (const listener of configurationUpdateListeners) listener(payload);
  if (payload.fontConfigurationId)
    ipcRenderer.send(
      terminalIpc.configurationObserved,
      payload.fontConfigurationId,
    );
});

const terminal: TerminalBridge = {
  async configuration() {
    const revisionAtRequest = configurationRevision;
    const configuration: unknown = await ipcRenderer.invoke(
      terminalIpc.configuration,
    );
    if (!isTerminalRendererConfiguration(configuration))
      throw new TypeError("Invalid User Configuration response");
    return configurationRevision === revisionAtRequest
      ? configuration
      : latestConfiguration!;
  },
  async fontData(family) {
    if (family !== undefined && !isTerminalFontFamily(family))
      throw new TypeError("Invalid Terminal Font family request");
    const response: unknown = await ipcRenderer.invoke(
      terminalIpc.fontData,
      family,
    );
    if (!isTerminalFontData(response))
      throw new TypeError("Invalid Terminal Font data response");
    return response;
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
  onTabBarToggle(listener) {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      if (payload === undefined) listener();
    };
    ipcRenderer.on(terminalIpc.tabBarToggle, handler);
    return () => ipcRenderer.removeListener(terminalIpc.tabBarToggle, handler);
  },
  onFind(listener) {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      if (payload === undefined) listener();
    };
    ipcRenderer.on(terminalIpc.find, handler);
    return () => ipcRenderer.removeListener(terminalIpc.find, handler);
  },
  onTitleBarToggle(listener) {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      if (payload === undefined) listener();
    };
    ipcRenderer.on(terminalIpc.titleBarToggle, handler);
    return () =>
      ipcRenderer.removeListener(terminalIpc.titleBarToggle, handler);
  },
  windowChrome(command) {
    if (!isWindowChromeCommand(command))
      throw new TypeError("Invalid Window Chrome command");
    ipcRenderer.send(terminalIpc.windowChromeCommand, command);
  },
  onWindowChrome(listener) {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      if (isWindowChromeState(payload)) listener(payload);
    };
    ipcRenderer.on(terminalIpc.windowChromeState, handler);
    ipcRenderer.send(terminalIpc.windowChromeCommand, "sync");
    return () =>
      ipcRenderer.removeListener(terminalIpc.windowChromeState, handler);
  },
  onConfigurationUpdate(listener) {
    configurationUpdateListeners.add(listener);
    if (latestConfiguration) listener(latestConfiguration);
    return () => configurationUpdateListeners.delete(listener);
  },
  async retainSurface(configurationId) {
    if (!isSurfaceIdentity(configurationId))
      throw new TypeError("Invalid Surface configuration identity");
    const surfaceId: unknown = await ipcRenderer.invoke(
      terminalIpc.retainSurface,
      configurationId,
    );
    if (!isSurfaceIdentity(surfaceId))
      throw new TypeError("Invalid Surface identity response");
    return surfaceId;
  },
  releaseSurface(surfaceId) {
    if (!isSurfaceIdentity(surfaceId))
      throw new TypeError("Invalid Surface identity");
    ipcRenderer.send(terminalIpc.releaseSurface, surfaceId);
  },
  async start(surfaceId) {
    if (surfaceId !== undefined && !isSurfaceIdentity(surfaceId))
      throw new TypeError("Invalid Surface identity");
    const sessionId: unknown = await (surfaceId === undefined
      ? ipcRenderer.invoke(terminalIpc.start)
      : ipcRenderer.invoke(terminalIpc.start, surfaceId));
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
  close(sessionId: TerminalSessionId, reason?: "rendering-failure") {
    if (
      !isTerminalSessionId(sessionId) ||
      (reason !== undefined && reason !== "rendering-failure")
    )
      throw new TypeError("Invalid terminal close payload");
    ipcRenderer.send(terminalIpc.close, {
      sessionId,
      ...(reason ? { reason } : {}),
    });
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
  loadLocalImage(source?: LocalImageActivation) {
    const request: LocalImageRequest = source ?? { source: "picker" };
    if (!isLocalImageRequest(request))
      throw new TypeError("Invalid local image request");
    return ipcRenderer
      .invoke(terminalIpc.localImage, request)
      .then((response: unknown) => {
        if (response !== null && !isLocalImageData(response))
          throw new TypeError("Invalid local image response");
        return response;
      });
  },
  onLocalImageOpen(listener: () => void) {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      if (payload === undefined) listener();
    };
    ipcRenderer.on(terminalIpc.localImageOpen, handler);
    return () =>
      ipcRenderer.removeListener(terminalIpc.localImageOpen, handler);
  },
  acknowledgeOutput(sessionId: TerminalSessionId, end: number) {
    const payload = { sessionId, end };
    if (!isTerminalSessionOutputAck(payload))
      throw new TypeError("Invalid terminal output acknowledgement");
    ipcRenderer.send(terminalIpc.outputAck, payload);
  },
  onOutput(
    listener: (sessionId: TerminalSessionId, data: string, end: number) => void,
  ) {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      if (isTerminalSessionOutput(payload))
        listener(payload.sessionId, payload.data, payload.end);
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
          ...(payload.startupFailed ? { startupFailed: true } : {}),
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
  syncTabTitle(sessionId) {
    if (!isTerminalSessionId(sessionId))
      throw new TypeError("Invalid Terminal Title synchronization");
    ipcRenderer.send(terminalIpc.tabTitleSync, { sessionId });
  },
  notifyTabsEmpty(reason) {
    if (reason !== undefined && reason !== "rendering-failure")
      throw new TypeError("Invalid empty Terminal Tabs reason");
    ipcRenderer.send(terminalIpc.tabsEmpty, reason);
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
  requestClipboardContextMenu(request) {
    if (!isTerminalContextMenuRequest(request))
      throw new TypeError("Invalid context menu request");
    ipcRenderer.send(terminalIpc.clipboardContextMenu, request);
  },
  onExportRequest(listener) {
    const handler = (_event: Electron.IpcRendererEvent, kind: unknown) => {
      if (isTerminalExportKind(kind)) listener(kind);
    };
    ipcRenderer.on(terminalIpc.exportRequest, handler);
    return () => ipcRenderer.removeListener(terminalIpc.exportRequest, handler);
  },
  async saveTerminalExport(request) {
    if (!isTerminalExportRequest(request))
      throw new TypeError("Invalid terminal export request");
    await ipcRenderer.invoke(terminalIpc.exportSave, request);
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
  Object.freeze({
    terminal: Object.freeze(terminal),
    about: Object.freeze(createAboutBridge(ipcRenderer)),
  }),
);
