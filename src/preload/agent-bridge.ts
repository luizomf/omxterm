import type { IpcRenderer, IpcRendererEvent } from "electron";
import {
  agentIpc,
  isAgentAccessState,
  isAgentActionCancel,
  isAgentActionRequest,
  isAgentActionResult,
  isAgentPressRequest,
  isAgentPressResult,
  isAgentReadRequest,
  isAgentReadResult,
  isAgentTabsRequest,
  isAgentTabsResult,
  type AgentAccessBridge,
} from "../shared/agent-access";

// A window's agent grant (ADR 0052): main's state, reads, tab lists, presses
// and shortcut actions in; confirmations, stops, read results, tab lists,
// encoded presses and action results out. Payloads are checked both ways.
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
    onTabs(listener) {
      const handler = (_event: IpcRendererEvent, payload: unknown) => {
        if (isAgentTabsRequest(payload)) listener(payload);
      };
      ipcRenderer.on(agentIpc.tabs, handler);
      return () => ipcRenderer.removeListener(agentIpc.tabs, handler);
    },
    tabsResult(result) {
      if (!isAgentTabsResult(result))
        throw new TypeError("Invalid agent tabs result");
      ipcRenderer.send(agentIpc.tabsResult, result);
    },
    onAction(listener) {
      const handler = (_event: IpcRendererEvent, payload: unknown) => {
        if (isAgentActionRequest(payload)) listener(payload);
      };
      ipcRenderer.on(agentIpc.action, handler);
      return () => ipcRenderer.removeListener(agentIpc.action, handler);
    },
    actionResult(result) {
      if (!isAgentActionResult(result))
        throw new TypeError("Invalid agent action result");
      ipcRenderer.send(agentIpc.actionResult, result);
    },
    onActionCancel(listener) {
      const handler = (_event: IpcRendererEvent, payload: unknown) => {
        if (isAgentActionCancel(payload)) listener(payload.id);
      };
      ipcRenderer.on(agentIpc.actionCancel, handler);
      return () => ipcRenderer.removeListener(agentIpc.actionCancel, handler);
    },
  };
}
