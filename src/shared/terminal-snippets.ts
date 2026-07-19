export const MAX_SNIPPET_COUNT = 512;
export const MAX_SNIPPET_NAME_LENGTH = 128;
export const MAX_SNIPPET_DESCRIPTION_LENGTH = 512;
export const MAX_SNIPPET_BODY_LENGTH = 65_536;
export const MAX_SNIPPETS_ERROR_LENGTH = 2048;

export interface TerminalSnippet {
  readonly name: string;
  readonly body: string;
  readonly description?: string;
  readonly execute: boolean;
}

// One response shape for both outcomes: an invalid snippets.json yields an
// empty list plus the precise diagnostic the sidebar shows in place of it.
export interface TerminalSnippetsResponse {
  readonly snippets: readonly TerminalSnippet[];
  readonly error?: string;
}

export function isTerminalSnippetsResponse(
  value: unknown,
): value is TerminalSnippetsResponse {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const keys = Object.keys(value);
  if (!keys.every((key) => ["snippets", "error"].includes(key))) return false;
  const { snippets, error } = value as Record<string, unknown>;
  if (
    error !== undefined &&
    (typeof error !== "string" ||
      error.length === 0 ||
      error.length > MAX_SNIPPETS_ERROR_LENGTH)
  )
    return false;
  return (
    Array.isArray(snippets) &&
    snippets.length <= MAX_SNIPPET_COUNT &&
    snippets.every(isTerminalSnippet)
  );
}

function isTerminalSnippet(value: unknown): value is TerminalSnippet {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const keys = Object.keys(value);
  if (
    !keys.every((key) =>
      ["name", "body", "description", "execute"].includes(key),
    )
  )
    return false;
  const { name, body, description, execute } = value as Record<string, unknown>;
  return (
    typeof name === "string" &&
    name.length > 0 &&
    name.length <= MAX_SNIPPET_NAME_LENGTH &&
    typeof body === "string" &&
    body.length > 0 &&
    body.length <= MAX_SNIPPET_BODY_LENGTH &&
    (description === undefined ||
      (typeof description === "string" &&
        description.length <= MAX_SNIPPET_DESCRIPTION_LENGTH)) &&
    typeof execute === "boolean"
  );
}
