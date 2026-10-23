import {
  ASSISTANT_PROVIDERS,
  MAX_ASSISTANT_MESSAGES,
  MAX_ASSISTANT_MESSAGE_LENGTH,
  type AssistantMessage,
  type AssistantProvider,
} from "../shared/assistant";

// Talks to OpenAI-compatible chat completion endpoints. Only main has network
// access and the API key; the renderer sends a conversation and receives the
// streamed answer text.
export interface AssistantEndpoint {
  readonly provider: AssistantProvider;
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey?: string;
}

export type Fetch = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal: AbortSignal;
  },
) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  readonly body: ReadableStream<Uint8Array> | null;
  text(): Promise<string>;
}>;

const MAX_ANSWER_LENGTH = 200_000;
const MAX_ERROR_LENGTH = 400;
const CLOUD_TIMEOUT_MS = 60_000;
const LOCAL_TIMEOUT_MS = 120_000;

export class AssistantRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssistantRequestError";
  }
}

const join = (base: string, path: string) =>
  `${base.replace(/\/+$/u, "")}/${path}`;

function headers(endpoint: AssistantEndpoint): Record<string, string> {
  return {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    ...(endpoint.apiKey ? { authorization: `Bearer ${endpoint.apiKey}` } : {}),
  };
}

// A provider's error, bounded and without anything resembling the key.
async function failure(
  response: Awaited<ReturnType<Fetch>>,
  endpoint: AssistantEndpoint,
): Promise<AssistantRequestError> {
  let detail = "";
  try {
    const text = (await response.text()).slice(0, 8_192);
    try {
      const parsed = JSON.parse(text) as {
        error?: { message?: unknown } | string;
        message?: unknown;
      };
      const message =
        typeof parsed.error === "string"
          ? parsed.error
          : (parsed.error?.message ?? parsed.message);
      detail = typeof message === "string" ? message : text;
    } catch {
      detail = text;
    }
  } catch {
    detail = "";
  }
  if (endpoint.apiKey) detail = detail.replaceAll(endpoint.apiKey, "•••");
  detail = detail.replace(/\s+/gu, " ").trim().slice(0, MAX_ERROR_LENGTH);
  const name = ASSISTANT_PROVIDERS[endpoint.provider].name;
  return new AssistantRequestError(
    `${name} responded with HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
  );
}

function timeoutSignal(endpoint: AssistantEndpoint, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(
    endpoint.provider === "local" ? LOCAL_TIMEOUT_MS : CLOUD_TIMEOUT_MS,
  );
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function networkError(cause: unknown, endpoint: AssistantEndpoint): Error {
  if (cause instanceof AssistantRequestError) return cause;
  const name = ASSISTANT_PROVIDERS[endpoint.provider].name;
  if (cause instanceof Error && cause.name === "AbortError")
    return new AssistantRequestError("Request cancelled.");
  if (cause instanceof Error && cause.name === "TimeoutError")
    return new AssistantRequestError(`${name} did not answer in time.`);
  return new AssistantRequestError(`${name} could not be reached.`);
}

// Reads server-sent events, calling onDelta for each content fragment.
async function readStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (text: string) => void,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffered = "";
  let total = 0;
  const reader = body.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffered.indexOf("\n")) >= 0) {
      const line = buffered.slice(0, newline).trim();
      buffered = buffered.slice(newline + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      let parsed: {
        error?: { message?: string };
        choices?: { delta?: { content?: unknown } }[];
      };
      try {
        parsed = JSON.parse(data) as typeof parsed;
      } catch {
        continue;
      }
      if (parsed.error)
        throw new AssistantRequestError(
          String(
            parsed.error.message ?? "The provider reported an error",
          ).slice(0, MAX_ERROR_LENGTH),
        );
      const text = parsed.choices?.[0]?.delta?.content;
      if (typeof text !== "string" || text === "") continue;
      total += text.length;
      if (total > MAX_ANSWER_LENGTH)
        throw new AssistantRequestError("The answer was too long.");
      onDelta(text);
    }
  }
}

export function createAssistantService(fetchImplementation: Fetch = fetch) {
  return {
    // Streams an answer. The conversation is trimmed to the most recent
    // messages and each message to a bounded length before it is sent.
    async chat(
      endpoint: AssistantEndpoint,
      system: string,
      messages: readonly AssistantMessage[],
      onDelta: (text: string) => void,
      signal: AbortSignal,
    ): Promise<void> {
      const recent = messages.slice(-MAX_ASSISTANT_MESSAGES).map((message) => ({
        role: message.role,
        content: message.content.slice(0, MAX_ASSISTANT_MESSAGE_LENGTH),
      }));
      try {
        const response = await fetchImplementation(
          join(endpoint.baseUrl, "chat/completions"),
          {
            method: "POST",
            headers: headers(endpoint),
            body: JSON.stringify({
              model: endpoint.model,
              stream: true,
              messages: [{ role: "system", content: system }, ...recent],
            }),
            signal: timeoutSignal(endpoint, signal),
          },
        );
        if (!response.ok) throw await failure(response, endpoint);
        const type = response.headers.get("content-type") ?? "";
        if (type.includes("text/event-stream") && response.body) {
          await readStream(response.body, onDelta);
          return;
        }
        // Some servers ignore stream: true and answer once.
        const parsed = JSON.parse(
          (await response.text()).slice(0, MAX_ANSWER_LENGTH),
        ) as {
          choices?: { message?: { content?: unknown } }[];
        };
        const text = parsed.choices?.[0]?.message?.content;
        if (typeof text === "string") onDelta(text);
      } catch (cause) {
        throw networkError(cause, endpoint);
      }
    },

    // Model ids the endpoint lists, for the Preferences suggestions.
    async models(endpoint: AssistantEndpoint): Promise<string[]> {
      try {
        const response = await fetchImplementation(
          join(endpoint.baseUrl, "models"),
          {
            method: "GET",
            headers: headers(endpoint),
            signal: timeoutSignal(endpoint),
          },
        );
        if (!response.ok) throw await failure(response, endpoint);
        const parsed = JSON.parse(
          (await response.text()).slice(0, 2_000_000),
        ) as {
          data?: { id?: unknown }[];
          models?: { id?: unknown; name?: unknown }[];
        };
        const items = parsed.data ?? parsed.models ?? [];
        return [
          ...new Set(
            items
              .map((item) =>
                typeof item.id === "string"
                  ? item.id
                  : typeof (item as { name?: unknown }).name === "string"
                    ? (item as { name: string }).name
                    : undefined,
              )
              .filter(
                (id): id is string =>
                  id !== undefined && id.length > 0 && id.length <= 200,
              ),
          ),
        ]
          .sort()
          .slice(0, 1_000);
      } catch (cause) {
        throw networkError(cause, endpoint);
      }
    },
  };
}

export type AssistantService = ReturnType<typeof createAssistantService>;

// Distribution and shell only, sanitized: no terminal contents, paths or
// environment values reach the provider.
export function assistantSystemPrompt(context: {
  readonly system: string;
  readonly shell: string;
  readonly language: string;
}): string {
  const clean = (value: string) =>
    value.replace(/[^\w .\-()/:,+]/gu, "").slice(0, 100) || "unknown";
  return [
    `You are a terminal assistant inside OMXTerm, running on ${clean(context.system)} with the ${clean(context.shell)} shell.`,
    "Give accurate, safe answers. Put every shell command the user could run in its own fenced code block (```sh), one command per block, with no placeholders unless unavoidable.",
    "Warn clearly before any command that deletes data, changes permissions, or needs administrator rights.",
    `Answer in ${clean(context.language)}. Keep explanations short.`,
  ].join("\n");
}
