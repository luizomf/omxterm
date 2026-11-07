import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const run = promisify(execFile);
const scenarios = [
  [
    "move-keyboard",
    "keeps keyboard confirmation focus safe across delayed and hidden preparation",
    "PASS directory move keyboard",
  ],
  [
    "drag",
    "drags an internal entry with Chromium input and rejects external payloads",
    "PASS directory drag",
  ],
  [
    "keyboard",
    "uses the filter, tree, editor and menu with keyboard focus",
    "PASS keyboard workflow",
  ],
  [
    "path",
    "inserts the focused path by shortcut and accessible menu",
    "PASS path insertion keyboard and accessible menu",
  ],
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
    "resize-menu",
    "keeps the focused menu item visible when the viewport height shrinks",
    "PASS menu viewport resize",
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
    if (scenario === "resize-menu") {
      for (const size of ["196x1", "320x1", "196x2"])
        for (const language of ["en-US", "pt-BR"])
          expect(result.stdout).toContain(
            `PASS menu viewport resize ${size}-${language}-dark`,
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
