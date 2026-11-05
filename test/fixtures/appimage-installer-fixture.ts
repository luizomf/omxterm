import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const helper = path.resolve(
  import.meta.dirname,
  "../../scripts/install-linux-appimage.sh",
);

// Local ownership for the synthetic installer tests, not a native supervisor.
export function createAppImageInstallerFixture() {
  const roots = new Map<string, { pending: number }>();
  return {
    async fixtureRoot() {
      const root = await mkdtemp(
        path.join(tmpdir(), "omxterm-installer-test-"),
      );
      roots.set(root, { pending: 0 });
      const bin = path.join(root, "bin");
      await mkdir(bin);
      await writeFile(
        path.join(bin, "uname"),
        "#!/bin/sh\nprintf '%s\\n' 'aarch64'\n",
        { mode: 0o755 },
      );
      await writeFile(
        path.join(bin, "file"),
        "#!/bin/sh\nprintf '%s\\n' 'ELF 64-bit LSB executable, ARM aarch64'\n",
        { mode: 0o755 },
      );
      return { root, home: path.join(root, "home"), bin };
    },
    async runHelper(
      home: string,
      bin: string,
      arguments_: string[],
      extraEnvironment: NodeJS.ProcessEnv = {},
    ) {
      const owner = roots.get(path.dirname(bin));
      if (!owner) throw new Error("Installer fixture root is no longer active");
      owner.pending += 1;
      try {
        // execFile's callback settles after its child/stdio handling, not when
        // Vitest's test deadline expires. Preserve the original result/error.
        return await execFile("/bin/sh", [helper, ...arguments_], {
          env: {
            ...process.env,
            HOME: home,
            HYPRLAND_INSTANCE_SIGNATURE: "",
            PATH: `${bin}:${process.env.PATH ?? ""}`,
            ...extraEnvironment,
          },
        });
      } finally {
        owner.pending -= 1;
      }
    },
    async cleanup() {
      const selected = [...roots].map(([root, owner]) => ({
        root,
        pending: owner.pending,
      }));
      // Retire helper admission before any await: timed-out tests can resume.
      // Later cleanup never deletes a root retained by this invocation.
      roots.clear();
      const errors: unknown[] = [];
      for (const { root, pending } of selected) {
        if (pending > 0) {
          errors.push(new Error(`Retained installer fixture: ${root}`));
          continue;
        }
        try {
          await rm(root, { recursive: true, force: true });
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length)
        throw new AggregateError(
          errors,
          "Installer fixture cleanup incomplete; helper settlement incomplete or root removal failed",
        );
    },
  };
}
