import { app } from "electron";
import { userInfo } from "node:os";
import { configureApplicationAbout } from "./application-about";
import {
  applicationArguments,
  launchRequestConsumer,
  parseLaunchRequest,
} from "./launch-request";
import { installedFontFamilyMetrics } from "./installed-font-family";

export function prepareStartup(developmentIcon: string, packagedIcon: string) {
  configureApplicationAbout(
    app,
    app.isPackaged ? packagedIcon : developmentIcon,
  );
  const request = parseLaunchRequest(
    applicationArguments(process.argv, app.isPackaged),
  );
  if (!app.isPackaged) app.dock?.setIcon(developmentIcon);
  const account = userInfo();
  return {
    account,
    consumeLaunchRequest: launchRequestConsumer(request),
    /** Started with `-e`: open as asked, never the remembered windows. */
    explicitCommand: request.kind === "explicit-command",
    configurationLoadOptions: {
      environment: process.env,
      homeDirectory: account.homedir,
      platform: process.platform,
      getInstalledFontFamilyMetrics: installedFontFamilyMetrics,
    },
  };
}
