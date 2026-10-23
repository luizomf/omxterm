import { describe, expect, it } from "vitest";
import { validateUserConfiguration } from "../../src/main/user-configuration";
import { terminalRendererConfiguration } from "../../src/main/active-user-configuration";
import { isTerminalRendererConfiguration } from "../../src/shared/user-configuration";

const configPath = "/home/me/.config/omxterm/config.json";

describe("terminal.filePreview", () => {
  it("defaults to on, can be turned off, and accepts only booleans", () => {
    const on = validateUserConfiguration({ version: 1 }, configPath, new Set());
    expect(on.filePreview).toBe(true);
    const off = validateUserConfiguration(
      { version: 1, terminal: { filePreview: false } },
      configPath,
      new Set(),
    );
    expect(off.filePreview).toBe(false);
    expect(() =>
      validateUserConfiguration(
        { version: 1, terminal: { filePreview: "no" } },
        configPath,
        new Set(),
      ),
    ).toThrow(/terminal\.filePreview/u);

    // Windows learn about it only when previews are off.
    const renderer = terminalRendererConfiguration(
      { configuration: off, userFileErrors: [] },
      0,
    );
    expect(renderer.filePreview).toBe(false);
    expect(isTerminalRendererConfiguration(renderer)).toBe(true);
    expect(
      terminalRendererConfiguration(
        { configuration: on, userFileErrors: [] },
        0,
      ).filePreview,
    ).toBeUndefined();
  });
});
