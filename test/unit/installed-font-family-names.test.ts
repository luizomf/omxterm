import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  installedFontDataForRestty,
  readInstalledFontFaceData,
} from "../../src/main/installed-font-family";
import { fontCollection } from "../fixtures/font-collection";

describe("installed font family metadata", () => {
  it.each([
    [false, "JetBrainsMono NFM"],
    [true, "JetBrainsMono NFM"],
    [true, "JetBrainsMono Nerd Font Mono"],
  ] as const)(
    "loads exact family metadata (collection: %s, family: %s)",
    async (collection, family) => {
      const root = await mkdtemp(path.join(tmpdir(), "omxterm-font-alias-"));
      try {
        const bytes = await readFile(
          "assets/fonts/JetBrainsMonoNerdFontMono-Regular.ttf",
        );
        const file = path.join(root, collection ? "font.ttc" : "font.ttf");
        await writeFile(file, collection ? fontCollection([bytes]) : bytes);
        const run = async (_file: string, args: readonly string[]) => ({
          stdout: JSON.stringify(
            args.at(-1)!.includes("$entry.Weight")
              ? []
              : { status: "available", family, path: file },
          ),
        });
        const result = await installedFontDataForRestty(family, run, "win32");
        expect(result).toMatchObject({
          sourceFamily: collection
            ? "JetBrainsMono NFM"
            : "JetBrainsMono Nerd Font Mono",
          faceIndex: 0,
          styles: {},
        });
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  it.each(["jetbrainsmono nfm", "Regular", "JetBrainsMonoNFM-Regular"])(
    "does not treat %s as an exact recorded family",
    async (family) => {
      await expect(
        readInstalledFontFaceData({
          family,
          path: path.resolve(
            "assets/fonts/JetBrainsMonoNerdFontMono-Regular.ttf",
          ),
          cellWidth: 8,
          cellHeight: 16,
        }),
      ).rejects.toThrow("no exact regular family face");
    },
  );
});
