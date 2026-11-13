import type { IpcRenderer, IpcRendererEvent } from "electron";
import {
  agentIpc,
  isAgentAccessState,
  isAgentReadRequest,
  isAgentReadResult,
  type AgentAccessBridge,
} from "../shared/agent-access";

// A window's agent grant (ADR 0052): main's state and read requests in,
// confirmations, stops and read results out. Payloads are checked both ways.
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
  };
}
