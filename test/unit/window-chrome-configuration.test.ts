import { describe, expect, it } from "vitest";
import { validateUserConfiguration } from "../../src/main/user-configuration";
import { terminalDefaultKeybinds } from "../../src/shared/terminal-keybinds";

describe("Window Chrome configuration", () => {
  it("defaults both new-window bars on and accepts independent strict booleans", () => {
    expect(
      validateUserConfiguration({ version: 1 }, "config.json", new Set()),
    ).toMatchObject({ showTitleBar: true, showTabBar: true });
    for (const showTitleBar of [false, true])
      for (const showTabBar of [false, true]) {
        expect(
          validateUserConfiguration(
            { version: 1, window: { showTitleBar, showTabBar } },
            "config.json",
            new Set(),
          ),
        ).toMatchObject({ showTitleBar, showTabBar });
      }
  });
  it.each([null, 0, 1, "false", [], {}])(
    "rejects non-boolean visibility %j",
    (value) => {
      for (const key of ["showTitleBar", "showTabBar"])
        expect(() =>
          validateUserConfiguration(
            { version: 1, window: { [key]: value } },
            "config.json",
            new Set(),
          ),
        ).toThrow(`window.${key}`);
    },
  );
  it.each(["darwin", "linux", "win32"])(
    "adds a remappable title toggle on %s with collision checking",
    (platform) => {
      const defaults = terminalDefaultKeybinds(platform);
      expect(defaults.toggleTitleBar).toBe(
        platform === "darwin" ? "CommandOrControl+Shift+D" : "Control+Shift+D",
      );
      const validate = (keybinds: object) =>
        validateUserConfiguration(
          { version: 1, keybinds },
          "config.json",
          new Set(),
          defaults,
          platform,
        );
      expect(
        validate({ toggleTitleBar: "Control+Alt+D" }).keybinds.toggleTitleBar,
      ).toBe("Control+Alt+D");
      expect(() => validate({ toggleTitleBar: defaults.toggleTabBar })).toThrow(
        "conflicts",
      );
    },
  );
});
