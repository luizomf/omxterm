import type { lstat, stat } from "node:fs/promises";

// A Microsoft Store App Execution Alias (for example PowerShell 7's
// %LOCALAPPDATA%\Microsoft\WindowsApps\pwsh.exe) is a link whose final
// target sits in a folder the user may not inspect, yet Windows starts it.
// Only that case is accepted unseen; a missing target still fails (#1208).
export async function windowsShellTargetIsFile(
  windowsShell: string,
  inspect: typeof stat,
  inspectLink: typeof lstat,
): Promise<boolean> {
  try {
    return (await inspect(windowsShell)).isFile();
  } catch (cause) {
    const code = (cause as { code?: unknown } | null)?.code;
    if (
      (code === "EACCES" || code === "EPERM") &&
      (await inspectLink(windowsShell)).isSymbolicLink()
    )
      return true;
    throw cause;
  }
}
