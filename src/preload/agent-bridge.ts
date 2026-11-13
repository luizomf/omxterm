import type { IpcRenderer, IpcRendererEvent } from "electron";
import {
  agentIpc,
  isAgentAccessState,
  isAgentPressRequest,
  isAgentPressResult,
  isAgentReadRequest,
  isAgentReadResult,
  type AgentAccessBridge,
} from "../shared/agent-access";

// A window's agent grant (ADR 0052): main's state, reads and presses in;
// confirmations, stops, read results and encoded presses out. Payloads are
// checked both ways.
export function createAgentBridge(
  ipcRenderer: Pick<IpcRenderer, "send" | "on" | "removeListener">,
): AgentAccessBridge {
  return {
    onState(listener) {
      const handler = (_event: IpcRendererEvent, payload: unknown) => {
        if (isAgentAccessState(payload)) listener(payload);
      };
      ipcRenderer.on(agentIpc.state, handler);
      return () => ipcRenderer.removeListener(agentIpc.state, handler);
    },
    shown: () => ipcRenderer.send(agentIpc.shown),
    stop: () => ipcRenderer.send(agentIpc.stop),
    onRead(listener) {
      const handler = (_event: IpcRendererEvent, payload: unknown) => {
        if (isAgentReadRequest(payload)) listener(payload);
      };
      ipcRenderer.on(agentIpc.read, handler);
      return () => ipcRenderer.removeListener(agentIpc.read, handler);
    },
    readResult(result) {
      if (!isAgentReadResult(result))
        throw new TypeError("Invalid agent read result");
      ipcRenderer.send(agentIpc.readResult, result);
    },
    onPress(listener) {
      const handler = (_event: IpcRendererEvent, payload: unknown) => {
        if (isAgentPressRequest(payload)) listener(payload);
      };
      ipcRenderer.on(agentIpc.press, handler);
      return () => ipcRenderer.removeListener(agentIpc.press, handler);
    },
    pressResult(result) {
      if (!isAgentPressResult(result))
        throw new TypeError("Invalid agent press result");
      ipcRenderer.send(agentIpc.pressResult, result);
    },
  };
}
