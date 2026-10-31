import type { BrowserWindow } from "electron";
import { applyActiveUserConfiguration } from "../../src/main/active-user-configuration";
import type { TerminalApplication } from "../../src/main/terminal-application";
import type { TerminalIpcRouter } from "../../src/main/terminal-ipc-types";
import type { ActiveUserConfiguration } from "../../src/main/user-configuration-reloader";

// The auxiliary-only scenario exercises the built-in tool even on hosts whose
// shipping composition uses the optional extension. Keep both initial controller
// configuration and later production reloads on this fixture-only policy.
export function fixtureSnippetsRouter(
  router: TerminalIpcRouter,
  auxiliaryOnly: boolean,
): TerminalIpcRouter {
  if (!auxiliaryOnly) return router;
  return {
    ...router,
    registerController(options) {
      return router.registerController({
        ...options,
        configuration: { ...options.configuration, optionalSnippets: false },
      });
    },
    applyConfiguration(configuration) {
      router.applyConfiguration({ ...configuration, optionalSnippets: false });
    },
  };
}

// Applies a User Configuration to the fixture's windows through the production
// path, with the platform title inset and background effects of the fixture.
export function fixtureConfigurationApplier(
  router: TerminalIpcRouter,
  windows: readonly BrowserWindow[],
  application: TerminalApplication<BrowserWindow>,
  applyBackgroundEffects: NonNullable<
    Parameters<typeof applyActiveUserConfiguration>[5]["applyBackgroundEffects"]
  >,
) {
  return (state: ActiveUserConfiguration, committed: boolean) =>
    applyActiveUserConfiguration(
      state,
      committed,
      router,
      windows,
      application,
      {
        rebuildMenu() {},
        nativeTitleInset: process.platform === "darwin" ? 30 : 0,
        platform: process.platform,
        applyBackgroundEffects,
      },
    );
}
