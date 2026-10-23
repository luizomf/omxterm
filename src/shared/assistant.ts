export const assistantIpc = {
  state: "assistant:state",
  saveSettings: "assistant:save-settings",
  setKey: "assistant:set-key",
  models: "assistant:models",
  test: "assistant:test",
  chat: "assistant:chat",
  cancel: "assistant:cancel",
  history: "assistant:history",
  saveHistory: "assistant:save-history",
  // Main → renderer.
  event: "assistant:event",
  changed: "assistant:changed",
  toggle: "assistant:toggle",
} as const;

// The providers AshyTerm offers. All speak the OpenAI chat completions API
// (Gemini through its OpenAI-compatible endpoint).
export const ASSISTANT_PROVIDERS = {
  groq: {
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.1-8b-instant",
    needsKey: true,
  },
  gemini: {
    name: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.5-flash",
    needsKey: true,
  },
  openrouter: {
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openrouter/auto",
    needsKey: true,
  },
  mistral: {
    name: "Mistral AI",
    baseUrl: "https://api.mistral.ai/v1",
    model: "mistral-small-latest",
    needsKey: true,
  },
  cerebras: {
    name: "Cerebras",
    baseUrl: "https://api.cerebras.ai/v1",
    model: "llama-3.3-70b",
    needsKey: true,
  },
  github: {
    name: "GitHub Models",
    baseUrl: "https://models.github.ai/inference",
    model: "openai/gpt-4o-mini",
    needsKey: true,
  },
  local: {
    name: "Local (Ollama, LM Studio)",
    baseUrl: "http://localhost:11434/v1",
    model: "llama3.2",
    needsKey: false,
  },
} as const;

export type AssistantProvider = keyof typeof ASSISTANT_PROVIDERS;
export const ASSISTANT_PROVIDER_IDS = Object.keys(
  ASSISTANT_PROVIDERS,
) as AssistantProvider[];

export interface AssistantSettings {
  // Off until the user turns it on; nothing is sent while off.
  readonly enabled: boolean;
  readonly provider: AssistantProvider;
  // The chosen model per provider; absent uses the provider's default.
  readonly models: Partial<Record<AssistantProvider, string>>;
  // The OpenAI-compatible base URL of a local server.
  readonly localBaseUrl: string;
}

export const DEFAULT_ASSISTANT_SETTINGS: AssistantSettings = Object.freeze({
  enabled: false,
  provider: "groq",
  models: Object.freeze({}),
  localBaseUrl: ASSISTANT_PROVIDERS.local.baseUrl,
});

export interface AssistantState {
  readonly settings: AssistantSettings;
  // Which providers have a stored key; keys never leave main.
  readonly keys: Partial<Record<AssistantProvider, boolean>>;
  // False where the system keychain cannot protect secrets.
  readonly keyStorage: boolean;
}

export interface AssistantMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
}

export type AssistantEvent =
  | {
      readonly requestId: string;
      readonly type: "delta";
      readonly text: string;
    }
  | { readonly requestId: string; readonly type: "done" }
  | {
      readonly requestId: string;
      readonly type: "error";
      readonly message: string;
    };

export const MAX_ASSISTANT_MESSAGES = 40;
export const MAX_ASSISTANT_MESSAGE_LENGTH = 50_000;
export const MAX_ASSISTANT_KEY_LENGTH = 512;
const MAX_MODEL_LENGTH = 200;
const MAX_URL_LENGTH = 512;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isAssistantProvider(
  value: unknown,
): value is AssistantProvider {
  return (
    typeof value === "string" &&
    (ASSISTANT_PROVIDER_IDS as readonly string[]).includes(value)
  );
}

const isModel = (value: unknown) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.length <= MAX_MODEL_LENGTH &&
  !/[\p{Cc}]/u.test(value);

// A local server must be reached over http(s); plain http only on this
// computer, so a key or a conversation never crosses a network unencrypted.
export function isAssistantBaseUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > MAX_URL_LENGTH) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username || url.password || url.search || url.hash) return false;
  if (url.protocol === "https:") return true;
  return (
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  );
}

export function isAssistantSettings(
  value: unknown,
): value is AssistantSettings {
  return (
    isRecord(value) &&
    Object.keys(value).length === 4 &&
    typeof value.enabled === "boolean" &&
    isAssistantProvider(value.provider) &&
    isRecord(value.models) &&
    Object.entries(value.models).every(
      ([provider, model]) => isAssistantProvider(provider) && isModel(model),
    ) &&
    isAssistantBaseUrl(value.localBaseUrl)
  );
}

export function isAssistantState(value: unknown): value is AssistantState {
  return (
    isRecord(value) &&
    isAssistantSettings(value.settings) &&
    isRecord(value.keys) &&
    Object.entries(value.keys).every(
      ([provider, has]) =>
        isAssistantProvider(provider) && typeof has === "boolean",
    ) &&
    typeof value.keyStorage === "boolean"
  );
}

export function isAssistantMessages(
  value: unknown,
): value is readonly AssistantMessage[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_ASSISTANT_MESSAGES * 2 &&
    value.every(
      (message) =>
        isRecord(message) &&
        Object.keys(message).length === 2 &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.length <= MAX_ASSISTANT_MESSAGE_LENGTH,
    )
  );
}

export function isAssistantEvent(value: unknown): value is AssistantEvent {
  if (!isRecord(value) || typeof value.requestId !== "string") return false;
  if (value.type === "done") return true;
  if (value.type === "delta") return typeof value.text === "string";
  return value.type === "error" && typeof value.message === "string";
}

export function assistantModel(
  settings: AssistantSettings,
  provider: AssistantProvider = settings.provider,
): string {
  return settings.models[provider] ?? ASSISTANT_PROVIDERS[provider].model;
}

// Commands an answer suggests: the contents of its fenced code blocks.
export function suggestedCommands(markdown: string): string[] {
  const commands: string[] = [];
  for (const match of markdown.matchAll(/```[^\n`]*\n([\s\S]*?)```/gu)) {
    const command = match[1]!.trim();
    if (command) commands.push(command);
  }
  return commands;
}
