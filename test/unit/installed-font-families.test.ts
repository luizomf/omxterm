import { describe, expect, it } from "vitest";
import { isInstalledFontFamilyAvailable } from "../../src/main/installed-font-family";

describe("macOS installed font-family availability", () => {
  it("asks AppKit about only the exact configured family", async () => {
    const run = async (file: string, arguments_: readonly string[]) => {
      expect(file).toBe("/usr/bin/osascript");
      expect(arguments_).not.toContain("/usr/sbin/system_profiler");
      expect(arguments_.at(-1)).toBe("Exact Family");
      return { stdout: "available\n" };
    };

    await expect(
      isInstalledFontFamilyAvailable("Exact Family", run),
    ).resolves.toBe(true);
  });

  it("reports an unavailable exact family without falling back", async () => {
    const run = async () => ({ stdout: "missing\n" });

    await expect(
      isInstalledFontFamilyAvailable("Missing Family", run),
    ).resolves.toBe(false);
  });
});
