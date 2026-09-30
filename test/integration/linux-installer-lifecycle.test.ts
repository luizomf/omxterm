import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cleanupInstallerProcess } from "../fixtures/cleanup-installer-process";

const helper = path.resolve(
  import.meta.dirname,
  "../../scripts/install-linux-appimage.sh",
);

describe.skipIf(process.platform !== "linux")(
  "native installer mount lifecycle",
  () => {
    it.each(["shutdown timeout", "TERM interruption", "TERM during shutdown"])(
      "%s reaps a real TERM-resistant child without publishing files",
      async (scenario) => {
        const root = await mkdtemp(
          path.join(tmpdir(), "omxterm-mount-lifecycle-"),
        );
        const bin = path.join(root, "bin");
        const home = path.join(root, "home");
        const mount = path.join(root, "mount");
        await mkdir(bin);
        await mkdir(mount);
        await writeFile(
          path.join(bin, "file"),
          "#!/bin/sh\nprintf '%s\\n' 'ELF 64-bit LSB executable, ARM aarch64'\n",
          { mode: 0o755 },
        );
        const app = path.join(root, "fixture.AppImage");
        const runtime = path.join(root, "runtime.cjs");
        await writeFile(
          app,
          `#!/bin/sh\nexec '${process.execPath}' '${runtime}' "$@"\n`,
          { mode: 0o755 },
        );
        await writeFile(
          runtime,
          `
const fs = require('node:fs');
const path = require('node:path');
if (process.argv[2] === '--appimage-extract') {
  const target = path.join('squashfs-root', process.argv[3]);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.writeFileSync(target, target.endsWith('.desktop') ? 'Name=OMXTerm\\nIcon=omxterm\\nStartupWMClass=omxterm\\n' : 'icon');
} else {
  process.on('SIGTERM', () => fs.writeFileSync(process.env.TERM_MARKER, 'TERM_OBSERVED'));
  fs.writeFileSync(process.env.PID_FILE, String(process.pid));
  if (process.env.MOUNT_PATH) console.log(process.env.MOUNT_PATH);
  setInterval(() => {}, 1000);
}
`,
          { mode: 0o755 },
        );
        const pidFile = path.join(root, "pid");
        const termMarker = path.join(root, "term");
        const child = spawn("/bin/sh", [helper, "install", app], {
          detached: true,
          env: {
            ...process.env,
            HOME: home,
            TMPDIR: root,
            HYPRLAND_INSTANCE_SIGNATURE: "",
            PATH: `${bin}:${process.env.PATH ?? ""}`,
            PID_FILE: pidFile,
            TERM_MARKER: termMarker,
            MOUNT_PATH: scenario === "TERM interruption" ? "" : mount,
          },
          stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk: Buffer) => {
          stdout += chunk.toString();
        });
        child.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString();
        });
        let timer: NodeJS.Timeout | undefined;
        try {
          if (scenario !== "shutdown timeout") {
            const deadline = Date.now() + 3000;
            const marker = scenario === "TERM during shutdown" ? "term" : "pid";
            while (!(await readdir(root)).includes(marker)) {
              if (Date.now() > deadline)
                throw new Error("mount child was not started");
              await new Promise((resolve) => setTimeout(resolve, 20));
            }
            child.kill("SIGTERM");
          }
          const outcome = await Promise.race([
            once(child, "exit"),
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () =>
                  reject(
                    new Error("full helper did not return within 12 seconds"),
                  ),
                12_000,
              );
            }),
          ]);
          expect(outcome[0]).toBe(scenario !== "shutdown timeout" ? 143 : 1);
          expect(stdout).not.toContain("Installed OMXTerm");
          expect(stderr).toContain("mount probe shutdown timed out");
          expect(await readFile(termMarker, "utf8")).toBe("TERM_OBSERVED");
          const pid = Number(await readFile(pidFile, "utf8"));
          expect(() => process.kill(pid, 0)).toThrow();
          await expect(
            readdir(path.join(home, ".local")),
          ).rejects.toMatchObject({ code: "ENOENT" });
          expect(
            (await readdir(root)).filter((name) =>
              name.startsWith("omxterm-installer."),
            ),
          ).toEqual([]);
        } finally {
          clearTimeout(timer);
          if (
            child.exitCode === null &&
            child.signalCode === null &&
            child.pid
          ) {
            process.kill(-child.pid, "SIGKILL");
            await once(child, "exit");
          }
          await cleanupInstallerProcess(root, pidFile, runtime);
        }
      },
      15_000,
    );
  },
);
