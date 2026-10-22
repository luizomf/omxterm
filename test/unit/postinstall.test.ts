import { createHash } from "node:crypto";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prepareNodePtyRuntime } from "../../scripts/prepare-node-pty-runtime.mjs";

const require = createRequire(import.meta.url);
const installedUnixRuntime = path.join(
  path.dirname(require.resolve("node-pty")),
  "unixTerminal.js",
);

describe("node-pty postinstall preparation", () => {
  let root: string;
  let unixRuntimePath: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "omxterm-node-pty-preparation-"));
    unixRuntimePath = path.join(root, "unixTerminal.js");
    await copyFile(installedUnixRuntime, unixRuntimePath);
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("builds node-pty with exec status on Linux ARM64", async () => {
    const rebuild = vi.fn().mockResolvedValue(undefined);
    const chmod = vi.fn().mockResolvedValue(undefined);

    await expect(
      prepareNodePtyRuntime({
        platform: "linux",
        arch: "arm64",
        unixRuntimePath,
        rebuild,
        chmod,
      }),
    ).resolves.toBe("corrected-and-rebuilt");
    expect(rebuild).toHaveBeenCalledOnce();
    expect(chmod).not.toHaveBeenCalled();
  });

  it.each([
    ["linux", "x64"],
    ["darwin", "x64"],
  ] as const)(
    "builds node-pty with exec status on %s %s",
    async (platform, arch) => {
      const rebuild = vi.fn().mockResolvedValue(undefined);
      const chmod = vi.fn().mockResolvedValue(undefined);
      await expect(
        prepareNodePtyRuntime({
          platform,
          arch,
          unixRuntimePath,
          rebuild,
          chmod,
        }),
      ).resolves.toBe("corrected-and-rebuilt");
      expect(rebuild).toHaveBeenCalledOnce();
      if (platform === "darwin")
        expect(chmod).toHaveBeenCalledWith(
          expect.stringMatching(/prebuilds[\\/]darwin-x64[\\/]spawn-helper$/u),
          0o755,
        );
    },
  );

  it("leaves unsupported Unix architectures unbuilt", async () => {
    const rebuild = vi.fn().mockResolvedValue(undefined);
    await expect(
      prepareNodePtyRuntime({
        platform: "linux",
        arch: "ia32",
        unixRuntimePath,
        rebuild,
        chmod: vi.fn(),
      }),
    ).resolves.toBe("corrected");
    expect(rebuild).not.toHaveBeenCalled();
  });

  it("builds the Darwin ARM64 exec-status runtime and makes its helper executable", async () => {
    const rebuild = vi.fn().mockResolvedValue(undefined);
    const chmod = vi.fn().mockResolvedValue(undefined);

    await expect(
      prepareNodePtyRuntime({
        platform: "darwin",
        arch: "arm64",
        helperPath: "/node-pty/spawn-helper",
        unixRuntimePath,
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

  it("prepares reviewed Windows bytes idempotently and refuses dependency drift", async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), "omxterm-node-pty-windows-"),
    );
    const runtimePath = path.join(root, "windowsPtyAgent.js");
    const rebuild = vi.fn().mockResolvedValue(undefined);
    const chmod = vi.fn().mockResolvedValue(undefined);
    const options = {
      platform: "win32",
      windowsRuntimePath: runtimePath,
      rebuild,
      chmod,
      // Windows must not touch the separate Unix runtime.
      unixRuntimePath: path.join(root, "absent-unix.js"),
    };
    try {
      await copyFile(
        path.join(
          path.dirname(require.resolve("node-pty")),
          "windowsPtyAgent.js",
        ),
        runtimePath,
      );
      await expect(prepareNodePtyRuntime(options)).resolves.toBe("corrected");
      const corrected = await readFile(runtimePath);
      expect(createHash("sha256").update(corrected).digest("hex")).toBe(
        "3f4cf11eaa6cc07bacb34e3693857e123e3e55edfb446d7657d80cf95f9ce244",
      );
      await prepareNodePtyRuntime(options);
      expect(await readFile(runtimePath)).toEqual(corrected);
      const drifted = Buffer.concat([corrected, Buffer.from("\n// drift\n")]);
      await writeFile(runtimePath, drifted);
      await expect(prepareNodePtyRuntime(options)).rejects.toThrow(
        "Unrecognized node-pty Windows runtime",
      );
      expect(await readFile(runtimePath)).toEqual(drifted);
      expect(rebuild).not.toHaveBeenCalled();
      expect(chmod).not.toHaveBeenCalled();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
