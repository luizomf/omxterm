import type { TerminalSessionFailure } from "./terminal-application";

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
