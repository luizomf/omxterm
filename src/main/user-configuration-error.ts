export class UserConfigurationError extends Error {
  constructor(
    readonly configurationPath: string,
    readonly location: string | undefined,
    readonly reason: string,
  ) {
    super(userConfigurationDiagnostic(configurationPath, location, reason));
    this.name = "UserConfigurationError";
  }
}

export function userConfigurationDiagnostic(
  configurationPath: string,
  location: string | undefined,
  reason: string,
): string {
  const safeLocation = location
    ? ` at ${JSON.stringify(location.slice(0, 128))}`
    : "";
  // The location is file content and stays JSON-escaped; the path is
  // system-derived and must remain copyable, so Windows backslashes are
  // never doubled by escaping.
  return `User Configuration "${configurationPath}"${safeLocation}: ${reason}. Fix the file and restart OMXTerm.`;
}

export type ConfigurationRejectionReason =
  | "read-failed"
  | "invalid-utf8"
  | "invalid-json"
  | "invalid-schema"
  | "font-discovery-failed"
  | "theme-read-failed"
  | "theme-invalid";

// Operational events receive only a normalized category, never the user-file
// path, field detail, or raw diagnostic above.
export function configurationRejectionReason(
  failure: UserConfigurationError,
  surface: "configuration" | "theme" = "configuration",
): ConfigurationRejectionReason {
  if (surface === "theme")
    return failure.reason.includes("could not be read") ||
      failure.reason.includes("does not exist")
      ? "theme-read-failed"
      : "theme-invalid";
  if (failure.reason === "the file could not be read") return "read-failed";
  if (failure.reason === "the file is not valid UTF-8") return "invalid-utf8";
  if (failure.reason === "the file is not valid JSON") return "invalid-json";
  if (
    failure.reason === "installed font families could not be discovered" ||
    failure.reason.startsWith("installed font could not be validated:")
  )
    return "font-discovery-failed";
  return "invalid-schema";
}
