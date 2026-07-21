import { describe, expect, it, vi } from "vitest";
import { prepareNodePtyRuntime } from "../../scripts/prepare-node-pty-runtime.mjs";

describe("node-pty postinstall preparation", () => {
  it("rebuilds node-pty for Electron on Linux ARM64", async () => {
    const rebuild = vi.fn().mockResolvedValue(undefined);
    const chmod = vi.fn().mockResolvedValue(undefined);

    await expect(
      prepareNodePtyRuntime({
        platform: "linux",
        arch: "arm64",
        rebuild,
        chmod,
      }),
    ).resolves.toBe("rebuilt");
    expect(rebuild).toHaveBeenCalledOnce();
    expect(chmod).not.toHaveBeenCalled();
  });

  it("makes the Darwin ARM64 spawn helper executable without rebuilding", async () => {
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
    ).resolves.toBe("repaired");
    expect(chmod).toHaveBeenCalledOnce();
    expect(chmod).toHaveBeenCalledWith("/node-pty/spawn-helper", 0o755);
    expect(rebuild).not.toHaveBeenCalled();
  });

  it.each([
    ["linux", "x64"],
    ["win32", "arm64"],
  ])("does no native preparation on %s %s", async (platform, arch) => {
    const rebuild = vi.fn().mockResolvedValue(undefined);
    const chmod = vi.fn().mockResolvedValue(undefined);

    await expect(
      prepareNodePtyRuntime({ platform, arch, rebuild, chmod }),
    ).resolves.toBe("unchanged");
    expect(rebuild).not.toHaveBeenCalled();
    expect(chmod).not.toHaveBeenCalled();
  });
});
