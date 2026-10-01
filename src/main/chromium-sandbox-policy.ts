import type { CommandLine } from "electron";

// Retain the Linux policy for children before readiness. Launchers must also
// supply --no-sandbox before Electron bootstrap; app main is too late for that.
// Context isolation and the preload bridge remain separate controls (ADR 0024).
export function applyChromiumSandboxPolicy(
  commandLine: Pick<CommandLine, "appendSwitch">,
  platform: NodeJS.Platform = process.platform,
): void {
  if (platform === "linux") commandLine.appendSwitch("no-sandbox");
}
