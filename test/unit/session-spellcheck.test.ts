import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";
import { disableSessionSpellcheck } from "../../src/main/session-spellcheck";

it.each(["linux", "win32", "darwin"] as const)(
  "disables spellcheck in every %s session created later",
  (platform) => {
    const app = new EventEmitter();
    disableSessionSpellcheck(app, platform);
    for (const kind of ["default", "hosted"]) {
      const state = { languages: ["pt-BR", "en-US"], enabled: true };
      app.emit("session-created", {
        setSpellCheckerLanguages: vi.fn((languages: string[]) => {
          state.languages = languages;
        }),
        setSpellCheckerEnabled: vi.fn((enabled: boolean) => {
          state.enabled = enabled;
        }),
      });
      expect(state, kind).toEqual({
        // macOS uses the system spellchecker, which has no language list.
        languages: platform === "darwin" ? ["pt-BR", "en-US"] : [],
        enabled: false,
      });
    }
  },
);
