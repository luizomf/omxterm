import type { TerminalSessionFailure } from "./terminal-application";
import { mainTranslator } from "./main-translator";
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
  const t = mainTranslator().t.bind(mainTranslator());
  if (failure.reason === "rendering") {
    return {
      type: "error",
      title: t("failure.rendering.title"),
      message: t("failure.rendering.message"),
      detail: t("failure.rendering.detail"),
      buttons: ["OK"],
    };
  }
  const explicitCommand = failure.launchKind === "explicit-command";
  if (failure.reason === "spawn") {
    return {
      type: "error",
      title: t(
        explicitCommand
          ? "failure.commandStart.title"
          : "failure.shellStart.title",
      ),
      message: t(
        explicitCommand
          ? "failure.commandStart.message"
          : "failure.shellStart.message",
      ),
      detail: t("failure.spawnDetail"),
      buttons: ["OK"],
    };
  }

  return {
    type: "error",
    title: t(
      explicitCommand ? "failure.commandExit.title" : "failure.shellExit.title",
    ),
    message: t(
      explicitCommand
        ? "failure.commandExit.message"
        : "failure.shellExit.message",
    ),
    detail: t("failure.signalDetail", {
      signal: failure.signal ?? t("failure.unknownSignal"),
    }),
    buttons: ["OK"],
  };
}
