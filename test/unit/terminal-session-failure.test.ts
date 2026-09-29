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
  it.each([
    [
      { reason: "spawn", launchKind: "default-shell" } as const,
      {
        title: "Shell could not start",
        message: "The Default Shell could not be started.",
        detail: "Lifecycle failure: spawn.",
      },
    ],
    [
      { reason: "signal", launchKind: "default-shell", signal: 15 } as const,
      {
        title: "Shell exited unexpectedly",
        message: "The Default Shell exited unexpectedly.",
        detail: "Signal: 15.",
      },
    ],
    [
      { reason: "spawn", launchKind: "explicit-command" } as const,
      {
        title: "Command could not start",
        message: "The requested command could not be started.",
        detail: "Lifecycle failure: spawn.",
      },
    ],
    [
      {
        reason: "signal",
        launchKind: "explicit-command",
        signal: 15,
      } as const,
      {
        title: "Command exited unexpectedly",
        message: "The requested command exited unexpectedly.",
        detail: "Signal: 15.",
      },
    ],
  ])("uses only normalized lifecycle metadata for %o", (failure, expected) => {
    const dialog = terminalSessionFailureDialog(failure);

    expect(dialog).toMatchObject(expected);
    expect(JSON.stringify(dialog)).not.toContain("stderr");
    expect(JSON.stringify(dialog)).not.toContain("Terminal Payload");
  });

  it("explains rendering failure and recovery without accepting renderer text", () => {
    const dialog = terminalSessionFailureDialog({
      reason: "rendering",
      launchKind: "default-shell",
    });
    expect(dialog.message).toContain("session has been closed");
    expect(dialog.detail).toContain("Restart OMXTerm");
    expect(dialog.detail).toContain("Other sessions are unaffected");
    expect(dialog.buttons).toEqual(["OK"]);
  });

  it("does not interpolate non-normalized values", () => {
    expect(
      terminalSessionFailureDialog({
        reason: "signal",
        launchKind: "explicit-command",
        signal: null,
      }).detail,
    ).toBe("Signal: unknown.");
  });
});
