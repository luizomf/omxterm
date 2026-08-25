import { existsSync } from "node:fs";
import path from "node:path";

export function createDefaultShellResolver(
  accountShell: string | null | undefined,
  configuredWindowsShell: () => string | undefined,
  platform: NodeJS.Platform | string = process.platform,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): () => string {
  return () =>
    resolveDefaultShell(
      platform,
      accountShell,
      environment,
      configuredWindowsShell(),
    );
}

export function defaultShellName(platform: string, executable: string): string {
  return platform === "win32"
    ? path.win32.basename(executable)
    : path.posix.basename(executable);
}

// os.userInfo().shell is null on Windows: the operating system has no
// login-shell concept there. The Windows Default Shell is Windows
// PowerShell, falling back to the ComSpec command processor (#61).
export function resolveDefaultShell(
  platform: NodeJS.Platform | string,
  accountShell: string | null | undefined,
  environment: Readonly<Record<string, string | undefined>>,
  configuredWindowsShell?: string,
  exists: (candidate: string) => boolean = existsSync,
): string {
  if (platform !== "win32") {
    if (!accountShell)
      throw new Error("The operating system did not provide a Default Shell");
    return accountShell;
  }
  if (configuredWindowsShell !== undefined) return configuredWindowsShell;
  const systemRoot = environment["SystemRoot"] || "C:\\Windows";
  const powershell = path.join(
    systemRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  if (exists(powershell)) return powershell;
  const comspec = environment["ComSpec"];
  if (comspec && exists(comspec)) return comspec;
  throw new Error("The operating system did not provide a Default Shell");
}
