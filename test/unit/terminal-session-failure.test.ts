import { describe, expect, it } from "vitest";
import { terminalSessionFailureDialog } from "../../src/main/terminal-session-failure";

describe("Terminal Session native failure dialog", () => {
  it.each([
    [
      { reason: "spawn" } as const,
      {
        title: "Shell could not start",
        detail: "Lifecycle failure: spawn.",
      },
    ],
    [
      { reason: "signal", signal: 15 } as const,
      {
        title: "Shell exited unexpectedly",
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
        signal: null,
      }).detail,
    ).toBe("Signal: unknown.");
  });
});
