import { describe, expect, it } from "vitest";
import { installedFontFamilyMetrics } from "../../src/main/installed-font-family";

describe("macOS installed font-family availability", () => {
  it("asks AppKit about only the exact configured family", async () => {
    const run = async (file: string, arguments_: readonly string[]) => {
      expect(file).toBe("/usr/bin/osascript");
      expect(arguments_).not.toContain("/usr/sbin/system_profiler");
      expect(arguments_.at(-2)).toBe("Exact Family");
      expect(arguments_.at(-1)).toBe("72");
      return {
        stdout:
          '{"status":"available","cellWidth":135.72,"cellHeight":243.18017578125}\n',
      };
    };

    await expect(
      installedFontFamilyMetrics("Exact Family", 72, run, "darwin"),
    ).resolves.toEqual({ cellWidth: 135.72, cellHeight: 243.18017578125 });
  });

  it("reports an unavailable exact family without falling back", async () => {
    const run = async () => ({ stdout: '{"status":"missing"}\n' });

    await expect(
      installedFontFamilyMetrics("Missing Family", 16, run, "darwin"),
    ).resolves.toBeUndefined();
  });

  it.each([
    "available",
    '{"status":"available","cellWidth":0,"cellHeight":16}',
    '{"status":"available","cellWidth":8,"cellHeight":null}',
    '{"status":"available","cellWidth":8,"cellHeight":"16"}',
    '{"status":"available","cellWidth":8,"cellHeight":16,"extra":true}',
    '{"status":"missing","cellWidth":8}',
  ])("rejects an invalid AppKit payload: %s", async (stdout) => {
    await expect(
      installedFontFamilyMetrics(
        "Exact Family",
        16,
        async () => ({ stdout }),
        "darwin",
      ),
    ).rejects.toThrow("Installed font family metrics returned invalid data");
  });

  it("uses fontconfig without accepting a fallback family on Linux", async () => {
    const exactRun = async (file: string, arguments_: readonly string[]) => {
      expect(file).toBe("/usr/bin/fc-match");
      expect(arguments_).toEqual([
        "--format=%{family}\\n",
        "--",
        "Exact Family",
      ]);
      return { stdout: "Exact Family,Exact Family Regular\n" };
    };
    await expect(
      installedFontFamilyMetrics("Exact Family", 20, exactRun, "linux"),
    ).resolves.toEqual({ cellWidth: 12, cellHeight: 24 });
    await expect(
      installedFontFamilyMetrics(
        "Missing Family",
        20,
        async () => ({ stdout: "Fallback Family\n" }),
        "linux",
      ),
    ).resolves.toBeUndefined();
  });
});
