type Environment = Readonly<Record<string, string | undefined>>;

// The AppImage runtime and OMXTerm's AppRun set these for OMXTerm itself.
const APPIMAGE_VARIABLES = [
  "APPIMAGE",
  "APPDIR",
  "ARGV0",
  "OWD",
  "CHROME_DESKTOP",
];
// AppRun prepends entries under APPDIR to these search lists.
const APPIMAGE_SEARCH_LISTS = [
  "PATH",
  "LD_LIBRARY_PATH",
  "XDG_DATA_DIRS",
  "GSETTINGS_SCHEMA_DIR",
];
// AppRun also appends these defaults to XDG_DATA_DIRS.
const APPRUN_XDG_DATA_DEFAULTS = [
  "/usr/share/gnome",
  "/usr/local/share/",
  "/usr/share/",
];

// Returns the environment a packaged Linux OMXTerm received before its
// AppImage runtime and AppRun changed it, so programs started from OMXTerm do
// not inherit a mount that disappears when OMXTerm quits. Outside an AppImage
// (no absolute APPDIR) and on other platforms the environment is unchanged.
export function withoutAppImageRuntime<T extends Environment>(
  environment: T,
  platform: string,
): T {
  const appDir = environment["APPDIR"]?.replace(/\/+$/, "");
  if (platform !== "linux" || !appDir?.startsWith("/")) return environment;

  const result: Record<string, string | undefined> = { ...environment };
  for (const name of APPIMAGE_VARIABLES) delete result[name];
  for (const name of APPIMAGE_SEARCH_LISTS) {
    const value = result[name];
    if (value === undefined) continue;
    const entries = value.split(":");
    const kept = entries.filter(
      (entry) => entry !== appDir && !entry.startsWith(`${appDir}/`),
    );
    if (kept.length === entries.length) continue;
    if (
      name === "XDG_DATA_DIRS" &&
      kept.slice(-APPRUN_XDG_DATA_DEFAULTS.length).join(":") ===
        APPRUN_XDG_DATA_DEFAULTS.join(":")
    )
      kept.splice(-APPRUN_XDG_DATA_DEFAULTS.length);
    if (kept.length) result[name] = kept.join(":");
    else delete result[name];
  }
  return result as T;
}
