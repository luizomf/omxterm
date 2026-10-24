import { open, type readFile } from "node:fs/promises";
import path from "node:path";
import { Composer, CST, Parser } from "yaml";
import {
  MAX_SNIPPET_BODY_LENGTH,
  MAX_SNIPPET_COUNT,
  MAX_SNIPPET_DESCRIPTION_LENGTH,
  MAX_SNIPPET_NAME_LENGTH,
  type TerminalSnippet,
  type TerminalSnippetsResponse,
} from "../shared/terminal-snippets";

export const TERMINAL_SNIPPETS_VERSION = 1;
const MAX_FILE_BYTES = 1_048_576;

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
  return path.join(root, "omxterm", "snippets.yaml");
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
    bytes = await (options.read ?? readBoundedFile)(snippetsPath);
  } catch (cause) {
    if (isNotFound(cause))
      return Object.freeze({ snippets: Object.freeze([]) });
    return failure(undefined, "the file could not be read");
  }

  if (bytes.byteLength > MAX_FILE_BYTES)
    return failure(undefined, `must contain at most ${MAX_FILE_BYTES} bytes`);

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return failure(undefined, "the file is not valid UTF-8");
  }

  let document: unknown;
  try {
    document = parseSnippetsYaml(text);
  } catch (cause) {
    return failure(
      undefined,
      cause instanceof SnippetsYamlError
        ? cause.message
        : "the file is not valid YAML",
    );
  }

  return validateTerminalSnippets(document, failure);
}

class SnippetsYamlError extends Error {}

function parseSnippetsYaml(text: string): unknown {
  const tokens = [...new Parser().parse(text)];
  // Inspect the concrete tree iteratively before the composer's recursive work.
  // A mapping pair or sequence entry counts as one item; root depth is one.
  const pending = tokens.map((token) => ({ token, depth: 0 }));
  let items = 0;
  while (pending.length) {
    const { token, depth } = pending.pop()!;
    if (token.type === "alias")
      throw new SnippetsYamlError("aliases are not supported");
    if (token.type === "document" && token.value)
      pending.push({ token: token.value, depth });
    if (CST.isCollection(token)) {
      if (depth >= 16)
        throw new SnippetsYamlError("maximum collection depth is 16");
      items += token.items.length;
      if (items > 4096)
        throw new SnippetsYamlError(
          "must contain at most 4096 collection items",
        );
      for (const item of token.items) {
        // Flow-sequence pairs ([a: b] or [? a]) compose an extra map that
        // has no collection token of its own. Budget it before composition.
        const flowPair =
          token.type === "flow-collection" &&
          token.start.type === "flow-seq-start" &&
          (item.sep !== undefined ||
            item.start.some((part) => part.type === "explicit-key-ind"));
        const childDepth = depth + (flowPair ? 2 : 1);
        if (flowPair && childDepth > 16)
          throw new SnippetsYamlError("maximum collection depth is 16");
        items += flowPair ? 1 : 0;
        if (items > 4096)
          throw new SnippetsYamlError(
            "must contain at most 4096 collection items",
          );
        if (item.key) pending.push({ token: item.key, depth: childDepth });
        if (item.value) pending.push({ token: item.value, depth: childDepth });
      }
    }
  }
  const documents = [
    ...new Composer({
      version: "1.2",
      schema: "core",
      resolveKnownTags: false,
      uniqueKeys: true,
      stringKeys: true,
      prettyErrors: false,
      logLevel: "silent",
    }).compose(tokens, true, text.length),
  ];
  if (documents.length !== 1)
    throw new SnippetsYamlError("must contain exactly one YAML document");
  const document = documents[0]!;
  if (document.directives.yaml.version !== "1.2")
    throw new SnippetsYamlError("YAML version must be 1.2");
  const error = document.errors[0];
  if (error) {
    const prefix = text.slice(0, error.pos[0]);
    const line = prefix.split("\n").length;
    const column = prefix.length - prefix.lastIndexOf("\n");
    const reason =
      error.code === "DUPLICATE_KEY"
        ? "duplicate mapping keys are not supported"
        : "the file is not valid YAML";
    throw new SnippetsYamlError(`${reason} (line ${line}, column ${column})`);
  }
  if (document.warnings.length)
    throw new SnippetsYamlError("unsupported YAML tag or directive");
  return document.toJS({ maxAliasCount: 0 }) as unknown;
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

// Read at most one byte beyond the limit, including if the file grows while read.
async function readBoundedFile(filename: string): Promise<Uint8Array> {
  const file = await open(filename, "r");
  try {
    const bytes = Buffer.alloc(MAX_FILE_BYTES + 1);
    let length = 0;
    while (length < bytes.length) {
      const result = await file.read(
        bytes,
        length,
        bytes.length - length,
        null,
      );
      if (result.bytesRead === 0) break;
      length += result.bytesRead;
    }
    return bytes.subarray(0, length);
  } finally {
    await file.close();
  }
}

function isNotFound(cause: unknown): boolean {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    cause.code === "ENOENT"
  );
}
