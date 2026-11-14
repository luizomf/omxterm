import {
  formatFilePathInsertion,
  isFilePathPlatform,
} from "../shared/file-path-insertion";
import { MAX_SNIPPET_BODY_LENGTH } from "../shared/terminal-snippets";
import type { SemanticInputRequest } from "../shared/semantic-input";
import type { ExtensionViewRequestContext } from "./extension-view-host";
import type { Value } from "../extension-runtime/protocol";
import type { FilesTerminalDropConsumer } from "./files-terminal-drag";

export function createFilesTerminalDropInsertion(
  insert: ReturnType<typeof createFilesPathInsertion>,
): FilesTerminalDropConsumer {
  return (input) =>
    insert(
      { operation: "terminal.insertPath.v1", path: input.entry.path },
      input.signal,
      { ...input.source, actionSelectionRevision: input.revision },
      input.ticket,
    ).then((reply) => ({
      status: reply.ok
        ? ("accepted" as const)
        : reply.reason === "terminal-not-completed"
          ? ("unknown" as const)
          : ("refused" as const),
      ...(reply.reason ? { reason: reply.reason } : {}),
    }));
}

/** Keyboard and authenticated drag both enter the same lexical protected handoff. */
export function createFilesPathInsertion(
  insert: (
    input: SemanticInputRequest,
    signal: AbortSignal,
    context: ExtensionViewRequestContext,
    dropTicket?: string,
  ) => Promise<{ ok: boolean; reason?: string }>,
) {
  return (
    value: Record<string, Value>,
    signal: AbortSignal,
    context: ExtensionViewRequestContext,
    dropTicket?: string,
  ) => {
    if (
      Object.keys(value).sort().join() !== "operation,path" ||
      !isFilePathPlatform(process.platform)
    )
      return Promise.resolve({ ok: false, reason: "invalid-path" });
    const text = formatFilePathInsertion([value.path], process.platform);
    if (!text || text.length > MAX_SNIPPET_BODY_LENGTH)
      return Promise.resolve({ ok: false, reason: "invalid-path" });
    // Refuse rather than rewrite a literal path containing a paste delimiter.
    if (/\u001b\[201~|\u009b201~/u.test(text))
      return Promise.resolve({ ok: false, reason: "unsafe-path" });
    return insert(
      {
        operation: "terminal.semanticInput.v1",
        text,
        title: "File path",
        intent: "insert",
      },
      signal,
      context,
      dropTicket,
    );
  };
}
