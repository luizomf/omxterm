import { mkdtemp, readFile, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  installedFallbackFontData,
  installedFontFamilyMetrics,
  installedFontDataForRestty,
  readInstalledFontFaceData,
  readInstalledFontFace,
  type InstalledFontFace,
} from "../../src/main/installed-font-family";

import { fontCollection } from "../fixtures/font-collection";
import { fontWeightVariation } from "../fixtures/font-weight-variation";

const readableFace = async (_face: InstalledFontFace) =>
  new Uint8Array([0, 1, 0, 0]);

describe("installed font-family command seams", () => {
  it("keeps a variable family's regular face usable when native bold needs non-default axes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-variable-font-"));
    try {
      const file = path.join(root, "variable.ttf");
      await writeFile(
        file,
        fontWeightVariation(await readFile("assets/fonts/DejaVuSansMono.ttf")),
      );
      const run = async (_file: string, args: readonly string[]) => ({
        stdout: `DejaVu Sans Mono\u001f${args.at(-1)?.endsWith("weight=200:slant=0") ? 200 : 80}\u001f0\u001f${file}\u001fDejaVuSansMono\n`,
      });
      const result = await installedFontDataForRestty(
        "DejaVu Sans Mono",
        run,
        "linux",
      );
      expect(result?.data.byteLength).toBeGreaterThan(0);
      expect(result?.styles).toEqual({});
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
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

  it.each(["darwin", "win32"])(
    "shares collection bytes and rejects wrong optional faces on %s",
    async (platform) => {
      const root = await mkdtemp(path.join(tmpdir(), "omxterm-style-read-"));
      const file = path.join(root, "styles.ttc");
      try {
        await writeFile(
          file,
          fontCollection(
            await Promise.all(
              ["DejaVuSansMono.ttf", "DejaVuSansMono-Bold.ttf"].map((name) =>
                readFile(path.resolve("assets/fonts", name)),
              ),
            ),
          ),
        );
        let style = "bold";
        const run = async (_file: string, args: readonly string[]) => {
          const isStyle =
            platform === "darwin"
              ? args.at(-1) === "DejaVu Sans Mono"
              : args.at(-1)!.includes("$entry.Weight");
          return {
            stdout: JSON.stringify(
              isStyle
                ? [{ family: "DejaVu Sans Mono", path: file, style }]
                : {
                    status: "available",
                    family: "DejaVu Sans Mono",
                    path: file,
                    ...(platform === "darwin"
                      ? { cellWidth: 8, cellHeight: 16 }
                      : {}),
                  },
            ),
          };
        };
        const result = await installedFontDataForRestty(
          "DejaVu Sans Mono",
          run,
          platform,
        );
        expect(result?.styles.bold?.data).toBe(result?.data);
        expect(result?.faceIndex).toBe(0);
        expect(result?.styles.bold?.faceIndex).toBe(1);
        style = "italic";
        await expect(
          installedFontDataForRestty("DejaVu Sans Mono", run, platform),
        ).rejects.toThrow("no exact italic");
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  it("loads the requested real bold face and refuses it as regular", async () => {
    const face = {
      family: "DejaVu Sans Mono",
      path: path.resolve("assets/fonts/DejaVuSansMono-Bold.ttf"),
      cellWidth: 8,
      cellHeight: 16,
    };
    await expect(
      readInstalledFontFaceData({ ...face, style: "bold" }),
    ).resolves.toMatchObject({
      sourceFamily: "DejaVu Sans Mono",
      faceIndex: 0,
    });
    await expect(readInstalledFontFaceData(face)).rejects.toThrow("regular");
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

describe("installed fallback font data", () => {
  it("loads Source Han on Linux when the other fallback families only resolve to substitutes", async () => {
    const data = new Uint8Array([1, 2, 3]);
    const fallbacks = await installedFallbackFontData(
      async (_file, args) => ({
        stdout: `${args.at(-1) === "Source Han Sans CN:style=Regular" ? "Source Han Sans CN" : "Noto Sans"}\u001f80\u001f0\u001f/fallback.otf\n`,
      }),
      "linux",
      10,
      async () => data,
    );

    expect(fallbacks).toEqual([{ family: "Source Han Sans CN", data }]);
  });

  it.each([
    {
      platform: "linux",
      families: [
        "Noto Color Emoji",
        "Noto Sans CJK SC",
        "DejaVu Sans Mono",
        "Source Han Sans CN",
      ],
    },
    {
      platform: "darwin",
      families: ["Apple Color Emoji", "Hiragino Sans GB", "Apple Symbols"],
    },
    {
      platform: "win32",
      families: [
        "Segoe UI Emoji",
        "Microsoft YaHei UI",
        "Malgun Gothic",
        "Segoe UI Symbol",
      ],
    },
  ])(
    "preserves available fallback precedence on $platform",
    async ({ platform, families }) => {
      const fallbacks = await installedFallbackFontData(
        async (_file, args, options) => {
          const family =
            platform === "linux"
              ? args.at(-1)!.split(":", 1)[0]!
              : platform === "darwin"
                ? args.at(-2)!
                : options!.environment!.OMXTERM_FONT_FAMILY!;
          return {
            stdout:
              platform === "linux"
                ? `${family}\u001f80\u001f0\u001f/fallback.ttf\n`
                : JSON.stringify({
                    status: "available",
                    family,
                    path: "/fallback.ttf",
                    ...(platform === "darwin"
                      ? { cellWidth: 8, cellHeight: 16 }
                      : {}),
                  }),
          };
        },
        platform,
        100,
        readableFace,
      );

      expect(fallbacks.map((font) => font.family)).toEqual(families);
    },
  );

  it.each([
    { name: "missing", output: "Noto Sans\u001f80\u001f0\u001f/font.otf\n" },
    {
      name: "case-mismatched",
      output: "source han sans cn\u001f80\u001f0\u001f/font.otf\n",
    },
    {
      name: "bold-only",
      output: "Source Han Sans CN\u001f200\u001f0\u001f/font.otf\n",
    },
    { name: "lookup failure", output: undefined },
    {
      name: "invalid font data",
      output: "Source Han Sans CN\u001f80\u001f0\u001f/font.otf\n",
    },
  ])(
    "keeps existing Linux fallbacks when Source Han has $name",
    async ({ name, output }) => {
      const fallbacks = await installedFallbackFontData(
        async (_file, args) => {
          const family = args.at(-1)!.split(":", 1)[0]!;
          if (family === "Source Han Sans CN") {
            if (output === undefined) throw new Error("lookup unavailable");
            return { stdout: output };
          }
          return { stdout: `${family}\u001f80\u001f0\u001f/font.ttf\n` };
        },
        "linux",
        100,
        async (face) => {
          if (
            face.family === "Source Han Sans CN" &&
            name === "invalid font data"
          )
            throw new Error("invalid font data");
          return readableFace(face);
        },
      );

      expect(fallbacks.map((font) => font.family)).toEqual([
        "Noto Color Emoji",
        "Noto Sans CJK SC",
        "DejaVu Sans Mono",
      ]);
    },
  );

  it.each([12, 13])(
    "admits Source Han only within the remaining %i-byte budget",
    async (budget) => {
      const fallbacks = await installedFallbackFontData(
        async (_file, args) => ({
          stdout: `${args.at(-1)!.split(":", 1)[0]}\u001f80\u001f0\u001f/font.ttf\n`,
        }),
        "linux",
        budget,
        async (face) =>
          new Uint8Array(face.family === "Source Han Sans CN" ? 4 : 3),
      );

      expect(fallbacks.map((font) => font.family)).toEqual([
        "Noto Color Emoji",
        "Noto Sans CJK SC",
        "DejaVu Sans Mono",
        ...(budget === 13 ? ["Source Han Sans CN"] : []),
      ]);
    },
  );

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
});
