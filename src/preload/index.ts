import { contextBridge, ipcRenderer } from "electron";
import type { TerminalBridge } from "../shared/terminal-bridge";
import {
  isClipboardText,
  isBoundedTerminalPayload,
  isNonemptyClipboardText,
  isTerminalClipboardAction,
  isTerminalExit,
  isTerminalFontZoom,
  isTerminalSize,
  isTerminalTitleRequest,
  type TerminalExit,
  type TerminalFontZoom,
  type TerminalSize,
} from "../shared/terminal-contract";
import { terminalIpc } from "../shared/terminal-ipc";

const terminal: TerminalBridge = {
  async start() {
    await ipcRenderer.invoke(terminalIpc.start);
  },
  input(data: string) {
    if (!isBoundedTerminalPayload(data))
      throw new TypeError("Invalid terminal input payload");
    ipcRenderer.send(terminalIpc.input, data);
  },
  resize(size: TerminalSize) {
    if (!isTerminalSize(size))
      throw new TypeError("Invalid terminal resize payload");
    ipcRenderer.send(terminalIpc.resize, size);
  },
  close() {
    ipcRenderer.send(terminalIpc.close);
  },
  title(request: string) {
    if (!isTerminalTitleRequest(request))
      throw new TypeError("Invalid Terminal Title request");
    ipcRenderer.send(terminalIpc.title, request);
  },
  bell() {
    ipcRenderer.send(terminalIpc.bell);
  },
  openExternalLink(url: string) {
    if (typeof url !== "string" || url.length === 0)
      throw new TypeError("Invalid External Link request");
    ipcRenderer.send(terminalIpc.externalLink, url);
  },
  onOutput(listener: (data: string) => void) {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => {
      if (isBoundedTerminalPayload(data)) listener(data);
    };
    ipcRenderer.on(terminalIpc.output, handler);
    return () => ipcRenderer.removeListener(terminalIpc.output, handler);
  },
  onExit(listener: (exit: TerminalExit) => void) {
    const handler = (_event: Electron.IpcRendererEvent, exit: unknown) => {
      if (isTerminalExit(exit)) listener(exit);
    };
    ipcRenderer.on(terminalIpc.exit, handler);
    return () => ipcRenderer.removeListener(terminalIpc.exit, handler);
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
