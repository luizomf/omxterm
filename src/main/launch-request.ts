export type LaunchRequest =
  | { readonly kind: "default-shell" }
  | {
      readonly kind: "explicit-command";
      readonly executable: string;
      readonly arguments: readonly string[];
    };

export class MalformedLaunchRequestError extends Error {
  constructor() {
    super("The -e option requires an executable.");
    this.name = "MalformedLaunchRequestError";
  }
}

const DEFAULT_SHELL_LAUNCH = Object.freeze({
  kind: "default-shell" as const,
});

export function applicationArguments(
  processArguments: readonly string[],
  isPackaged: boolean,
): readonly string[] {
  return processArguments.slice(isPackaged ? 1 : 2);
}

export function withSwitchBeforeLaunchRequest(
  applicationArguments: readonly string[],
  applicationSwitch: string,
): readonly string[] {
  const markerIndex = applicationArguments.indexOf("-e");
  if (markerIndex === -1) return [...applicationArguments, applicationSwitch];
  return [
    ...applicationArguments.slice(0, markerIndex),
    applicationSwitch,
    ...applicationArguments.slice(markerIndex),
  ];
}

export function parseLaunchRequest(
  applicationArguments: readonly string[],
): LaunchRequest {
  const markerIndex = applicationArguments.indexOf("-e");
  if (markerIndex === -1) return DEFAULT_SHELL_LAUNCH;

  const executable = applicationArguments[markerIndex + 1];
  if (executable === undefined) throw new MalformedLaunchRequestError();

  return Object.freeze({
    kind: "explicit-command" as const,
    executable,
    arguments: Object.freeze(applicationArguments.slice(markerIndex + 2)),
  });
}

export function startupLaunchRequest(
  processArguments: readonly string[],
  isPackaged: boolean,
): (windowId: number) => () => LaunchRequest {
  const processRequest = consumeLaunchRequestOnce(
    parseLaunchRequest(applicationArguments(processArguments, isPackaged)),
  );
  return (windowId) => requestForTerminalWindow(windowId, processRequest);
}

export function requestForTerminalWindow(
  windowId: number,
  consumeProcessRequest: () => LaunchRequest,
): () => LaunchRequest {
  return consumeLaunchRequestOnce(
    windowId === 1 ? consumeProcessRequest() : DEFAULT_SHELL_LAUNCH,
  );
}

export function consumeLaunchRequestOnce(
  launchRequest: LaunchRequest,
): () => LaunchRequest {
  let pending =
    launchRequest.kind === "explicit-command" ? launchRequest : undefined;
  return () => {
    const request = pending;
    pending = undefined;
    return request ?? DEFAULT_SHELL_LAUNCH;
  };
}
