import { execFile as execFileCallback } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";
import { verifyExactWindowsInstaller } from "../../scripts/windows-installer-transaction.mjs";

const executeNative = promisify(execFileCallback);
const projectRoot = fileURLToPath(new URL("../..", import.meta.url));

// Real Windows filesystem inspection; registry/installer commands are mocked.
// Junction targets and payloads belong to this test, never another installation.
describe.skipIf(process.platform !== "win32")(
  "Windows installation tree refusal",
  () => {
    it.each([
      { conflict: "regular", refusal: /Unexpected installer/i },
      { conflict: "junction", refusal: /reparse point ownership/i },
      { conflict: "file-link", refusal: /reparse point ownership/i },
      { conflict: "missing-uninstaller", refusal: /Uninstall OMXTerm\.exe/i },
      { conflict: "unreadable", refusal: /Synthetic access denial/ },
    ])(
      "guards the $conflict tree at the native-command boundary",
      async ({ conflict, refusal }) => {
        const root = await mkdtemp(path.join(tmpdir(), "omxterm-tree-"));
        const localAppData = path.join(root, "Local");
        const installation = path.join(localAppData, "Programs", "omxterm");
        const outside = path.join(root, "outside");
        const marker = path.join(outside, "preserved.txt");
        const installer = path.join(root, "synthetic-installer.exe");
        const runner = path.join(root, "inspect.ps1");
        const launches: string[] = [];
        try {
          await mkdir(installation, { recursive: true });
          await mkdir(outside);
          await writeFile(marker, "synthetic unrelated bytes");
          await writeFile(installer, "synthetic installer; never executable");
          await writeFile(
            path.join(installation, "OMXTerm.exe"),
            "synthetic app",
          );
          await writeFile(
            path.join(installation, "Uninstall OMXTerm.exe"),
            "synthetic uninstaller",
          );
          if (conflict === "junction")
            await symlink(
              outside,
              path.join(installation, "nested"),
              "junction",
            );
          if (conflict === "file-link")
            await symlink(
              marker,
              path.join(installation, "linked.txt"),
              "file",
            );
          if (conflict === "missing-uninstaller")
            await unlink(path.join(installation, "Uninstall OMXTerm.exe"));
          await writeFile(
            runner,
            `param([string]$Helper,[string]$Root)
$ErrorActionPreference='Stop'
. $Helper
${conflict === "unreadable" ? "function Get-ChildItem { throw 'Synthetic access denial' }" : ""}
try {
  Assert-OmxtermInstallationTree -Root $Root -RequireBinaries
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
`,
          );
          const execute = async (file: string, args: string[]) => {
            if (!args.includes("-Guid")) {
              launches.push(file);
              throw new Error("Unexpected installer or cleanup launch");
            }
            await executeNative(file, [
              "-NoLogo",
              "-NoProfile",
              "-NonInteractive",
              "-File",
              runner,
              "-Helper",
              path.join(
                projectRoot,
                "scripts",
                "windows-installation-tree.ps1",
              ),
              "-Root",
              installation,
            ]);
            return {
              stdout: JSON.stringify({
                processes: false,
                paths: [
                  {
                    path: installation,
                    kind: "install",
                    scope: "user",
                    target: null,
                  },
                ],
                registrations: [
                  {
                    hive: "CurrentUser",
                    view: "Registry64",
                    kind: "install",
                    location: installation,
                    uninstall: null,
                    shortcut: "OMXTerm",
                    menu: null,
                  },
                  {
                    hive: "CurrentUser",
                    view: "Registry64",
                    kind: "uninstall",
                    location: null,
                    uninstall: `"${path.join(installation, "Uninstall OMXTerm.exe")}" /currentuser`,
                    shortcut: null,
                    menu: null,
                  },
                ],
              }),
            };
          };
          const verification = verifyExactWindowsInstaller({
            installer,
            unpackedRoot: root,
            projectRoot,
            disposableVm: true,
            verifyInstalled: vi.fn(),
            execute,
            temporaryDirectory: root,
            localAppData,
          });
          // A policy, bootstrap, or unrelated I/O failure must not masquerade
          // as proof that the intended ownership guard actually ran.
          await expect(verification).rejects.toThrow(refusal);
          expect(launches).toEqual(conflict === "regular" ? [installer] : []);
          expect(await readFile(marker, "utf8")).toBe(
            "synthetic unrelated bytes",
          );
        } finally {
          await rm(root, { recursive: true, force: true });
        }
      },
      30_000,
    );
  },
);
