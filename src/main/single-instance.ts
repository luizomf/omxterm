import {
  applicationArguments,
  parseLaunchRequest,
  type LaunchRequest,
} from "./launch-request";

interface InstanceApp {
  readonly isPackaged: boolean;
  requestSingleInstanceLock(additionalData?: Record<string, unknown>): boolean;
  on(
    event: "second-instance",
    listener: (
      event: unknown,
      argv: string[],
      workingDirectory: string,
      additionalData: unknown,
    ) => void,
  ): unknown;
  quit(): void;
}

/**
 * Packaged OMXTerm runs one process per profile: Electron keys the lock on the
 * userData directory, so `--user-data-dir` profiles stay independent. A later
 * launch hands its Launch Request to the running process and quits. Source
 * runs skip the lock, so a development build never hands off to an installed
 * OMXTerm that resolves to the same profile directory.
 *
 * Returns false when this process handed off and must not start.
 */
export function claimSingleInstance(
  app: InstanceApp,
  processArguments: readonly string[],
  open: (request: LaunchRequest) => void,
): boolean {
  if (!app.isPackaged) return true;
  let launch: LaunchRequest;
  try {
    launch = parseLaunchRequest(applicationArguments(processArguments, true));
  } catch {
    // A malformed request fails in this process, with the startup dialog.
    return true;
  }
  // argv may be reordered on its way to the running process; the parsed
  // request travels as data so its literal argv stays intact.
  if (!app.requestSingleInstanceLock({ launch })) {
    app.quit();
    return false;
  }
  app.on("second-instance", (_event, _argv, _directory, data) =>
    open(forwardedLaunchRequest(data)),
  );
  return true;
}

/** Another process's request; anything unreadable opens the Default Shell. */
export function forwardedLaunchRequest(data: unknown): LaunchRequest {
  const launch: unknown =
    typeof data === "object" && data !== null && "launch" in data
      ? data.launch
      : undefined;
  if (
    typeof launch === "object" &&
    launch !== null &&
    "kind" in launch &&
    launch.kind === "explicit-command" &&
    "executable" in launch &&
    typeof launch.executable === "string" &&
    "arguments" in launch &&
    Array.isArray(launch.arguments) &&
    launch.arguments.every((argument) => typeof argument === "string")
  )
    return Object.freeze({
      kind: "explicit-command" as const,
      executable: launch.executable,
      arguments: Object.freeze([...(launch.arguments as string[])]),
    });
  return Object.freeze({ kind: "default-shell" as const });
}
