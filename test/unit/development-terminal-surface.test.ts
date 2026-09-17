import { describe, expect, it } from "vitest";
import { selectDevelopmentTerminalSurface } from "../../src/main/development-terminal-surface";

describe("development Terminal Surface selection", () => {
  it("keeps xterm as the default", () => {
    expect(selectDevelopmentTerminalSurface({}, false)).toBe("xterm");
    expect(selectDevelopmentTerminalSurface({}, true)).toBe("xterm");
  });

  it("accepts an explicit Restty selection only for an unpackaged launch", () => {
    expect(
      selectDevelopmentTerminalSurface(
        { OMXTERM_TERMINAL_SURFACE: "restty" },
        false,
      ),
    ).toBe("restty");
    expect(() =>
      selectDevelopmentTerminalSurface(
        { OMXTERM_TERMINAL_SURFACE: "restty" },
        true,
      ),
    ).toThrow(/development-only.*packaged/u);
  });

  it.each(["", "RESTTY", "other"])(
    "rejects invalid selector value %j instead of defaulting",
    (value) => {
      expect(() =>
        selectDevelopmentTerminalSurface(
          { OMXTERM_TERMINAL_SURFACE: value },
          false,
        ),
      ).toThrow(/OMXTERM_TERMINAL_SURFACE.*xterm.*restty/u);
    },
  );
});
