import { expect, it } from "vitest";
import { terminalWindowOptions } from "../../src/main/terminal-window";
import { DEFAULT_USER_CONFIGURATION } from "../../src/main/user-configuration";
import { assertNativeChromeConstruction } from "../fixtures/window-chrome-construction";

it.each(["linux", "win32", "darwin"])(
  "preserves the independently stated %s native-action construction contract",
  (platform) => {
    const options = terminalWindowOptions(
      "preload.cjs",
      DEFAULT_USER_CONFIGURATION,
      platform,
    );
    expect(options.frame).toBe(platform === "darwin");
    expect(options.transparent).toBe(platform !== "win32");
    expect(options.resizable).not.toBe(false);
    expect(options.maximizable).not.toBe(false);
    expect(options.maxWidth).toBeUndefined();
    expect(options.maxHeight).toBeUndefined();
    expect(() =>
      assertNativeChromeConstruction(options, platform),
    ).not.toThrow();
  },
);
it.each([
  { resizable: false },
  { maximizable: false },
  { maxWidth: 960 },
  { maxHeight: 640 },
  { frame: true },
  { transparent: false },
  { show: true },
  { minWidth: 960 },
  { minHeight: 640 },
])(
  "rejects product construction regression %j independently of native unavailability",
  (change) => {
    const options = terminalWindowOptions(
      "preload.cjs",
      DEFAULT_USER_CONFIGURATION,
      "linux",
    );
    expect(() =>
      assertNativeChromeConstruction({ ...options, ...change }, "linux"),
    ).toThrow();
  },
);
it("rejects a Windows transparent reference copied from Linux", () => {
  const options = terminalWindowOptions(
    "preload.cjs",
    DEFAULT_USER_CONFIGURATION,
    "win32",
  );
  expect(() =>
    assertNativeChromeConstruction({ ...options, transparent: true }, "win32"),
  ).toThrow();
});
