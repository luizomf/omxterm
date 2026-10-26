import type { App } from "electron";
import { spawn } from "node:child_process";
import { posix as path } from "node:path";
import { withSwitchBeforeLaunchRequest } from "./launch-request";

export function applyLinuxDisplayBackendDefault(
  app: Pick<App, "commandLine" | "exit">,
): void {
  const action = planLinuxDisplayBackendDefault(
    app.commandLine.getSwitchValue("ozone-platform"),
  );
  if (action === "append-x11") {
    app.commandLine.appendSwitch("ozone-platform", "x11");
  } else if (action === "relaunch-x11") {
    // Chromium's relauncher lives inside the FUSE mount, which disappears on
    // exit. Use the persistent AppImage only for our own AppRun layout:
    // unrelated executables can inherit APPIMAGE/APPDIR through a terminal.
    const appImage = process.env["APPIMAGE"];
    const appDir = process.env["APPDIR"];
    const executable =
      appImage &&
      path.isAbsolute(appImage) &&
      appDir &&
      path.isAbsolute(appDir) &&
      process.execPath === path.join(appDir, "omxterm")
        ? appImage
        : process.execPath;
    try {
      spawn(
        executable,
        withSwitchBeforeLaunchRequest(
          process.argv.slice(1),
          "--ozone-platform=x11",
        ),
        { detached: true, stdio: "ignore" },
      ).unref();
      app.exit(0);
    } catch {
      // Preserve the existing fallback to the seeded backend if spawning fails.
    }
  }
}

export type LinuxDisplayBackendAction = "none" | "append-x11" | "relaunch-x11";

const OZONE_BACKEND_SWITCHES = ["--ozone-platform", "--ozone-platform-hint"];

export function planLinuxDisplayBackendDefault(
  seededOzonePlatform: string,
  platform: string = process.platform,
  argv: readonly string[] = process.argv,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): LinuxDisplayBackendAction {
  if (platform !== "linux") return "none";
  // Electron seeds an ozone-platform switch from the session type and
  // initializes the browser process's display backend before any app code
  // runs, so neither commandLine.hasSwitch nor a late appendSwitch can
  // deliver the X11 default of ADR 0020 under a Wayland session — the
  // browser process stays on the invisible Wayland path while child
  // processes would follow the appended switch. Only the real process
  // arguments and Electron's hint variable carry user intent, and escaping
  // an already-initialized Wayland backend requires a relaunch with the
  // explicit switch on the command line.
  const launchMarkerIndex = argv.indexOf("-e");
  const applicationArguments =
    launchMarkerIndex === -1 ? argv : argv.slice(0, launchMarkerIndex);
  const userChoseBackend =
    applicationArguments.some((argument) =>
      OZONE_BACKEND_SWITCHES.some(
        (switchName) =>
          argument === switchName || argument.startsWith(`${switchName}=`),
      ),
    ) || environment["ELECTRON_OZONE_PLATFORM_HINT"] !== undefined;
  if (userChoseBackend) return "none";
  if (seededOzonePlatform === "") return "append-x11";
  if (seededOzonePlatform === "x11") return "none";
  return "relaunch-x11";
}
