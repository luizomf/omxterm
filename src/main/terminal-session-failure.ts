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
  if (failure.reason === "spawn") {
    return {
      type: "error",
      title: "Shell could not start",
      message: "The Default Shell could not be started.",
      detail: "Lifecycle failure: spawn.",
      buttons: ["OK"],
    };
  }

  return {
    type: "error",
    title: "Shell exited unexpectedly",
    message: "The Default Shell exited unexpectedly.",
    detail: `Signal: ${failure.signal ?? "unknown"}.`,
    buttons: ["OK"],
  };
}
