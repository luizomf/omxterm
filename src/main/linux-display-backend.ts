export interface ElectronCommandLine {
  hasSwitch(name: string): boolean;
  appendSwitch(name: string, value: string): void;
}

export function applyLinuxDisplayBackendDefault(
  commandLine: ElectronCommandLine,
  platform: string = process.platform,
): boolean {
  if (platform !== "linux" || commandLine.hasSwitch("ozone-platform"))
    return false;
  commandLine.appendSwitch("ozone-platform", "x11");
  return true;
}
