# AI assistant

**Status: not implemented. A maintainer decision is pending.**

## Requirements carried over

From the parity brief and AshyTerm:

- Strictly opt-in, and off by default.
- Never sends terminal output, commands or files unless the user explicitly
  includes them in a request.
- Providers: Ollama (local), OpenAI-compatible endpoints (OpenAI, Groq,
  OpenRouter), Gemini and Anthropic.
- API keys only in the Credential Store (`ai:<provider>`); never in
  `config.json`, logs, or the renderer.
- Suggested commands go through the Command Manager's preview: Insert or
  Run, never automatic execution.

## Open decision

Each provider has its own HTTP API. For Anthropic, the supported way to call
the API from TypeScript is the official SDK (`@anthropic-ai/sdk`), not
hand-written requests. Adding it means a new runtime dependency in main; the
other providers would use their own APIs, or an OpenAI-compatible endpoint
where they offer one. Before implementing, the maintainer should choose:

1. **Dependencies:** which providers ship, and whether official SDKs may be
   added as runtime dependencies (supply-chain and package-size review);
2. **Default model per provider:** user-editable in the panel;
3. **Network:** whether requests run only from main with an allowlist of
   provider hosts (recommended).

## Planned shape

- Main: an `assistant` service with a request queue, timeouts and
  cancellation.
  - The renderer sends a prompt, plus a selection only when the user
    attaches it.
  - The Credential Store keeps the key, which the renderer can set but
    never read.
- Renderer: an Assistant sidebar panel that sits next to Sessions and
  Commands.
  - It has an input, the conversation, and an "Include selection" control.
  - Code blocks offer Insert and Run through the existing command preview.
