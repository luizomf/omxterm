import { exactLayoutKeys, isLayoutToken } from "./terminal-layout";
import {
  MAX_SNIPPET_BODY_LENGTH,
  MAX_SNIPPET_DESCRIPTION_LENGTH,
  MAX_SNIPPET_NAME_LENGTH,
} from "./terminal-snippets";

export const semanticInputIpc = {
  selection: "terminal:semantic-selection",
  command: "terminal:semantic-command",
  reply: "terminal:semantic-reply",
} as const;

export interface SemanticInputRequest {
  readonly operation: "terminal.semanticInput.v1";
  readonly text: string;
  readonly title: string;
  readonly description?: string;
  readonly intent: "insert" | "run";
  readonly preview: boolean;
}
export type SemanticInputCommand =
  | {
      kind: "request";
      id: string;
      source: string;
      revision: number;
      input: SemanticInputRequest;
    }
  | { kind: "revoke"; id: string };
export type SemanticInputReply =
  | { kind: "started"; id: string }
  | { kind: "finished"; id: string; available: boolean };
export interface SemanticInputBridge {
  selection(revision: number): void;
  onCommand(listener: (command: SemanticInputCommand) => void): () => void;
  reply(value: SemanticInputReply): void;
}
export const isSelectionRevision = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;

export function isSemanticInputRequest(
  value: unknown,
): value is SemanticInputRequest {
  if (!value || typeof value !== "object") return false;
  if (
    !exactLayoutKeys(value, [
      "operation",
      "text",
      "title",
      "intent",
      "preview",
      ...("description" in value ? ["description"] : []),
    ])
  )
    return false;
  return (
    value.operation === "terminal.semanticInput.v1" &&
    typeof value.text === "string" &&
    value.text.length > 0 &&
    value.text.length <= MAX_SNIPPET_BODY_LENGTH &&
    typeof value.title === "string" &&
    value.title.length > 0 &&
    value.title.length <= MAX_SNIPPET_NAME_LENGTH &&
    (value.description === undefined ||
      (typeof value.description === "string" &&
        value.description.length <= MAX_SNIPPET_DESCRIPTION_LENGTH)) &&
    (value.intent === "insert" || value.intent === "run") &&
    typeof value.preview === "boolean"
  );
}
export function isSemanticInputCommand(
  value: unknown,
): value is SemanticInputCommand {
  if (exactLayoutKeys(value, ["kind", "id"]) && value.kind === "revoke")
    return isLayoutToken(value.id);
  return (
    exactLayoutKeys(value, ["kind", "id", "source", "revision", "input"]) &&
    value.kind === "request" &&
    isLayoutToken(value.id) &&
    isLayoutToken(value.source) &&
    isSelectionRevision(value.revision) &&
    isSemanticInputRequest(value.input)
  );
}
export function isSemanticInputReply(
  value: unknown,
): value is SemanticInputReply {
  if (exactLayoutKeys(value, ["kind", "id"]) && value.kind === "started")
    return isLayoutToken(value.id);
  return (
    exactLayoutKeys(value, ["kind", "id", "available"]) &&
    value.kind === "finished" &&
    isLayoutToken(value.id) &&
    typeof value.available === "boolean"
  );
}
