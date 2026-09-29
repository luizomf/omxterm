import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import { prepareNodePtyRuntime } from "../../scripts/prepare-node-pty-runtime.mjs";

const require = createRequire(import.meta.url);
const installedUnixRuntime = path.join(
  path.dirname(require.resolve("node-pty")),
  "unixTerminal.js",
);

describe("node-pty postinstall preparation", () => {
  it("builds node-pty with exec status on Linux ARM64", async () => {
    const rebuild = vi.fn().mockResolvedValue(undefined);
    const chmod = vi.fn().mockResolvedValue(undefined);

    await expect(
      prepareNodePtyRuntime({
        platform: "linux",
        arch: "arm64",
        rebuild,
        chmod,
      }),
    ).resolves.toBe("corrected-and-rebuilt");
    expect(rebuild).toHaveBeenCalledOnce();
    expect(chmod).not.toHaveBeenCalled();
  });

  it("builds the Darwin ARM64 exec-status runtime and makes its helper executable", async () => {
    const rebuild = vi.fn().mockResolvedValue(undefined);
    const chmod = vi.fn().mockResolvedValue(undefined);

    await expect(
      prepareNodePtyRuntime({
        platform: "darwin",
        arch: "arm64",
        helperPath: "/node-pty/spawn-helper",
        rebuild,
        chmod,
      }),
    ).resolves.toBe("corrected-and-rebuilt");
    expect(chmod).toHaveBeenCalledOnce();
    expect(chmod).toHaveBeenCalledWith("/node-pty/spawn-helper", 0o755);
    expect(rebuild).toHaveBeenCalledOnce();
  });

  it("rejects unreviewed node-pty Unix runtime bytes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-node-pty-drift-"));
    try {
      const runtimePath = path.join(root, "unixTerminal.js");
      await copyFile(installedUnixRuntime, runtimePath);
      await writeFile(runtimePath, "unreviewed runtime\n");
      await expect(
        prepareNodePtyRuntime({
          platform: "darwin",
          arch: "x64",
          unixRuntimePath: runtimePath,
          rebuild: vi.fn(),
          chmod: vi.fn(),
        }),
      ).rejects.toThrow("Unrecognized node-pty Unix runtime");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each([
    ["linux", "x64", "corrected"],
    ["win32", "arm64", "unchanged"],
  ])(
    "uses the reviewed platform preparation on %s %s",
    async (platform, arch, result) => {
      const rebuild = vi.fn().mockResolvedValue(undefined);
      const chmod = vi.fn().mockResolvedValue(undefined);

      await expect(
        prepareNodePtyRuntime({ platform, arch, rebuild, chmod }),
      ).resolves.toBe(result);
      expect(rebuild).not.toHaveBeenCalled();
      expect(chmod).not.toHaveBeenCalled();
    },
  );
});
