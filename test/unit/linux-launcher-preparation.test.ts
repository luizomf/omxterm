import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import verifyLinuxLauncherPreparation, {
  prepareLinuxLauncher,
} from "../../scripts/prepare-linux-launcher.mjs";

vi.mock("node:fs/promises", () => ({ readFile: vi.fn(), writeFile: vi.fn() }));

const require = createRequire(import.meta.url);
const installedGenerator =
  require.resolve("app-builder-lib/out/targets/appimage/appImageUtil.js");

describe("Linux packaging launcher preparation", () => {
  afterEach(() => vi.resetAllMocks());
  it.each([undefined, "/fixture/appImageUtil.js"])(
    "refuses unknown dependency bytes at %s without writing a best-effort correction",
    async (target) => {
      vi.mocked(readFile).mockResolvedValue("unknown generator");
      await expect(prepareLinuxLauncher(target)).rejects.toThrow(
        "Unrecognized",
      );
      expect(readFile).toHaveBeenCalledWith(
        target ?? installedGenerator,
        "utf8",
      );
      expect(writeFile).not.toHaveBeenCalled();
    },
  );
  it("prepares only the selected copy, is idempotent and satisfies the production guard", async () => {
    let source = readFileSync(installedGenerator, "utf8");
    const initialDigest = createHash("sha256").update(source).digest("hex");
    const originalDigest =
      "4d3b63afc9939ace718e0b3537e2b1508c15fde7fd030206cbe207bcb6a8f030";
    const correctedDigest =
      "5aa80a572c24cf4cff5b5ca6640770f739ec0ec9dde98aee783398e8216fa27a";
    expect([originalDigest, correctedDigest]).toContain(initialDigest);
    vi.mocked(readFile).mockImplementation(async () => source);
    if (initialDigest === originalDigest)
      await expect(
        verifyLinuxLauncherPreparation({ electronPlatformName: "linux" }),
      ).rejects.toThrow("npm run package:linux");
    vi.mocked(writeFile).mockImplementation(async (_target, corrected) => {
      source = corrected as string;
    });
    const target = "/fixture/appImageUtil.js";
    await prepareLinuxLauncher(target);
    expect(readFile).toHaveBeenCalledWith(target, "utf8");
    expect(writeFile).toHaveBeenCalledTimes(
      initialDigest === originalDigest ? 1 : 0,
    );
    for (const [writtenTarget] of vi.mocked(writeFile).mock.calls)
      expect(writtenTarget).toBe(target);
    expect(createHash("sha256").update(source).digest("hex")).toBe(
      correctedDigest,
    );

    vi.mocked(writeFile).mockClear();
    await prepareLinuxLauncher();
    expect(readFile).toHaveBeenLastCalledWith(installedGenerator, "utf8");
    expect(writeFile).not.toHaveBeenCalled();
    await expect(
      verifyLinuxLauncherPreparation({ electronPlatformName: "linux" }),
    ).resolves.toBeUndefined();
    expect(readFile).toHaveBeenLastCalledWith(installedGenerator);
  });
  it("blocks direct Linux packaging without prepared dependency bytes", async () => {
    vi.mocked(readFile).mockResolvedValue("unknown generator");
    await expect(
      verifyLinuxLauncherPreparation({ electronPlatformName: "linux" }),
    ).rejects.toThrow("npm run package:linux");
    expect(writeFile).not.toHaveBeenCalled();
  });
  it.each(["darwin", "win32"])(
    "leaves %s packaging unchanged",
    async (platform) => {
      await expect(
        verifyLinuxLauncherPreparation({ electronPlatformName: platform }),
      ).resolves.toBeUndefined();
      expect(readFile).not.toHaveBeenCalled();
      expect(writeFile).not.toHaveBeenCalled();
    },
  );
});
