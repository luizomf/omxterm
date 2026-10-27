import { expect, it } from "vitest";
import { validateUserConfiguration } from "../../src/main/user-configuration";
import { terminalRendererConfiguration } from "../../src/main/active-user-configuration";
import { isTerminalRendererConfiguration } from "../../src/shared/user-configuration";

it("defaults omitted menu policy to true and carries strict booleans through the renderer snapshot", () => {
  const validate = (terminal?: unknown) =>
    validateUserConfiguration(
      { version: 1, ...(terminal === undefined ? {} : { terminal }) },
      "/synthetic/config.json",
      new Set(),
    );
  for (const terminal of [
    undefined,
    {},
    { contextMenuEnabled: true },
    { contextMenuEnabled: false },
  ]) {
    const configuration = validate(terminal);
    const enabled = terminal?.contextMenuEnabled ?? true;
    expect(configuration.terminalContextMenuEnabled).toBe(enabled);
    const renderer = terminalRendererConfiguration(
      { configuration, userFileErrors: [] },
      0,
    );
    expect(renderer.terminalContextMenuEnabled).toBe(enabled);
    expect(isTerminalRendererConfiguration(renderer)).toBe(true);
    for (const value of [null, 0, 1, "false", {}, []]) {
      expect(() => validate({ contextMenuEnabled: value })).toThrow(
        expect.objectContaining({ location: "terminal.contextMenuEnabled" }),
      );
      expect(
        isTerminalRendererConfiguration({
          ...renderer,
          terminalContextMenuEnabled: value,
        }),
      ).toBe(false);
    }
  }
});
