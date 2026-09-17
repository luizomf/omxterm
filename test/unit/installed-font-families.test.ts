import { mkdtemp, readFile, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  installedFallbackFontData,
  installedFontFamilyMetrics,
  readInstalledFontFace,
  type InstalledFontFace,
} from "../../src/main/installed-font-family";

const readableFace = async (_face: InstalledFontFace) =>
  new Uint8Array([0, 1, 0, 0]);

describe("installed font-family command seams", () => {
  it("selects one exact regular macOS face without shell interpolation", async () => {
    const run = vi.fn(async (file: string, arguments_: readonly string[]) => {
      expect(file).toBe("/usr/bin/osascript");
      expect(arguments_.at(-2)).toBe("Exact Família");
      expect(arguments_.at(-1)).toBe("72");
      return {
        stdout: JSON.stringify({
          status: "available",
          family: "Exact Família",
          path: "/Library/Fonts/Directory With Spaces/正規.ttf",
          cellWidth: 135.72,
          cellHeight: 243.18,
        }),
      };
    });
    const read = vi.fn(async (face: InstalledFontFace) => readableFace(face));

    await expect(
      installedFontFamilyMetrics("Exact Família", 72, run, "darwin", read),
    ).resolves.toEqual({ cellWidth: 135.72, cellHeight: 243.18 });
    expect(read.mock.calls[0]?.[0]).toMatchObject({
      family: "Exact Família",
      path: "/Library/Fonts/Directory With Spaces/正規.ttf",
    });
  });

  it.each(["missing", "missing-regular"])(
    "does not substitute for macOS status %s",
    async (status) => {
      await expect(
        installedFontFamilyMetrics(
          "Missing Family",
          16,
          async () => ({ stdout: JSON.stringify({ status }) }),
          "darwin",
          readableFace,
        ),
      ).resolves.toBeUndefined();
    },
  );

  it.each([
    "available",
    '{"status":"available","family":"Exact","path":"/f","cellWidth":0,"cellHeight":16}',
    '{"status":"available","family":"Exact","path":"/f","cellWidth":8,"cellHeight":null}',
    '{"status":"available","family":"Exact","path":"/f","cellWidth":8,"cellHeight":16,"extra":true}',
    '{"status":"missing","path":"/f"}',
  ])("rejects invalid native output: %s", async (stdout) => {
    await expect(
      installedFontFamilyMetrics(
        "Exact",
        16,
        async () => ({ stdout }),
        "darwin",
        readableFace,
      ),
    ).rejects.toThrow("Installed font family lookup returned invalid data");
  });

  it("passes a Windows family only through the environment", async () => {
    const run = vi.fn(
      async (
        file: string,
        arguments_: readonly string[],
        options?: { readonly environment?: Readonly<Record<string, string>> },
      ) => {
        expect(file).toMatch(/[/\\]powershell\.exe$/u);
        expect(arguments_.at(-1)).not.toContain("Exact Família");
        expect(options?.environment).toEqual({
          OMXTERM_FONT_FAMILY: "Exact Família",
        });
        return {
          stdout: JSON.stringify({
            status: "available",
            family: "Exact Família",
            path: "C:\\Windows\\Fonts\\A Space 正規.ttf",
          }),
        };
      },
    );
    await expect(
      installedFontFamilyMetrics(
        "Exact Família",
        20,
        run,
        "win32",
        readableFace,
      ),
    ).resolves.toEqual({ cellWidth: 12, cellHeight: 24 });
  });

  it("bounds reads and rejects unreadable, empty, oversized, and corrupt faces", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-font-read-"));
    const face = (file: string): InstalledFontFace => ({
      family: "JetBrainsMono Nerd Font Mono",
      path: path.join(root, file),
      cellWidth: 8,
      cellHeight: 16,
    });
    try {
      const validFont = await readFile(
        path.resolve("assets/fonts/JetBrainsMonoNerdFontMono-Regular.ttf"),
      );
      await writeFile(face("valid.ttf").path, validFont);
      await expect(
        readInstalledFontFace(face("valid.ttf")),
      ).resolves.toHaveLength(validFont.byteLength);
      await writeFile(
        face("signature-only.ttf").path,
        new Uint8Array([0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      );
      await expect(
        readInstalledFontFace(face("signature-only.ttf")),
      ).rejects.toThrow("no exact regular family face");
      await expect(readInstalledFontFace(face("missing.ttf"))).rejects.toThrow(
        "could not be read",
      );
      await writeFile(face("corrupt.ttf").path, "not a font");
      await expect(readInstalledFontFace(face("corrupt.ttf"))).rejects.toThrow(
        "unsupported or corrupt",
      );
      await writeFile(face("oversized.ttf").path, "");
      await truncate(face("oversized.ttf").path, 268_435_457);
      await expect(
        readInstalledFontFace(face("oversized.ttf")),
      ).rejects.toThrow("268435456-byte limit");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps optional fallback bytes within the supplied aggregate budget", async () => {
    const run = vi.fn(async (_file: string, arguments_: readonly string[]) => {
      const requested = arguments_.at(-1)?.split(":", 1)[0] ?? "";
      return {
        stdout: `${requested}\u001f80\u001f0\u001f/${requested}.ttf\n`,
      };
    });

    const fallbacks = await installedFallbackFontData(
      run,
      "linux",
      10,
      async () => new Uint8Array(6),
    );

    expect(fallbacks).toHaveLength(1);
    expect(fallbacks[0]?.data).toHaveLength(6);
  });

  it("uses fontconfig exact-family and regular-face output without a shell", async () => {
    const run = vi.fn(async (file: string, arguments_: readonly string[]) => {
      expect(file).toBe("/usr/bin/fc-match");
      expect(arguments_).toEqual([
        "--format=%{family}\u001f%{weight}\u001f%{slant}\u001f%{file}\u001f%{postscriptname}\\n",
        "--",
        "Exact Família:style=Regular",
      ]);
      return {
        stdout:
          "Exact Família,Alias\u001f80\u001f0\u001f/usr/share/fonts/A Space 正規.ttf\u001fExactFamilia-Regular\n",
      };
    });
    await expect(
      installedFontFamilyMetrics(
        "Exact Família",
        20,
        run,
        "linux",
        readableFace,
      ),
    ).resolves.toEqual({ cellWidth: 12, cellHeight: 24 });
    await expect(
      installedFontFamilyMetrics(
        "Missing",
        20,
        async () => ({
          stdout:
            "Fallback\u001f80\u001f0\u001f/fallback.ttf\u001fFallback-Regular\n",
        }),
        "linux",
        readableFace,
      ),
    ).resolves.toBeUndefined();
  });
});
