import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { transform } from "esbuild";
import { expect, it, vi } from "vitest";
import { disableSessionSpellcheck } from "../../src/main/session-spellcheck";

it("production startup registers the session policy after read-only capture, before other startup work", async () => {
  const { code } = await transform(
    await readFile(new URL("../../src/main/index.ts", import.meta.url), "utf8"),
    { loader: "ts", format: "esm" },
  );
  const body = code.replace(/^import[\s\S]*?;\n/gmu, "").trimStart();
  const prefix = body.slice(0, body.indexOf("let currentTranslator"));
  const app = new EventEmitter();
  const capture = vi.fn(() => {
    expect(app.listenerCount("session-created")).toBe(0);
  });
  runInNewContext(prefix, {
    app,
    captureDefaultProfile: capture,
    disableSessionSpellcheck,
  });
  expect(capture).toHaveBeenCalledOnce();
  expect(app.listenerCount("session-created")).toBe(1);
  const setSpellCheckerLanguages = vi.fn();
  const setSpellCheckerEnabled = vi.fn();
  app.emit("session-created", {
    setSpellCheckerLanguages,
    setSpellCheckerEnabled,
  });
  expect(setSpellCheckerEnabled).toHaveBeenCalledExactlyOnceWith(false);
});

it.each(["linux", "win32", "darwin"] as const)(
  "disables every default or hosted %s session without reading/creating one early",
  (platform) => {
    const app = new EventEmitter();
    disableSessionSpellcheck(app, platform);
    expect(app.eventNames()).toEqual(["session-created"]);
    for (const kind of ["default", "hosted", "existing-profile"]) {
      const calls: unknown[] = [];
      const session = {
        setSpellCheckerLanguages: vi.fn((languages: string[]) =>
          calls.push(["languages", languages]),
        ),
        setSpellCheckerEnabled: vi.fn((enabled: boolean) =>
          calls.push(["enabled", enabled]),
        ),
      };
      app.emit("session-created", session);
      expect(calls, kind).toEqual(
        platform === "darwin"
          ? [["enabled", false]]
          : [
              ["languages", []],
              ["enabled", false],
            ],
      );
    }
  },
);

it("clears a prior language selection instead of replacing the dictionary URL or blocking requests", () => {
  const app = new EventEmitter();
  disableSessionSpellcheck(app, "linux");
  const state = { languages: ["pt-BR", "en-US"], enabled: true };
  app.emit("session-created", {
    setSpellCheckerLanguages(languages: string[]) {
      state.languages = languages;
    },
    setSpellCheckerEnabled(enabled: boolean) {
      state.enabled = enabled;
    },
  });
  expect(state).toEqual({ languages: [], enabled: false });
  // No network/webRequest/download-URL capability is supplied to this seam.
});
