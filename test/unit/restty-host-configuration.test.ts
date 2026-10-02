import { expect, it } from "vitest";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";
import { initialResttyHostConfiguration } from "../fixtures/restty-host-configuration";
import { HOST_IMAGE_THEME_B } from "../fixtures/restty-image-theme";

it("preserves the original black font-paint baseline before the broad image phase", () => {
  expect(initialResttyHostConfiguration().terminalTheme).toBe(
    DEFAULT_TERMINAL_THEME,
  );
  expect(initialResttyHostConfiguration().terminalTheme.colors.background).toBe(
    "#000000",
  );
});

it("starts only the focused image scenario directly with its measured palette B", () => {
  expect(initialResttyHostConfiguration(true).terminalTheme).toBe(
    HOST_IMAGE_THEME_B,
  );
  expect(initialResttyHostConfiguration(true).scrollbackLines).toBe(
    initialResttyHostConfiguration().scrollbackLines,
  );
});
