import type { UserConfigurationFallback } from "./user-configuration";

export function userConfigurationFallbackNotice(
  fallback: UserConfigurationFallback,
): string {
  const activeDefaults =
    fallback.surface === "theme"
      ? "OMXTerm opened with the bundled omtheme Terminal Theme instead."
      : "OMXTerm opened with its built-in default settings instead.";
  return `${activeDefaults} ${fallback.error.message}`;
}

export function startupUserFileNotices(
  fallback: UserConfigurationFallback | undefined,
  warnings: readonly string[] | undefined,
): readonly string[] {
  return Object.freeze([
    ...(fallback ? [userConfigurationFallbackNotice(fallback)] : []),
    ...(warnings ?? []),
  ]);
}
