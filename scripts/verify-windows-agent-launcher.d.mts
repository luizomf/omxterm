export const launcherProbeArgument: string;
export function inspectWindowsAgentLauncher(
  resources: string,
  arch?: string,
  execFile?: (
    file: string,
    args: string[],
    options: { encoding: "utf8"; timeout: number },
  ) => Promise<unknown>,
): Promise<void>;
