import { isLayoutToken, exactLayoutKeys } from "./terminal-layout";
import {
  isTerminalSessionId,
  isBoundedTerminalPayload,
} from "./terminal-contract";

/** Internal core-only coordination. Extension views never receive key payloads. */
export const mirrorTypingIpc = {
  command: "terminal:mirror-command",
  reply: "terminal:mirror-reply",
  input: "terminal:mirror-input",
  stop: "terminal:mirror-stop",
} as const;
export interface MirrorPane {
  readonly handle: string;
  readonly sessionId: string;
  readonly title: string;
  readonly required: boolean;
}
export type MirrorStopReason =
  "stopped" | "unavailable" | "write-failed" | "semantic-input";
export type MirrorCommand =
  | { kind: "capture"; request: string; context: string }
  | { kind: "describe"; request: string; context: string }
  | {
      kind: "prepare";
      request: string;
      context: string;
      handles: string[];
      sourceView: string;
    }
  | {
      kind: "activate";
      request: string;
      context: string;
      prepared: string;
      lease: string;
    }
  | { kind: "stop"; context: string; reason: MirrorStopReason }
  | { kind: "retire"; context: string };
export interface MirrorReply {
  readonly request: string;
  readonly ok: boolean;
  readonly panes?: readonly MirrorPane[];
}
export interface MirrorKeyInput {
  readonly lease: string;
  readonly sequence: number;
  readonly sourceSessionId: string;
  readonly data: string;
}
export function isMirrorKeyInput(value: unknown): value is MirrorKeyInput {
  return (
    exactLayoutKeys(value, ["lease", "sequence", "sourceSessionId", "data"]) &&
    isLayoutToken(value.lease) &&
    Number.isSafeInteger(value.sequence) &&
    (value.sequence as number) > 0 &&
    isTerminalSessionId(value.sourceSessionId) &&
    isBoundedTerminalPayload(value.data)
  );
}
export function isMirrorStopReason(value: unknown): value is MirrorStopReason {
  return ["stopped", "unavailable", "write-failed", "semantic-input"].includes(
    value as string,
  );
}
export function isMirrorPanes(value: unknown): value is MirrorPane[] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    value.length <= 16 &&
    value.every(
      (item) =>
        exactLayoutKeys(item, ["handle", "sessionId", "title", "required"]) &&
        isLayoutToken(item.handle) &&
        isTerminalSessionId(item.sessionId) &&
        typeof item.title === "string" &&
        item.title.length <= 120 &&
        !/[\u0000-\u001f\u007f]/u.test(item.title) &&
        typeof item.required === "boolean",
    ) &&
    new Set(value.map((item: MirrorPane) => item.handle)).size ===
      value.length &&
    new Set(value.map((item: MirrorPane) => item.sessionId)).size ===
      value.length &&
    value.filter((item: MirrorPane) => item.required).length === 1
  );
}
export function isMirrorReply(value: unknown): value is MirrorReply {
  return (
    (exactLayoutKeys(value, ["request", "ok"]) ||
      exactLayoutKeys(value, ["request", "ok", "panes"])) &&
    isLayoutToken(value.request) &&
    typeof value.ok === "boolean" &&
    (!("panes" in value) || isMirrorPanes(value.panes))
  );
}
export function isMirrorCommand(value: unknown): value is MirrorCommand {
  if (!value || typeof value !== "object") return false;
  const command = value as Record<string, unknown>;
  if (!isLayoutToken(command.context)) return false;
  if (command.kind === "retire")
    return exactLayoutKeys(command, ["kind", "context"]);
  if (command.kind === "stop")
    return (
      exactLayoutKeys(command, ["kind", "context", "reason"]) &&
      isMirrorStopReason(command.reason)
    );
  if (!isLayoutToken(command.request)) return false;
  if (command.kind === "capture" || command.kind === "describe")
    return exactLayoutKeys(command, ["kind", "context", "request"]);
  if (command.kind === "prepare")
    return (
      exactLayoutKeys(command, [
        "kind",
        "context",
        "request",
        "handles",
        "sourceView",
      ]) &&
      Array.isArray(command.handles) &&
      command.handles.length >= 2 &&
      command.handles.length <= 16 &&
      command.handles.every(isLayoutToken) &&
      new Set(command.handles).size === command.handles.length &&
      typeof command.sourceView === "string" &&
      command.sourceView.length > 0 &&
      command.sourceView.length <= 128
    );
  return (
    command.kind === "activate" &&
    exactLayoutKeys(command, [
      "kind",
      "context",
      "request",
      "prepared",
      "lease",
    ]) &&
    isLayoutToken(command.prepared) &&
    isLayoutToken(command.lease)
  );
}

export interface MirrorTypingBridge {
  onCommand(listener: (command: MirrorCommand) => void): () => void;
  reply(value: MirrorReply): void;
  input(value: MirrorKeyInput): void;
  stop(context: string, reason: MirrorStopReason): void;
}
