import { expect, it } from "vitest";
import { rejectLegacyNativeWindowDeclarations } from "../fixtures/window-policy";

it("does not let a stale Hyprland declaration substitute for run-local observation", () => {
  expect(() =>
    rejectLegacyNativeWindowDeclarations({
      OMXTERM_TEST_WINDOW_POLICY: "hyprland-suppress-maximize",
      HYPRLAND_INSTANCE_SIGNATURE: "fixture",
    }),
  ).toThrow("OMXTERM_TEST_WINDOW_POLICY is retired; unset it.");
});
it("does not let a stale cursor declaration remove actual minimize coverage", () => {
  expect(() =>
    rejectLegacyNativeWindowDeclarations({
      OMXTERM_TEST_CURSOR_PRESENTATION_CONTROL: "hide",
    }),
  ).toThrow("OMXTERM_TEST_CURSOR_PRESENTATION_CONTROL is retired; unset it.");
});
