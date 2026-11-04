import { expect, it, vi } from "vitest";
import {
  settleAuxiliaryPanelSideSwitch,
  switchPersistedAuxiliaryPanelSide,
  takeAuxiliaryPanelSideSwitch,
} from "../../src/main/application-settings";
import {
  terminalActionForKeyboardInput,
  terminalDefaultKeybinds,
} from "../../src/shared/terminal-keybinds";

it("flips the persisted auxiliary panel side and leaves every other field alone", () => {
  const change = vi.fn();
  switchPersistedAuxiliaryPanelSide("right", change);
  switchPersistedAuxiliaryPanelSide("left", change);
  expect(change.mock.calls).toEqual([
    [{ path: "window.auxiliaryPanelSide", value: "left" }],
    [{ path: "window.auxiliaryPanelSide", value: "right" }],
  ]);
});

it("flips a repeated shortcut from the side already queued", () => {
  const state: { pending?: "left" | "right" } = {};
  expect(takeAuxiliaryPanelSideSwitch(state, "right")).toBe("left");
  expect(takeAuxiliaryPanelSideSwitch(state, "right")).toBe("right");
  settleAuxiliaryPanelSideSwitch(state, "left");
  expect(state.pending).toBe("right");
  settleAuxiliaryPanelSideSwitch(state, "right");
  expect(state.pending).toBeUndefined();
  expect(takeAuxiliaryPanelSideSwitch(state, "right")).toBe("left");
});

it.each([
  ["darwin", "meta", false],
  ["linux", "control", true],
  ["win32", "control", true],
] as const)(
  "resolves the default %s side shortcut without hiding the panel",
  (platform, modifier, control) => {
    expect(
      terminalActionForKeyboardInput(
        terminalDefaultKeybinds(platform),
        {
          key: "|",
          code: "Backslash",
          control,
          meta: modifier === "meta",
          alt: false,
          shift: true,
        },
        platform,
      ),
    ).toBe("switchAuxiliaryPanelSide");
  },
);
