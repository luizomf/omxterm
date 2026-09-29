import { expect, it } from "vitest";
import { fixtureWindowPolicy } from "../fixtures/window-policy";

it("requires successful maximize by default, including an undeclared Hyprland desktop", () => {
  expect(fixtureWindowPolicy({}, "linux")).toBe("standard");
  expect(
    fixtureWindowPolicy({ HYPRLAND_INSTANCE_SIGNATURE: "fixture" }, "linux"),
  ).toBe("standard");
});
it("accepts only an explicit policy in a Linux Hyprland session", () => {
  const environment = {
    OMXTERM_TEST_WINDOW_POLICY: "hyprland-suppress-maximize",
    HYPRLAND_INSTANCE_SIGNATURE: "fixture",
  };
  expect(fixtureWindowPolicy(environment, "linux")).toBe(
    "hyprland-suppress-maximize",
  );
  expect(() => fixtureWindowPolicy(environment, "win32")).toThrow();
  expect(() =>
    fixtureWindowPolicy(
      { OMXTERM_TEST_WINDOW_POLICY: "hyprland-suppress-maximize" },
      "linux",
    ),
  ).toThrow();
  expect(() =>
    fixtureWindowPolicy({ OMXTERM_TEST_WINDOW_POLICY: "typo" }, "linux"),
  ).toThrow();
});
