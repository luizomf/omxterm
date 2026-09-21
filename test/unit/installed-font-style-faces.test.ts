import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { installedFontDataForRestty } from "../../src/main/installed-font-family";

describe("fontconfig real and simulated styles", () => {
  it.each([
    ["oblique transform", "weight=80:slant=100", 80, 110, "1 0.2 0 1", ""],
    ["emboldening", "weight=200:slant=0", 200, 0, "", "True"],
  ] as const)(
    "keeps the regular family usable when fontconfig offers %s instead of a real style",
    async (_name, pattern, weight, slant, matrix, embolden) => {
      const run = vi.fn(async (_file: string, args: readonly string[]) => {
        const simulated = args.at(-1)?.endsWith(pattern);
        const fields = [
          "DejaVu Sans Mono",
          simulated ? weight : 80,
          simulated ? slant : 0,
          path.resolve("assets/fonts/DejaVuSansMono.ttf"),
          "DejaVuSansMono",
        ];
        // Emulate fc-match's requested projection, including old callers that do
        // not ask whether the native result is a synthetic pattern.
        if (args[0]?.includes("%{matrix}"))
          fields.push(simulated ? matrix : "", simulated ? embolden : "");
        return { stdout: fields.join("\u001f") + "\n" };
      });
      const result = await installedFontDataForRestty(
        "DejaVu Sans Mono",
        run,
        "linux",
      );
      expect(result?.data.byteLength).toBeGreaterThan(0);
      expect(result?.styles).toEqual({});
    },
  );

  it("loads real installed styles but does not accept fontconfig's substitute faces", async () => {
    const run = vi.fn(async (_file: string, args: readonly string[]) => {
      const bold = args.at(-1)?.endsWith("weight=200:slant=0");
      return {
        stdout: `DejaVu Sans Mono\u001f${bold ? 200 : 80}\u001f0\u001f${path.resolve(`assets/fonts/DejaVuSansMono${bold ? "-Bold" : ""}.ttf`)}\u001f${bold ? "DejaVuSansMono-Bold" : "DejaVuSansMono"}${args[0]?.includes("%{matrix}") ? "\u001f1 0 0 1\u001fFalse" : ""}\n`,
      };
    });
    const result = await installedFontDataForRestty(
      "DejaVu Sans Mono",
      run,
      "linux",
    );
    expect(result?.styles?.bold?.data.byteLength).toBeGreaterThan(0);
    expect(result?.styles?.italic).toBeUndefined();
    expect(result?.styles?.boldItalic).toBeUndefined();
  });
});
