import type { TerminalSessionFailure } from "./terminal-application";
import type { TerminalExit } from "../shared/terminal-contract";
import type { TerminalSessionEndContext } from "./terminal-ipc-types";

export function terminalExitOutcome(exit: TerminalExit) {
  const outcome = exit.startupFailed
    ? "spawn-failure"
    : exit.signal !== 0
      ? "signal"
      : "clean";
  return {
    outcome,
    code:
      outcome === "spawn-failure"
        ? null
        : normalizeCode(outcome === "signal" ? exit.signal : exit.exitCode),
  } as const;
}

export function terminalSessionExitFailure(
  exit: TerminalExit,
  context: TerminalSessionEndContext,
): TerminalSessionFailure | undefined {
  const launchKind = context.launchKind;
  if (context.closeReason === "rendering-failure")
    return { reason: "rendering", launchKind };
  if (context.closeRequested) return undefined;
  if (exit.startupFailed) return { reason: "spawn", launchKind };
  if (exit.signal !== 0)
    return { reason: "signal", launchKind, signal: normalizeCode(exit.signal) };
  return undefined;
}

function normalizeCode(value: number): number | null {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

interface TerminalSessionFailureDialog {
  readonly type: "error";
  readonly title: string;
  readonly message: string;
  readonly detail: string;
  readonly buttons: readonly ["OK"];
}

export function terminalSessionFailureDialog(
  failure: TerminalSessionFailure,
): TerminalSessionFailureDialog {
  if (failure.reason === "rendering") {
    return {
      type: "error",
      title: "Terminal rendering failed",
      message:
        "The rendering backend was lost. Its terminal session has been closed.",
      detail:
        "Restart OMXTerm to create a new session. Other sessions are unaffected.",
      buttons: ["OK"],
    };
  }
  const explicitCommand = failure.launchKind === "explicit-command";
  if (failure.reason === "spawn") {
    return {
      type: "error",
      title: explicitCommand
        ? "Command could not start"
        : "Shell could not start",
      message: explicitCommand
        ? "The requested command could not be started."
        : "The Default Shell could not be started.",
      detail: "Lifecycle failure: spawn.",
      buttons: ["OK"],
    };
  }

  return {
    type: "error",
    title: explicitCommand
      ? "Command exited unexpectedly"
      : "Shell exited unexpectedly",
    message: explicitCommand
      ? "The requested command exited unexpectedly."
      : "The Default Shell exited unexpectedly.",
    detail: `Signal: ${failure.signal ?? "unknown"}.`,
    buttons: ["OK"],
  };
}
