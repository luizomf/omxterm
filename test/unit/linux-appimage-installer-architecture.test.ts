import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  fakeAppImage,
  fixtureRoot,
  owned,
  removeTemporaryRoots,
  runHelper,
} from "../fixtures/linux-appimage-installer-harness";

afterEach(removeTemporaryRoots);

describe.skipIf(process.platform === "win32")(
  "Linux AppImage installer architecture check",
  () => {
    it("installs an x86-64 AppImage on an x86-64 computer", async () => {
      const { root, home, bin } = await fixtureRoot();
      const appImage = await fakeAppImage(root, "x64");
      await runHelper(home, bin, ["install", appImage], {
        OMXTERM_TEST_FILE_DESCRIPTION: "ELF 64-bit LSB executable, x86-64",
        OMXTERM_TEST_HOST_ARCH: "x86_64",
      });
      expect(await readFile(owned(home).icon, "utf8")).toBe("icon-x64\n");
    });

    it("refuses an AppImage built for another architecture", async () => {
      const { root, home, bin } = await fixtureRoot();
      const appImage = await fakeAppImage(root, "arm");
      await expect(
        runHelper(home, bin, ["install", appImage], {
          OMXTERM_TEST_HOST_ARCH: "x86_64",
        }),
      ).rejects.toThrow(
        "the AppImage is built for aarch64, but this computer is x86_64",
      );
      await expect(stat(path.join(home, ".local"))).rejects.toMatchObject({
        code: "ENOENT",
      });
    });
  },
);
