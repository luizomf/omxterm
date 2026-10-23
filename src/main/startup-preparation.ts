import type { App } from "electron";
import { userInfo } from "node:os";
import type { OperationalLogLevel } from "../shared/user-configuration";
import { configureApplicationAbout } from "./application-about";
import {
  developmentApplicationIconPath,
  packagedApplicationIconPath,
} from "./application-paths";
import { withLogLevelOverride } from "./command-line-options";
import { installedFontFamilyMetrics } from "./installed-font-family";
import { startupLaunchRequest } from "./launch-request";
import { createOperationalEventLog } from "./operational-events";

// Process-wide startup state once Electron is ready: the About panel and
// icon, the account, the operational event log, the startup Launch Request
// and the options for loading the User Configuration.
export function prepareStartup(
  app: Pick<App, "isPackaged" | "dock"> &
    Parameters<typeof configureApplicationAbout>[0],
  logLevel: OperationalLogLevel | undefined,
) {
  configureApplicationAbout(
    app,
    app.isPackaged
      ? packagedApplicationIconPath
      : developmentApplicationIconPath,
  );
  const launch = startupLaunchRequest(process.argv, app.isPackaged);
  if (!app.isPackaged) app.dock?.setIcon(developmentApplicationIconPath);
  const account = userInfo();
  return {
    account,
    operationalEvents: withLogLevelOverride(
      createOperationalEventLog({
        environment: process.env,
        homeDirectory: account.homedir,
      }),
      logLevel,
    ),
    consumeLaunchRequest: launch,
    configurationLoadOptions: {
      environment: process.env,
      homeDirectory: account.homedir,
      platform: process.platform,
      getInstalledFontFamilyMetrics: installedFontFamilyMetrics,
    },
  };
}
