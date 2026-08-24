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
      title: "Session could not start",
      message: "The Live Terminal Session could not be started.",
      detail: "Lifecycle failure: spawn.",
      buttons: ["OK"],
    };
  }

  return {
    type: "error",
    title: "Session exited unexpectedly",
    message: "The Live Terminal Session exited unexpectedly.",
    detail: `Signal: ${failure.signal ?? "unknown"}.`,
    buttons: ["OK"],
  };
}
