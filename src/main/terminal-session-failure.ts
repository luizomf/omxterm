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
