import { execFile as execFileCallback } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFile = promisify(execFileCallback);
const script = fileURLToPath(
  new URL("../../scripts/inspect-windows-installation.ps1", import.meta.url),
);

// Read-only native PowerShell integration. Registry/filesystem inspection remains
// real; Get-CimInstance supplies synthetic processes and never inspects/kills users.
describe.skipIf(process.platform !== "win32")(
  "NSIS native process-inspection footprint",
  () => {
    it.each([
      {
        name: "worker.exe",
        executable: "C:\\OMXTerm-tools\\worker.exe",
        conflict: true,
      },
      {
        name: "worker.exe",
        executable: "c:\\omxterm\\worker.exe",
        conflict: true,
      },
      {
        name: "OMXTerm.exe",
        executable: "C:\\elsewhere\\OMXTerm.exe",
        conflict: true,
      },
      {
        name: "worker.exe",
        executable: "C:\\elsewhere\\worker.exe",
        conflict: false,
      },
    ])(
      "observes the pinned NSIS termination footprint: $executable",
      async ({ name, executable, conflict }) => {
        const encodedScriptPath = Buffer.from(script).toString("base64");
        const source = `
$ErrorActionPreference = 'Stop'
function Get-CimInstance { [pscustomobject]@{ Name='${name}'; ExecutablePath='${executable}' } }
$script = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedScriptPath}'))
& $script -Guid '00000000-0000-0000-0000-000000000000' -TransactionRoot 'C:\\OMXTerm'
`;
        const { stdout } = await execFile(
          path.win32.join(
            process.env["SystemRoot"] ?? "C:\\Windows",
            "System32",
            "WindowsPowerShell",
            "v1.0",
            "powershell.exe",
          ),
          [
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-EncodedCommand",
            Buffer.from(source, "utf16le").toString("base64"),
          ],
          { timeout: 30_000, maxBuffer: 64 * 1024 },
        );
        const observation = JSON.parse(stdout.replace(/^\uFEFF/u, "")) as {
          processes?: unknown;
        };
        expect(observation.processes).toBe(conflict);
      },
      30_000,
    );
  },
);
