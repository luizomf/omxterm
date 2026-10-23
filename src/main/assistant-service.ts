import {
  ASSISTANT_PROVIDERS,
  type AssistantModelInfo,
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

const NETWORK_REASONS: Readonly<Record<string, string>> = {
  ECONNREFUSED: "connection refused; is the server running?",
  ENOTFOUND: "the host name was not found",
  EAI_AGAIN: "the host name could not be resolved",
  ECONNRESET: "the connection was reset",
  EHOSTUNREACH: "the host is unreachable",
  ENETUNREACH: "the network is unreachable",
  ETIMEDOUT: "the connection timed out",
  CERT_HAS_EXPIRED: "its TLS certificate has expired",
  DEPTH_ZERO_SELF_SIGNED_CERT: "its TLS certificate is self-signed",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "its TLS certificate is not trusted",
};

// Names the server and, when Node says why, the reason.
function networkError(cause: unknown, endpoint: AssistantEndpoint): Error {
  if (cause instanceof AssistantRequestError) return cause;
  const name = ASSISTANT_PROVIDERS[endpoint.provider].name;
  if (cause instanceof Error && cause.name === "AbortError")
    return new AssistantRequestError("Request cancelled.");
  if (cause instanceof Error && cause.name === "TimeoutError")
    return new AssistantRequestError(`${name} did not answer in time.`);
  const code = (cause as { cause?: { code?: unknown } } | undefined)?.cause
    ?.code;
  const reason = typeof code === "string" ? NETWORK_REASONS[code] : undefined;
  let where = "";
  try {
    where = ` at ${new URL(endpoint.baseUrl).host}`;
  } catch {
    where = "";
  }
  return new AssistantRequestError(
    `${name} could not be reached${where}${reason ? `: ${reason}` : "."}`,
  );
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
    async models(endpoint: AssistantEndpoint): Promise<AssistantModelInfo[]> {
      const get = (url: string) =>
        fetchImplementation(url, {
          method: "GET",
          headers: headers(endpoint),
          signal: timeoutSignal(endpoint),
        });
      try {
        let response = await get(join(endpoint.baseUrl, "models"));
        // Older Ollama servers list models only on their native API.
        if (response.status === 404 && endpoint.provider === "local")
          response = await get(new URL("/api/tags", endpoint.baseUrl).href);
        if (!response.ok) throw await failure(response, endpoint);
        return modelList(
          JSON.parse((await response.text()).slice(0, 4_000_000)) as unknown,
        );
      } catch (cause) {
        throw networkError(cause, endpoint);
      }
    },
  };
}

// Model ids with what each provider says about them: OpenRouter publishes
// prices (free when both are zero, or an id ending in ":free"), Groq and
// OpenRouter the context length; Ollama lists names.
export function modelList(parsed: unknown): AssistantModelInfo[] {
  const record = (parsed ?? {}) as { data?: unknown; models?: unknown };
  const items = Array.isArray(record.data)
    ? record.data
    : Array.isArray(record.models)
      ? record.models
      : [];
  const seen = new Map<string, AssistantModelInfo>();
  for (const raw of items as Record<string, unknown>[]) {
    if (typeof raw !== "object" || raw === null) continue;
    const id =
      typeof raw.id === "string"
        ? raw.id
        : typeof raw.name === "string"
          ? raw.name
          : typeof raw.model === "string"
            ? raw.model
            : undefined;
    if (!id || id.length > 200 || seen.has(id)) continue;
    const pricing = raw.pricing as
      { prompt?: unknown; completion?: unknown } | undefined;
    const price = (value: unknown) =>
      typeof value === "string" || typeof value === "number"
        ? Number(value)
        : Number.NaN;
    const free = id.endsWith(":free")
      ? true
      : pricing
        ? price(pricing.prompt) === 0 && price(pricing.completion) === 0
        : undefined;
    const context =
      typeof raw.context_length === "number"
        ? raw.context_length
        : typeof raw.context_window === "number"
          ? raw.context_window
          : undefined;
    const name =
      typeof raw.name === "string" && raw.name !== id && raw.name.length <= 200
        ? raw.name
        : undefined;
    seen.set(id, {
      id,
      ...(name ? { name } : {}),
      ...(free === undefined ? {} : { free }),
      ...(context === undefined ? {} : { context }),
    });
  }
  return [...seen.values()]
    .sort((first, second) => first.id.localeCompare(second.id))
    .slice(0, 2_000);
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
