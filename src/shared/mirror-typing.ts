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
export interface MirrorTypingBridge {
  onCommand(listener: (command: MirrorCommand) => void): () => void;
  reply(value: MirrorReply): void;
  input(value: MirrorKeyInput): void;
  stop(context: string, reason: MirrorStopReason): void;
}
