import type { IpcRenderer, IpcRendererEvent } from "electron";
import {
  assistantIpc,
  isAssistantEvent,
  isAssistantMessages,
  isAssistantModelList,
  isAssistantProvider,
  isAssistantSettings,
  isAssistantState,
  MAX_ASSISTANT_KEY_LENGTH,
} from "../shared/assistant";
import type { AssistantBridge } from "../shared/terminal-bridge";

// The assistant panel and Preferences page reach the provider only through
// main; API keys go in but never come back out.
export function createAssistantBridge(ipc: IpcRenderer): AssistantBridge {
  const state = (value: unknown) => {
    if (!isAssistantState(value)) throw new TypeError("Invalid response");
    return value;
  };
  const provider = (value: unknown) => {
    if (!isAssistantProvider(value)) throw new TypeError("Invalid provider");
    return value;
  };
  const listen = <T>(
    channel: string,
    check: (value: unknown) => value is T,
    listener: (value: T) => void,
  ) => {
    const handler = (_event: IpcRendererEvent, payload: unknown) => {
      if (check(payload)) listener(payload);
    };
    ipc.on(channel, handler);
    return () => ipc.removeListener(channel, handler);
  };
  return {
    state: async () => state(await ipc.invoke(assistantIpc.state)),
    async saveSettings(settings) {
      if (!isAssistantSettings(settings))
        throw new TypeError("Invalid assistant settings");
      return state(await ipc.invoke(assistantIpc.saveSettings, settings));
    },
    async setKey(name, key) {
      if (
        key !== null &&
        (typeof key !== "string" || key.length > MAX_ASSISTANT_KEY_LENGTH)
      )
        throw new TypeError("Invalid API key");
      return state(
        await ipc.invoke(assistantIpc.setKey, {
          provider: provider(name),
          key,
        }),
      );
    },
    async models(name) {
      const value: unknown = await ipc.invoke(
        assistantIpc.models,
        provider(name),
      );
      if (!isAssistantModelList(value)) throw new TypeError("Invalid response");
      return value;
    },
    async openKeyPage(name) {
      await ipc.invoke(assistantIpc.openKeyPage, provider(name));
    },
    async test(name) {
      const value: unknown = await ipc.invoke(
        assistantIpc.test,
        provider(name),
      );
      const count = (value as { count?: unknown } | null)?.count;
      if (typeof count !== "number") throw new TypeError("Invalid response");
      return count;
    },
    async chat(requestId, messages) {
      if (typeof requestId !== "string" || !/^[\w-]{1,64}$/u.test(requestId))
        throw new TypeError("Invalid request id");
      if (!isAssistantMessages(messages))
        throw new TypeError("Invalid conversation");
      await ipc.invoke(assistantIpc.chat, {
        requestId,
        messages: messages.map(({ role, content }) => ({ role, content })),
      });
    },
    async cancel(requestId) {
      if (typeof requestId === "string")
        await ipc.invoke(assistantIpc.cancel, requestId);
    },
    async history() {
      const value: unknown = await ipc.invoke(assistantIpc.history);
      if (!isAssistantMessages(value)) throw new TypeError("Invalid response");
      return value;
    },
    async saveHistory(messages) {
      if (!isAssistantMessages(messages))
        throw new TypeError("Invalid conversation");
      await ipc.invoke(
        assistantIpc.saveHistory,
        messages.map(({ role, content }) => ({ role, content })),
      );
    },
    onEvent: (listener) =>
      listen(assistantIpc.event, isAssistantEvent, listener),
    onChanged: (listener) =>
      listen(assistantIpc.changed, isAssistantState, listener),
    onToggle(listener) {
      const handler = (_event: IpcRendererEvent, payload: unknown) => {
        if (payload === undefined) listener();
      };
      ipc.on(assistantIpc.toggle, handler);
      return () => ipc.removeListener(assistantIpc.toggle, handler);
    },
  };
}
