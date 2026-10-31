import { expect, it } from "vitest";
import { validateUserConfiguration } from "../../src/main/user-configuration";
import { terminalRendererConfiguration } from "../../src/main/active-user-configuration";
import { isTerminalRendererConfiguration } from "../../src/shared/user-configuration";
import { isSettingsChange, SETTINGS_FIELDS } from "../../src/shared/settings";

const configPath = "/synthetic/omxterm/config.json";
const validate = (window?: unknown) =>
  validateUserConfiguration(
    { version: 1, ...(window === undefined ? {} : { window }) },
    configPath,
    new Set(),
  );

it.each(["left", "right"] as const)(
  "projects shared panel side %s through the validated renderer boundary",
  (side) => {
    const configuration = validate({ auxiliaryPanelSide: side });
    expect(configuration.auxiliaryPanelSide).toBe(side);
    const renderer = terminalRendererConfiguration(
      { configuration, userFileErrors: [] },
      0,
    );
    expect(renderer.auxiliaryPanelSide).toBe(side);
    expect(isTerminalRendererConfiguration(renderer)).toBe(true);
    expect(
      isSettingsChange({ path: "window.auxiliaryPanelSide", value: side }),
    ).toBe(true);
  },
);

it.each([null, false, 1, "top", "LEFT", {}, []])(
  "rejects invalid panel side %j at config and renderer boundaries",
  (side) => {
    expect(() => validate({ auxiliaryPanelSide: side })).toThrow(
      /window\.auxiliaryPanelSide/,
    );
    const renderer = terminalRendererConfiguration(
      { configuration: validate(), userFileErrors: [] },
      0,
    );
    expect(
      isTerminalRendererConfiguration({
        ...renderer,
        auxiliaryPanelSide: side,
      }),
    ).toBe(false);
    if (side !== null)
      expect(
        isSettingsChange({ path: "window.auxiliaryPanelSide", value: side }),
      ).toBe(false);
  },
);

it("inherits right while Settings null removes the live preference", () => {
  const configuration = validate();
  expect(configuration.auxiliaryPanelSide).toBe("right");
  const renderer = terminalRendererConfiguration(
    { configuration, userFileErrors: [] },
    0,
  );
  const { auxiliaryPanelSide: _side, ...legacy } = renderer;
  expect(isTerminalRendererConfiguration(legacy)).toBe(true);
  expect(
    isSettingsChange({ path: "window.auxiliaryPanelSide", value: null }),
  ).toBe(true);
  expect(SETTINGS_FIELDS["window.auxiliaryPanelSide"].lifetime).toBe("live");
});
