import { describe, expect, it } from "vitest";
import {
  terminalApplicationFailure,
  terminalApplicationFailureDisplay,
} from "../../src/main/terminal-application-failure";

describe("Terminal application failure", () => {
  it.each([
    "launch-request",
    "renderer-load",
    "new-window",
    "startup",
  ] as const)(
    "preserves the %s cause while displaying only its normalized stage message",
    (stage) => {
      const rawCause = new Error(
        "OMXTERM_RAW_ERROR /Users/private SECRET_ENV=value CHILD_STDERR TERMINAL_PAYLOAD",
      );

      const failure = terminalApplicationFailure(stage, rawCause);
      const display = terminalApplicationFailureDisplay(failure);

      expect(failure.stage).toBe(stage);
      expect(failure.cause).toBe(rawCause);
      expect(display.message).toBe(failure.message);
      expect(display.title).not.toBe("");
      expect(JSON.stringify(display)).not.toMatch(
        /OMXTERM_RAW_ERROR|\/Users\/private|SECRET_ENV|CHILD_STDERR|TERMINAL_PAYLOAD/,
      );
    },
  );

  it("keeps nested stage context without exposing inner causes", () => {
    const loadCause = new Error("volatile loadFile failure");
    const loadFailure = terminalApplicationFailure("renderer-load", loadCause);
    const startupFailure = terminalApplicationFailure("startup", loadFailure);

    expect(startupFailure.cause).toBe(loadFailure);
    expect(loadFailure.cause).toBe(loadCause);
    expect(terminalApplicationFailureDisplay(startupFailure)).toEqual(
      terminalApplicationFailureDisplay(
        terminalApplicationFailure("startup", new Error("other")),
      ),
    );
  });
});
