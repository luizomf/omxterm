import { expect, it } from "vitest";
import { validateUserConfiguration } from "../../src/main/user-configuration";

const configPath = "/fixture/config.json";
const installedFonts = new Set<string>();

it("defaults background effects off and accepts finite fractional transparency", () => {
  expect(
    validateUserConfiguration({ version: 1 }, configPath, installedFonts),
  ).toMatchObject({ blur: false, transparency: 0 });
  expect(
    validateUserConfiguration(
      { version: 1, window: { blur: true, transparency: 0.375 } },
      configPath,
      installedFonts,
    ),
  ).toMatchObject({ blur: true, transparency: 0.375 });
});
it.each([0, 0.001, 0.5, 1])(
  "preserves window.transparency %s without clamping",
  (transparency) => {
    expect(
      validateUserConfiguration(
        { version: 1, window: { transparency } },
        configPath,
        installedFonts,
      ).transparency,
    ).toBe(transparency);
  },
);
it.each([null, true, "0.5", {}, -0.01, 1.01, NaN, Infinity, -Infinity])(
  "rejects invalid transparency %s",
  (transparency) => {
    expect(() =>
      validateUserConfiguration(
        { version: 1, window: { transparency } },
        configPath,
        installedFonts,
      ),
    ).toThrow(expect.objectContaining({ location: "window.transparency" }));
  },
);
it.each([null, 0, 1, "true", {}])("rejects non-boolean blur %s", (blur) => {
  expect(() =>
    validateUserConfiguration(
      { version: 1, window: { blur } },
      configPath,
      installedFonts,
    ),
  ).toThrow(expect.objectContaining({ location: "window.blur" }));
});
it("rejects unsupported effect knobs", () => {
  expect(() =>
    validateUserConfiguration(
      { version: 1, window: { blur: true, blurRadius: 10 } },
      configPath,
      installedFonts,
    ),
  ).toThrow(expect.objectContaining({ location: "window.blurRadius" }));
});
