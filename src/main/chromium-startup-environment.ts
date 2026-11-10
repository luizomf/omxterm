type Environment = Readonly<Record<string, string | undefined>>;

// The values the user launched OMXTerm with for the variables Chromium changes
// in OMXTerm's own Linux environment. `undefined` means unset.
const CHROMIUM_STARTUP_VARIABLES = [
  "NO_AT_BRIDGE",
  "FC_FONTATIONS",
  "EGL_PLATFORM",
] as const;
export type ChromiumStartupVariables = Readonly<
  Record<(typeof CHROMIUM_STARTUP_VARIABLES)[number], string | undefined>
>;

// Call while main's module code first runs, before the event loop turns.
// `seededOzonePlatform` is Electron's initial ozone-platform switch value.
export function captureChromiumStartupVariables(
  environment: Environment,
  platform: string,
  seededOzonePlatform: string,
): ChromiumStartupVariables | undefined {
  if (platform !== "linux") return undefined;
  const fontations = environment["FC_FONTATIONS"];
  const eglPlatform = environment["EGL_PLATFORM"];
  const startedOnWayland =
    seededOzonePlatform !== "" && seededOzonePlatform !== "x11";
  return {
    // Chromium's GTK initialization sets NO_AT_BRIDGE=1 only after main's
    // module code has run, so this is still the user's value.
    NO_AT_BRIDGE: environment["NO_AT_BRIDGE"],
    // Chromium sets FC_FONTATIONS=1 before any application code runs and
    // overwrites a user's value, which cannot be recovered here.
    FC_FONTATIONS: fontations === "1" ? undefined : fontations,
    // On Wayland, Chromium sets EGL_PLATFORM=wayland before any application
    // code runs, but only when the user had no value of their own.
    EGL_PLATFORM:
      startedOnWayland && eglPlatform === "wayland" ? undefined : eglPlatform,
  };
}

// Returns a copy of `environment` with the captured launch values restored:
// a user's value comes back and a Chromium-only value is removed. Without a
// capture (macOS, Windows) the environment is unchanged.
export function restoreChromiumStartupVariables<T extends Environment>(
  environment: T,
  variables: ChromiumStartupVariables | undefined,
): T {
  if (!variables) return environment;
  const result: Record<string, string | undefined> = { ...environment };
  for (const name of CHROMIUM_STARTUP_VARIABLES) {
    const value = variables[name];
    if (value === undefined) delete result[name];
    else result[name] = value;
  }
  return result as T;
}
