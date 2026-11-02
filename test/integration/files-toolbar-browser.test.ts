import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const run = promisify(execFile);
const scenarios = [
  [
    "shortcut-mac",
    "scopes Cmd+Shift+Period in the Files child",
    "PASS scoped shortcut mac",
  ],
  [
    "shortcut-linux",
    "scopes Ctrl+H in the Files child",
    "PASS scoped shortcut linux",
  ],
  [
    "hidden",
    "hides dotfiles and toggles them with the keyboard",
    "PASS hidden keyboard",
  ],
  [
    "short-menu",
    "reveals the checkbox text, shortcut and focus ring at 196x174 DIP",
    "PASS menu text geometry",
  ],
  [
    "pointer",
    "keeps the real Go target clickable under a neighboring tooltip",
    "PASS pointer hover",
  ],
  [
    "scroll",
    "hides and restores a focused tooltip when its anchor scrolls",
    "PASS actual scroll",
  ],
  [
    "notice",
    "keeps the focused tooltip attached when a notice moves its button",
    "PASS focused tooltip",
  ],
  [
    "matrix",
    "preserves input and layout across languages, themes and scales",
    "PASS matrix",
  ],
] as const;

// Explicitly opt in: headless Chromium, not an Electron/desktop suite.
it.skipIf(!process.env.OMXTERM_TOOLBAR_CHROMIUM).each(scenarios)(
  "%s: %s",
  async (scenario, _description, receipt) => {
    const result = await run(
      process.execPath,
      ["test/fixtures/files-toolbar-browser.mjs", scenario],
      { env: process.env, timeout: 30000 },
    );
    expect(result.stdout).toContain(receipt);
    if (scenario === "hidden" || scenario === "short-menu") {
      for (const size of scenario === "short-menu"
        ? ["196x1-h174", "196x2-h174"]
        : ["196x1", "196x2", "320x1"])
        for (const theme of ["dark", "light"])
          for (const receipt of [
            "PASS hidden keyboard",
            "PASS menu text geometry",
          ])
            expect(result.stdout).toContain(
              `${receipt} ${size}-en-US-${theme}`,
            );
    }
    if (scenario === "matrix") {
      for (const size of ["196x1", "196x2", "320x1"])
        for (const language of ["en-US", "pt-BR"])
          for (const theme of ["dark", "light"])
            expect(result.stdout).toContain(
              `PASS matrix ${size}-${language}-${theme}`,
            );
    }
  },
  35000,
);
