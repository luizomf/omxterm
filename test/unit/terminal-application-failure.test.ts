import { describe, expect, it } from "vitest";
import {
  terminalApplicationFailure,
  terminalApplicationFailureDisplay,
  type TerminalApplicationFailureStage,
} from "../../src/main/terminal-application-failure";

describe("Terminal application failure", () => {
  it.each([
    {
      stage: "launch-request",
      title: "OMXTerm could not start",
      message: "The -e option requires an executable.",
    },
    {
      stage: "renderer-load",
      title: "Terminal Window could not load",
      message: "OMXTerm could not load the Terminal Window renderer.",
    },
    {
      stage: "new-window",
      title: "Terminal Window could not open",
      message: "OMXTerm could not create a new Terminal Window.",
    },
    {
      stage: "startup",
      title: "OMXTerm could not start",
      message: "The initial Terminal Window could not be created.",
    },
  ] as const)(
    "preserves the $stage cause while exposing only its normalized stage message",
    ({ stage, title, message }) => {
      const rawCause = new Error(
        "OMXTERM_RAW_ERROR /Users/private SECRET_ENV=value CHILD_STDERR TERMINAL_PAYLOAD",
      );

      const failure = terminalApplicationFailure(stage, rawCause);
      const display = terminalApplicationFailureDisplay(failure);

      expect(failure.stage).toBe<TerminalApplicationFailureStage>(stage);
      expect(failure.cause).toBe(rawCause);
      expect(failure.message).toBe(message);
      expect(display).toEqual({ title, message });
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
    expect(terminalApplicationFailureDisplay(startupFailure)).toEqual({
      title: "OMXTerm could not start",
      message: "The initial Terminal Window could not be created.",
    });
    expect(
      JSON.stringify(terminalApplicationFailureDisplay(startupFailure)),
    ).not.toContain("volatile loadFile failure");
  });
});
