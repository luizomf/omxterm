import { describe, expect, it, vi } from "vitest";
import { repairNodePtySpawnHelper } from "../../scripts/repair-node-pty-spawn-helper.mjs";

describe("node-pty postinstall repair", () => {
  it("makes the Darwin ARM64 spawn helper executable", async () => {
    const chmod = vi.fn().mockResolvedValue(undefined);

    await expect(
      repairNodePtySpawnHelper({
        platform: "darwin",
        arch: "arm64",
        helperPath: "/node-pty/spawn-helper",
        chmod,
      }),
    ).resolves.toBe(true);
    expect(chmod).toHaveBeenCalledOnce();
    expect(chmod).toHaveBeenCalledWith("/node-pty/spawn-helper", 0o755);
  });

  it.each(["linux", "win32"])(
    "does no filesystem work on %s",
    async (platform) => {
      const chmod = vi.fn().mockResolvedValue(undefined);

      await expect(
        repairNodePtySpawnHelper({
          platform,
          arch: "arm64",
          helperPath: "/node-pty/spawn-helper",
          chmod,
        }),
      ).resolves.toBe(false);
      expect(chmod).not.toHaveBeenCalled();
    },
  );
});
