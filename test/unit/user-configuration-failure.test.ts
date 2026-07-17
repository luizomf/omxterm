import { describe, expect, it, vi } from "vitest";
import { reportUserConfigurationFailure } from "../../src/main/user-configuration-failure";
import { UserConfigurationError } from "../../src/main/user-configuration";

describe("User Configuration startup failure", () => {
  it("reports an actionable content-free stderr and native dialog before terminating", () => {
    const calls: string[] = [];
    const writeStderr = vi.fn((diagnostic: string) => {
      calls.push("stderr");
      expect(diagnostic).not.toContain("SECRET-VALUE");
    });
    const showErrorBox = vi.fn((_title: string, message: string) => {
      calls.push("dialog-acknowledged");
      expect(message).not.toContain("SECRET-VALUE");
    });
    const quit = vi.fn(() => calls.push("quit"));
    const failure = new UserConfigurationError(
      "/isolated/config.json",
      "font.size",
      "must be from 8 through 72",
    );

    reportUserConfigurationFailure(failure, {
      writeStderr,
      showErrorBox,
      quit,
    });

    expect(writeStderr).toHaveBeenCalledWith(`${failure.message}\n`);
    expect(showErrorBox).toHaveBeenCalledWith(
      "User Configuration Error",
      failure.message,
    );
    expect(failure.message).toContain("Fix the file and restart OMXTerm");
    expect(calls).toEqual(["stderr", "dialog-acknowledged", "quit"]);
  });
});
