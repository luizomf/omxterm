import type { TerminalSurfaceKind } from "../shared/terminal-surface-kind";

const TERMINAL_SURFACE_ENVIRONMENT_KEY = "OMXTERM_TERMINAL_SURFACE";

export function selectDevelopmentTerminalSurface(
  environment: Readonly<Record<string, string | undefined>>,
  packaged: boolean,
): TerminalSurfaceKind {
  const requested = environment[TERMINAL_SURFACE_ENVIRONMENT_KEY];
  if (requested === undefined) return "xterm";
  if (requested !== "xterm" && requested !== "restty")
    throw new Error(
      `${TERMINAL_SURFACE_ENVIRONMENT_KEY} must be exactly xterm or restty`,
    );
  if (packaged && requested === "restty")
    throw new Error(
      "The Restty Terminal Surface is development-only and cannot start in a packaged application",
    );
  return requested;
}
