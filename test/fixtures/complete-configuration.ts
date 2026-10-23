import { expect } from "vitest";
import { TERMINAL_ACTION_NAMES } from "../../src/shared/terminal-keybinds";

const any = (type: unknown): unknown => expect.any(type) as unknown;

// config.json lists every setting (the bundled font's family excepted).
export function expectCompleteConfiguration(document: unknown): void {
  expect(document).toMatchObject({
    version: 1,
    confirmClose: any(Boolean),
    logLevel: any(String),
    font: {
      size: any(Number),
      lineHeight: any(Number),
      ligatures: any(Boolean),
    },
    terminal: {
      padding: {
        top: any(Number),
        right: any(Number),
        bottom: any(Number),
        left: any(Number),
      },
      filePreview: any(Boolean),
    },
    scrollback: { lines: any(Number) },
    keyboard: { optionAsAlt: any(String) },
    window: {
      alwaysOnTop: any(Boolean),
      blur: any(Boolean),
      transparency: any(Number),
      showTitleBar: any(Boolean),
      showTabBar: any(Boolean),
      cornerRadius: any(Number),
      autoHideTitleBar: any(Boolean),
    },
    theme: { path: any(String) },
  });
  expect(
    Object.keys((document as { keybinds: object }).keybinds).sort(),
  ).toEqual([...TERMINAL_ACTION_NAMES].sort());
}
