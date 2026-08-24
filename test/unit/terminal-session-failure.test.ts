import { describe, expect, it } from "vitest";
import { terminalSessionFailureDialog } from "../../src/main/terminal-session-failure";

describe("Terminal Session native failure dialog", () => {
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
