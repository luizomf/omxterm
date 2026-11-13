import type { IpcRenderer, IpcRendererEvent } from "electron";
import {
  isTerminalNotificationRequest,
  isTerminalSessionAttention,
  MAX_ATTENTION_SOUND_BYTES,
} from "../shared/terminal-attention";
import type { TerminalBridge } from "../shared/terminal-bridge";
import { terminalIpc } from "../shared/terminal-ipc";

// Program notifications out to main, and main's attention verdicts and the
// user's sound back in (ADR 0053). Payloads are checked on both sides.
export function createAttentionBridge(
  ipcRenderer: Pick<IpcRenderer, "send" | "on" | "removeListener">,
): Pick<TerminalBridge, "notify" | "onSessionAttention" | "onAttentionSound"> {
  return {
    notify(sessionId, notification) {
      const request = {
        sessionId,
        title: notification?.title,
        body: notification?.body,
      };
      if (!isTerminalNotificationRequest(request))
        throw new TypeError("Invalid Terminal Notification");
      ipcRenderer.send(terminalIpc.notification, request);
    },
    onSessionAttention(listener) {
      const handler = (_event: IpcRendererEvent, payload: unknown) => {
        if (isTerminalSessionAttention(payload))
          listener(payload.sessionId, payload.pending);
      };
      ipcRenderer.on(terminalIpc.sessionAttention, handler);
      return () =>
        ipcRenderer.removeListener(terminalIpc.sessionAttention, handler);
    },
    onAttentionSound(listener) {
      const handler = (_event: IpcRendererEvent, payload: unknown) => {
        if (
          payload instanceof Uint8Array &&
          payload.byteLength > 0 &&
          payload.byteLength <= MAX_ATTENTION_SOUND_BYTES
        )
          listener(payload);
      };
      ipcRenderer.on(terminalIpc.attentionSound, handler);
      return () =>
        ipcRenderer.removeListener(terminalIpc.attentionSound, handler);
    },
  };
}
