import { describe, expect, it } from "vitest";
import { validateUserConfiguration } from "../../src/main/user-configuration";
import { terminalDefaultKeybinds } from "../../src/shared/terminal-keybinds";

describe("Window Chrome configuration", () => {
  it("shows pane marks by default and accepts only a boolean", () => {
    const load = (value?: unknown) =>
      validateUserConfiguration(
        {
          version: 1,
          window: value === undefined ? {} : { showPaneMarks: value },
        },
        "config.json",
        new Set(),
      );
    expect(load().showPaneMarks).toBe(true);
    expect(load(false).showPaneMarks).toBe(false);
    for (const value of [null, 0, "false"]) expect(() => load(value)).toThrow();
  });

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
    "adds a remappable title toggle on %s with collision handling",
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
      const onTabBar = validate({ toggleTitleBar: defaults.toggleTabBar });
      expect(onTabBar.keybinds.toggleTitleBar).toBe(defaults.toggleTabBar);
      expect(onTabBar.keybinds.toggleTabBar).toBeNull();
      expect(() =>
        validate({
          toggleTitleBar: defaults.toggleTabBar,
          toggleTabBar: defaults.toggleTabBar,
        }),
      ).toThrow("conflicts");
    },
  );

  it.each(["darwin", "linux", "win32"])(
    "keeps an existing custom binding on the Pane Marks default and unbinds the new default on %s",
    (platform) => {
      const defaults = terminalDefaultKeybinds(platform);
      const taken = defaults.togglePaneMarks!;
      const keybinds = validateUserConfiguration(
        { version: 1, keybinds: { newWindow: taken } },
        "config.json",
        new Set(),
        defaults,
        platform,
      ).keybinds;
      expect(keybinds.newWindow).toBe(taken);
      expect(keybinds.togglePaneMarks).toBeNull();
    },
  );
});
