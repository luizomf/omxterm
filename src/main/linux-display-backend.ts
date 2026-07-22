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
  const userChoseBackend =
    argv.some((argument) =>
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
