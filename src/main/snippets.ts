import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  MAX_SNIPPET_BODY_LENGTH,
  MAX_SNIPPET_COUNT,
  MAX_SNIPPET_DESCRIPTION_LENGTH,
  MAX_SNIPPET_NAME_LENGTH,
  type TerminalSnippet,
  type TerminalSnippetsResponse,
} from "../shared/terminal-snippets";

export const TERMINAL_SNIPPETS_VERSION = 1;

export interface LoadTerminalSnippetsOptions {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly homeDirectory: string;
  readonly read?: typeof readFile;
}

export function resolveTerminalSnippetsPath(
  environment: Readonly<Record<string, string | undefined>>,
  homeDirectory: string,
): string {
  const root =
    environment.XDG_CONFIG_HOME || path.join(homeDirectory, ".config");
  return path.join(root, "omxterm", "snippets.json");
}

// Read-only, on-demand load: called each time the Snippets Sidebar opens.
// Absence is the clean empty state; any failure returns the precise,
// content-free diagnostic the sidebar shows in place of the list. This
// function never throws and the user's file is never created or modified.
export async function loadTerminalSnippets(
  options: LoadTerminalSnippetsOptions,
): Promise<TerminalSnippetsResponse> {
  const snippetsPath = resolveTerminalSnippetsPath(
    options.environment,
    options.homeDirectory,
  );
  const failure = (
    location: string | undefined,
    reason: string,
  ): TerminalSnippetsResponse =>
    Object.freeze({
      snippets: Object.freeze([]),
      error: terminalSnippetsDiagnostic(snippetsPath, location, reason),
    });

  let bytes: Uint8Array;
  try {
    bytes = await (options.read ?? readFile)(snippetsPath);
  } catch (cause) {
    if (isNotFound(cause))
      return Object.freeze({ snippets: Object.freeze([]) });
    return failure(undefined, "the file could not be read");
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return failure(undefined, "the file is not valid UTF-8");
  }

  let document: unknown;
  try {
    document = JSON.parse(text) as unknown;
  } catch {
    return failure(undefined, "the file is not valid JSON");
  }

  return validateTerminalSnippets(document, failure);
}

export function terminalSnippetsDiagnostic(
  snippetsPath: string,
  location: string | undefined,
  reason: string,
): string {
  const safeLocation = location
    ? ` at ${JSON.stringify(location.slice(0, 128))}`
    : "";
  // The location is file content and stays JSON-escaped; the path is
  // system-derived and must remain copyable, so Windows backslashes are
  // never doubled by escaping.
  return `Snippets "${snippetsPath}"${safeLocation}: ${reason}. Fix the file and reopen the Snippets Sidebar.`;
}

function validateTerminalSnippets(
  document: unknown,
  failure: (
    location: string | undefined,
    reason: string,
  ) => TerminalSnippetsResponse,
): TerminalSnippetsResponse {
  if (
    typeof document !== "object" ||
    document === null ||
    Array.isArray(document)
  )
    return failure("$", "must be an object");
  const root = document as Record<string, unknown>;
  const unknownKey = Object.keys(root).find(
    (key) => !["version", "snippets"].includes(key),
  );
  if (unknownKey !== undefined) return failure(`$.${unknownKey}`, "is unknown");
  if (!("version" in root)) return failure("version", "is required");
  if (root.version !== TERMINAL_SNIPPETS_VERSION)
    return failure("version", "must be 1");
  if (!("snippets" in root)) return failure("snippets", "is required");
  if (!Array.isArray(root.snippets))
    return failure("snippets", "must be an array");
  if (root.snippets.length > MAX_SNIPPET_COUNT)
    return failure(
      "snippets",
      `must contain at most ${MAX_SNIPPET_COUNT} snippets`,
    );

  const snippets: TerminalSnippet[] = [];
  for (const [index, entry] of root.snippets.entries()) {
    const location = (field?: string) =>
      field === undefined
        ? `snippets[${index}]`
        : `snippets[${index}].${field}`;
    if (typeof entry !== "object" || entry === null || Array.isArray(entry))
      return failure(location(), "must be an object");
    const item = entry as Record<string, unknown>;
    const unknown = Object.keys(item).find(
      (key) => !["name", "body", "description", "execute"].includes(key),
    );
    if (unknown !== undefined) return failure(location(unknown), "is unknown");
    const { name, body, description, execute } = item;
    if (
      typeof name !== "string" ||
      name.length === 0 ||
      name.length > MAX_SNIPPET_NAME_LENGTH
    )
      return failure(
        location("name"),
        `must be a non-empty string of at most ${MAX_SNIPPET_NAME_LENGTH} characters`,
      );
    if (
      typeof body !== "string" ||
      body.length === 0 ||
      body.length > MAX_SNIPPET_BODY_LENGTH
    )
      return failure(
        location("body"),
        `must be a non-empty string of at most ${MAX_SNIPPET_BODY_LENGTH} characters`,
      );
    if (
      description !== undefined &&
      (typeof description !== "string" ||
        description.length > MAX_SNIPPET_DESCRIPTION_LENGTH)
    )
      return failure(
        location("description"),
        `must be a string of at most ${MAX_SNIPPET_DESCRIPTION_LENGTH} characters`,
      );
    if (execute !== undefined && typeof execute !== "boolean")
      return failure(location("execute"), "must be a boolean");
    snippets.push(
      Object.freeze({
        name,
        body,
        ...(description === undefined ? {} : { description }),
        execute: execute ?? false,
      }),
    );
  }
  return Object.freeze({ snippets: Object.freeze(snippets) });
}

function isNotFound(cause: unknown): boolean {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    cause.code === "ENOENT"
  );
}
