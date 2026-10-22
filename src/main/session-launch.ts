import { statSync } from "node:fs";
import type { StartupOptions } from "./command-line-options";
import type { LaunchRequest } from "./launch-request";
import type {
  LocalTerminalSession,
  LocalTerminalSessionOptions,
} from "./local-terminal-session";
import type { SavedSessionService, SessionLaunchBase } from "./saved-sessions";
import type { TerminalSessionLaunch } from "./terminal-ipc-types";

// Turns main's resolved launch into session options and starts it: the
// window's Default Shell (consuming the startup Launch Request and working
// directory once), a shell in an inherited directory, a Saved Session, or a
// Quick Connect target.
export function launchTerminalSession(
  launch: TerminalSessionLaunch,
  base: SessionLaunchBase,
  context: {
    readonly consumeLaunchRequest: () => LaunchRequest;
    readonly consumeStartupOptions?: () => StartupOptions;
    readonly savedSessions: Pick<
      SavedSessionService,
      "launchOptions" | "quickConnect"
    >;
    readonly start: (
      options: LocalTerminalSessionOptions,
    ) => LocalTerminalSession;
  },
): LocalTerminalSession {
  if (launch.kind === "default") {
    const launchRequest = context.consumeLaunchRequest();
    const startup = context.consumeStartupOptions?.() ?? {};
    return context.start({
      ...base,
      launchRequest,
      ...existingDirectory(startup.workingDirectory),
    });
  }
  if (launch.kind === "inherit")
    return context.start({
      ...base,
      ...existingDirectory(launch.workingDirectory),
    });
  if (launch.kind === "quick-ssh") {
    const quick = context.savedSessions.quickConnect(launch.target);
    if (!quick) throw new Error("Invalid Quick Connect target");
    return context.start(context.savedSessions.launchOptions(quick, base));
  }
  return context.start(context.savedSessions.launchOptions(launch.id, base));
}

// An inherited directory may have been removed since it was reported; the
// shell then starts in the home directory as usual.
export function existingDirectory(
  directory: string | undefined,
  inspect: (path: string) => { isDirectory(): boolean } = statSync,
): { readonly workingDirectory?: string } {
  if (directory === undefined) return {};
  try {
    return inspect(directory).isDirectory()
      ? { workingDirectory: directory }
      : {};
  } catch {
    return {};
  }
}
