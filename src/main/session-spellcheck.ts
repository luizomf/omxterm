import type { Session } from "electron";

type SpellcheckSession = Pick<
  Session,
  "setSpellCheckerLanguages" | "setSpellCheckerEnabled"
>;

// Register before any default/hosted session is created, without eagerly
// resolving defaultSession (which would contaminate early profile capture).
export function disableSessionSpellcheck(
  app: {
    on(
      event: "session-created",
      listener: (session: SpellcheckSession) => void,
    ): unknown;
  },
  platform: NodeJS.Platform = process.platform,
): void {
  app.on("session-created", (session) => {
    // Enabled=false alone leaves Chromium's selected Hunspell downloads alive.
    // Empty the list to cancel them; macOS uses native spelling, not this API.
    if (platform !== "darwin") session.setSpellCheckerLanguages([]);
    session.setSpellCheckerEnabled(false);
  });
}
