import { readFileSync } from "node:fs";
import path from "node:path";
import { app, BrowserWindow, shell, type IpcMain } from "electron";
import {
  ASSISTANT_PROVIDERS,
  ASSISTANT_PROVIDER_IDS,
  DEFAULT_ASSISTANT_SETTINGS,
  MAX_ASSISTANT_KEY_LENGTH,
  MAX_ASSISTANT_MESSAGES,
  assistantIpc,
  assistantApiBase,
  assistantModel,
  isAssistantMessages,
  isAssistantProvider,
  isAssistantSettings,
  type AssistantMessage,
  type AssistantProvider,
  type AssistantSettings,
  type AssistantState,
} from "../shared/assistant";
import { createApplicationDocumentStore } from "./application-data";
import {
  assistantSystemPrompt,
  createAssistantService,
  type AssistantEndpoint,
} from "./assistant-service";
import type { CredentialStore } from "./credential-store";
import type { OperationalEventLog } from "./operational-events";
import type { IpcEvent, IpcMainPort } from "./terminal-ipc-types";
import { registerTrustedHandlers } from "./trusted-ipc";

function validSettings(value: unknown): AssistantSettings {
  if (!isAssistantSettings(value))
    throw new TypeError("Invalid assistant settings");
  return value;
}

function validHistory(value: unknown): readonly AssistantMessage[] {
  if (!isAssistantMessages(value))
    throw new TypeError("Invalid assistant history");
  return value;
}

function operatingSystem(platform: string): string {
  if (platform === "darwin") return "macOS";
  if (platform === "win32") return "Windows";
  try {
    const release = readFileSync("/etc/os-release", "utf8");
    const pretty = /^PRETTY_NAME="?([^"\n]*)"?$/mu.exec(release)?.[1];
    const like = /^ID_LIKE="?([^"\n]*)"?$/mu.exec(release)?.[1];
    if (pretty) return like ? `${pretty} (based on ${like})` : pretty;
  } catch {
    // Not every Linux has os-release.
  }
  return "Linux";
}

function languageName(): string {
  const preferred = app.getPreferredSystemLanguages()[0] ?? "en";
  try {
    return (
      new Intl.DisplayNames(["en"], { type: "language" }).of(preferred) ??
      "English"
    );
  } catch {
    return "English";
  }
}

// The opt-in AI assistant: settings and conversation history are Application
// Data, API keys live in the system keychain through Electron safeStorage,
// and requests leave the computer only when the user sends a message with
// the assistant turned on.
export async function startAssistant(options: {
  readonly ipcMain: IpcMain;
  readonly isTrustedSender: (event: IpcEvent) => boolean;
  readonly operationalEvents: Pick<OperationalEventLog, "write">;
  readonly directory: string;
  readonly shell: string;
  readonly credentials: CredentialStore;
}) {
  const settingsStore = createApplicationDocumentStore<AssistantSettings>(
    {
      fileName: "assistant.json",
      version: 1,
      empty: () => DEFAULT_ASSISTANT_SETTINGS,
      validate: validSettings,
    },
    { directory: options.directory },
  );
  const historyStore = createApplicationDocumentStore<
    readonly AssistantMessage[]
  >(
    {
      fileName: "assistant-history.json",
      version: 1,
      empty: () => [],
      validate: validHistory,
    },
    { directory: options.directory },
  );
  let settings = (await settingsStore.load()).value;
  let history = (await historyStore.load()).value;
  const { credentials } = options;
  const service = createAssistantService();
  const requests = new Map<string, AbortController>();
  const keyId = (provider: AssistantProvider) => `ai:${provider}`;

  const state = async (): Promise<AssistantState> => {
    const keyStorage = credentials.availability().available;
    const keys: Partial<Record<AssistantProvider, boolean>> = {};
    for (const provider of ASSISTANT_PROVIDER_IDS)
      keys[provider] = await credentials
        .has(keyId(provider))
        .catch(() => false);
    return { settings, keys, keyStorage };
  };
  const broadcast = async () => {
    const current = await state();
    for (const window of BrowserWindow.getAllWindows())
      if (!window.webContents.isDestroyed())
        window.webContents.send(assistantIpc.changed, current);
  };
  const endpoint = async (
    provider: AssistantProvider,
  ): Promise<AssistantEndpoint> => {
    const definition = ASSISTANT_PROVIDERS[provider];
    const apiKey = await credentials
      .get(keyId(provider))
      .catch(() => undefined);
    if (definition.needsKey && !apiKey)
      throw new Error(
        `Add the ${definition.name} API key in Preferences → Assistant.`,
      );
    return {
      provider,
      baseUrl:
        provider === "local"
          ? assistantApiBase(settings.localBaseUrl)
          : definition.baseUrl,
      model: assistantModel(settings, provider),
      ...(apiKey ? { apiKey } : {}),
    };
  };
  const provider = (value: unknown) => {
    if (!isAssistantProvider(value)) throw new TypeError("Invalid provider");
    return value;
  };

  app.on("will-quit", () => {
    for (const controller of requests.values()) controller.abort();
  });

  registerTrustedHandlers(
    options.ipcMain as unknown as IpcMainPort,
    options.isTrustedSender,
    {
      [assistantIpc.state]: () => state(),
      [assistantIpc.saveSettings]: async (_event, payload) => {
        const next = validSettings(payload);
        await settingsStore.save(next);
        settings = next;
        // Turning the assistant off stops what is in flight.
        if (!next.enabled)
          for (const controller of requests.values()) controller.abort();
        await broadcast();
        return state();
      },
      [assistantIpc.setKey]: async (_event, payload) => {
        if (typeof payload !== "object" || payload === null)
          throw new TypeError("Invalid key request");
        const request = payload as Record<string, unknown>;
        const id = keyId(provider(request.provider));
        if (request.key === null) await credentials.delete(id);
        else {
          const key = typeof request.key === "string" ? request.key.trim() : "";
          if (
            key === "" ||
            key.length > MAX_ASSISTANT_KEY_LENGTH ||
            /[\s\p{Cc}]/u.test(key)
          )
            throw new TypeError("Invalid API key");
          await credentials.set(id, key);
        }
        await broadcast();
        return state();
      },
      [assistantIpc.models]: async (_event, payload) =>
        service.models(await endpoint(provider(payload))),
      // Opens the provider's own page for creating API keys; the address is
      // fixed per provider, never taken from the renderer.
      [assistantIpc.openKeyPage]: async (_event, payload) => {
        const url = ASSISTANT_PROVIDERS[provider(payload)].keyUrl;
        if (url) await shell.openExternal(url);
      },
      [assistantIpc.test]: async (_event, payload) => ({
        count: (await service.models(await endpoint(provider(payload)))).length,
      }),
      [assistantIpc.chat]: async (event, payload) => {
        if (!settings.enabled) throw new Error("The assistant is turned off.");
        if (typeof payload !== "object" || payload === null)
          throw new TypeError("Invalid assistant request");
        const request = payload as Record<string, unknown>;
        const requestId = request.requestId;
        if (
          typeof requestId !== "string" ||
          !/^[\w-]{1,64}$/u.test(requestId) ||
          requests.has(requestId)
        )
          throw new TypeError("Invalid request id");
        if (!isAssistantMessages(request.messages))
          throw new TypeError("Invalid conversation");
        const messages = request.messages;
        const controller = new AbortController();
        requests.set(requestId, controller);
        const sender = event.sender;
        const send = (value: unknown) => {
          if (!sender.isDestroyed()) sender.send(assistantIpc.event, value);
        };
        try {
          await service.chat(
            await endpoint(settings.provider),
            assistantSystemPrompt({
              system: operatingSystem(process.platform),
              shell: path.basename(options.shell),
              language: languageName(),
            }),
            messages,
            (text) => send({ requestId, type: "delta", text }),
            controller.signal,
          );
          send({ requestId, type: "done" });
        } catch (cause) {
          send({
            requestId,
            type: "error",
            message:
              cause instanceof Error
                ? cause.message.slice(0, 512)
                : "The request failed.",
          });
        } finally {
          requests.delete(requestId);
        }
      },
      [assistantIpc.cancel]: (_event, payload) => {
        if (typeof payload === "string") requests.get(payload)?.abort();
      },
      [assistantIpc.history]: () => history,
      [assistantIpc.saveHistory]: async (_event, payload) => {
        const next = validHistory(payload).slice(-MAX_ASSISTANT_MESSAGES * 2);
        await historyStore.save(next);
        history = next;
      },
    },
    () =>
      options.operationalEvents.write({
        name: "boundary.rejected",
        boundary: "ipc",
        reason: "untrusted-sender",
      }),
  );

  return {
    toggle() {
      const window =
        BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      if (window && !window.webContents.isDestroyed())
        window.webContents.send(assistantIpc.toggle);
    },
  };
}
