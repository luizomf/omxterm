import {
  AGENT_COMMANDS,
  AGENT_ERROR_CODES,
  hasOnlyKeys,
  type AgentCommand,
  type AgentErrorCode,
} from "../shared/agent-api";

// An agent grant's Operational Events (ADR 0004, ADR 0052): the envelope
// only, never a request, a response, a token or pane text.
const AGENT_GRANT_REASONS = {
  started: ["user"],
  ended: [
    "user",
    "window-gone",
    "reloaded",
    "endpoint-failed",
    "marks-unconfirmed",
    "quit",
  ],
  refused: ["in-use", "path-too-long", "unavailable"],
} as const;
type AgentGrantAction = keyof typeof AGENT_GRANT_REASONS;

export type AgentEvent =
  | {
      [Action in AgentGrantAction]: {
        readonly name: "agent.grant";
        readonly windowId: number;
        readonly action: Action;
        readonly reason: (typeof AGENT_GRANT_REASONS)[Action][number];
      };
    }[AgentGrantAction]
  | {
      readonly name: "agent.command";
      readonly windowId: number;
      readonly command: AgentCommand;
      readonly outcome: "ok" | AgentErrorCode;
      readonly durationMs: number;
    }
  | {
      // A client that failed the handshake or hit a connection limit.
      readonly name: "agent.rejected";
      readonly reason: (typeof REJECTIONS)[number];
    };

const REJECTIONS = ["invalid-payload", "untrusted-sender", "limit"] as const;

/** A grant's lifecycle is information; commands and rejections are detail. */
export function agentEventLevel(event: {
  readonly name: string;
}): "info" | "debug" {
  return event.name === "agent.grant" ? "info" : "debug";
}

const isWindowId = (value: unknown) =>
  Number.isSafeInteger(value) && (value as number) > 0;

export function isAgentEvent(
  value: Record<string, unknown>,
): value is AgentEvent {
  if (value.name === "agent.rejected")
    return (
      hasOnlyKeys(value, ["name", "reason"]) &&
      REJECTIONS.includes(value.reason as (typeof REJECTIONS)[number])
    );
  if (value.name === "agent.grant") {
    const reasons = Object.hasOwn(AGENT_GRANT_REASONS, value.action as string)
      ? (AGENT_GRANT_REASONS[
          value.action as AgentGrantAction
        ] as readonly string[])
      : [];
    return (
      hasOnlyKeys(value, ["name", "windowId", "action", "reason"]) &&
      isWindowId(value.windowId) &&
      reasons.includes(value.reason as string)
    );
  }
  return (
    value.name === "agent.command" &&
    hasOnlyKeys(value, [
      "name",
      "windowId",
      "command",
      "outcome",
      "durationMs",
    ]) &&
    isWindowId(value.windowId) &&
    AGENT_COMMANDS.includes(value.command as AgentCommand) &&
    (value.outcome === "ok" ||
      AGENT_ERROR_CODES.includes(value.outcome as AgentErrorCode)) &&
    Number.isSafeInteger(value.durationMs) &&
    (value.durationMs as number) >= 0
  );
}
