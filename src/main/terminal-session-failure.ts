import {
  DEFAULT_LANGUAGE,
  translatorFor,
  type MessageKey,
  type Translator,
} from "../shared/i18n";
import type { TerminalSessionFailure } from "./terminal-application";
import type { TerminalExit } from "../shared/terminal-contract";
import type {
  TerminalSessionEndContext,
  TerminalSessionStartErrorContext,
} from "./terminal-ipc-types";
import { LocalTerminalSessionStartError } from "./local-terminal-session";

export function throwSessionStartError(
  cause: unknown,
  liveSessions: number,
  notify: (context: TerminalSessionStartErrorContext) => void,
): never {
  const launchKind =
    cause instanceof LocalTerminalSessionStartError
      ? cause.launchKind
      : "default-shell";
  notify({ launchKind, liveSessions });
  throw new Error(
    launchKind === "explicit-command"
      ? "The requested command could not be started"
      : "The Default Shell could not be started",
  );
}

export function retainedSshExit(
  exit: TerminalExit,
  ssh: boolean,
  closed: boolean,
) {
  return ssh &&
    !closed &&
    exit.signal === 0 &&
    !exit.startupFailed &&
    exit.exitCode !== 0
    ? { retained: true as const }
    : {};
}

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
  readonly buttons: readonly [string];
}

export function terminalSessionFailureDialog(
  failure: TerminalSessionFailure,
  { t }: Translator = translatorFor(DEFAULT_LANGUAGE),
): TerminalSessionFailureDialog {
  const dialog = (
    title: MessageKey,
    message: MessageKey,
    detail: string,
  ): TerminalSessionFailureDialog => ({
    type: "error",
    title: t(title),
    message: t(message),
    detail,
    buttons: [t("common.ok")],
  });
  if (failure.reason === "rendering")
    return dialog(
      "failure.rendering.title",
      "failure.rendering.message",
      t("failure.rendering.detail"),
    );
  const command = failure.launchKind === "explicit-command";
  if (failure.reason === "spawn")
    return dialog(
      command ? "failure.commandStart.title" : "failure.shellStart.title",
      command ? "failure.commandStart.message" : "failure.shellStart.message",
      t(command ? "failure.commandSpawnDetail" : "failure.shellSpawnDetail"),
    );
  return dialog(
    command ? "failure.commandExit.title" : "failure.shellExit.title",
    command ? "failure.commandExit.message" : "failure.shellExit.message",
    t("failure.signalDetail"),
  );
}
