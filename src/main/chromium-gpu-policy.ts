import type { CommandLine } from "electron";

// Restty requires WebGL2 (ADR 0025). Without hardware WebGL2, as in VMs
// without 3D acceleration, on GPU-less hosts or with a blocklisted driver,
// Chromium offers its bundled SwiftShader WebGL only when this switch is set.
// Usable hardware is unaffected; the blocklist and drivers stay as they are,
// and only OMXTerm's packaged renderer reaches the fallback (ADR 0038).
export function applyChromiumGpuPolicy(
  commandLine: Pick<CommandLine, "appendSwitch">,
  platform: NodeJS.Platform = process.platform,
): void {
  if (platform === "linux")
    commandLine.appendSwitch("enable-unsafe-swiftshader");
}
