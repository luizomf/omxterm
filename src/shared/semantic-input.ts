import { exactLayoutKeys, isLayoutToken } from "./terminal-layout";
import { isTerminalSessionId } from "./terminal-contract";
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
  // Retired: earlier packages send false; true is refused.
  readonly preview?: false;
}
export type SemanticInputCommand =
  | {
      kind: "confirm-selection";
      id: string;
      revision: number;
      sessionId: string;
    }
  | {
      kind: "request";
      id: string;
      source: string;
      revision: number;
      input: SemanticInputRequest;
      waitForDelivery?: true;
      // Internal core capture retained synchronously by a Files drop, not a target selector.
      dropTicket?: string;
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
      ...("preview" in value ? ["preview"] : []),
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
    (value.preview === undefined || value.preview === false)
  );
}
export function isSemanticInputCommand(
  value: unknown,
): value is SemanticInputCommand {
  if (!value || typeof value !== "object") return false;
  if (exactLayoutKeys(value, ["kind", "id"]) && value.kind === "revoke")
    return isLayoutToken(value.id);
  if (
    exactLayoutKeys(value, ["kind", "id", "revision", "sessionId"]) &&
    value.kind === "confirm-selection"
  )
    return (
      isLayoutToken(value.id) &&
      isSelectionRevision(value.revision) &&
      isTerminalSessionId(value.sessionId)
    );
  return (
    exactLayoutKeys(value, [
      "kind",
      "id",
      "source",
      "revision",
      "input",
      ...("waitForDelivery" in value ? ["waitForDelivery"] : []),
      ...("dropTicket" in value ? ["dropTicket"] : []),
    ]) &&
    value.kind === "request" &&
    isLayoutToken(value.id) &&
    isLayoutToken(value.source) &&
    isSelectionRevision(value.revision) &&
    isSemanticInputRequest(value.input) &&
    (value.waitForDelivery === undefined ||
      (value.waitForDelivery === true && value.input.intent === "insert")) &&
    (value.dropTicket === undefined ||
      (isLayoutToken(value.dropTicket) && value.waitForDelivery === true))
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
