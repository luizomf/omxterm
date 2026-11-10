import { describe, expect, it } from "vitest";
import {
  terminalExitOutcome,
  terminalSessionExitFailure,
  terminalSessionFailureDialog,
} from "../../src/main/terminal-session-failure";

describe("Terminal Session native failure dialog", () => {
  it.each(["default-shell", "explicit-command"] as const)(
    "distinguishes native exec failure from ordinary nonzero %s exit",
    (launchKind) => {
      const context = {
        sessionId: "s2",
        launchKind,
        closeRequested: false,
        liveSessions: 1,
      };
      const ordinary = { exitCode: 1, signal: 0 };
      const failed = { ...ordinary, startupFailed: true as const };
      expect(terminalSessionExitFailure(ordinary, context)).toBeUndefined();
      expect(terminalExitOutcome(ordinary)).toEqual({
        outcome: "clean",
        code: 1,
      });
      expect(terminalSessionExitFailure(failed, context)).toEqual({
        reason: "spawn",
        launchKind,
      });
      expect(terminalExitOutcome(failed)).toEqual({
        outcome: "spawn-failure",
        code: null,
      });
      expect(
        terminalSessionExitFailure(failed, {
          ...context,
          closeRequested: true,
        }),
      ).toBeUndefined();
      expect(
        terminalSessionExitFailure(failed, {
          ...context,
          closeRequested: true,
          closeReason: "rendering-failure",
        }),
      ).toEqual({ reason: "rendering", launchKind });
    },
  );
  it("gives each failure kind its own dialog built only from normalized metadata", () => {
    const dialogs = (
      [
        { reason: "spawn", launchKind: "default-shell" },
        { reason: "signal", launchKind: "default-shell", signal: 15 },
        { reason: "spawn", launchKind: "explicit-command" },
        { reason: "signal", launchKind: "explicit-command", signal: 15 },
        { reason: "rendering", launchKind: "default-shell" },
      ] as const
    ).map((failure) => terminalSessionFailureDialog(failure));
    expect(new Set(dialogs.map((dialog) => dialog.title)).size).toBe(5);
    expect(dialogs[1]!.detail).toContain("15");
    expect(
      terminalSessionFailureDialog({
        reason: "signal",
        launchKind: "explicit-command",
        signal: null,
      }).detail,
    ).not.toContain("null");
  });
});
