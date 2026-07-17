import { contextBridge, ipcRenderer } from "electron";
import type { TerminalBridge } from "../shared/terminal-bridge";
import {
  isBoundedTerminalPayload,
  isTerminalExit,
  isTerminalFontZoom,
  isTerminalSize,
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
};

contextBridge.exposeInMainWorld(
  "omxterm",
  Object.freeze({ terminal: Object.freeze(terminal) }),
);
