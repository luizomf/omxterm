import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFontStyleEvidence,
  writeFontStyleCaptures,
} from "../fixtures/restty-font-style-evidence";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "omxterm-font-evidence-unit-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("opt-in font style evidence", () => {
  it("creates no output when the evidence path is absent", async () => {
    expect(await createFontStyleEvidence(undefined)).toBeUndefined();
    expect(await readdir(root)).toEqual([]);
  });

  it("preserves existing observations and a relative capture index before a failing assertion", async () => {
    const jsonPath = path.join(root, "observations.json");
    const evidence = await createFontStyleEvidence(jsonPath);
    expect(evidence).toBeDefined();
    try {
      await evidence!.write({ regular: { result: { requests: 1 } } });
      expect(() => expect(5).toBeGreaterThan(10)).toThrow();
    } finally {
      await evidence!.close();
    }
    const data = JSON.parse(await readFile(jsonPath, "utf8")) as {
      regular: unknown;
      captureEvidence: { directory: string; variants: string[] };
    };
    expect(data.regular).toEqual({ result: { requests: 1 } });
    expect(path.isAbsolute(data.captureEvidence.directory)).toBe(false);
    expect(data.captureEvidence.directory).toMatch(/^font-style-captures-/u);
    expect(data.captureEvidence.variants).toEqual([
      "current-regular",
      "prior-regular",
    ]);
    expect(await readdir(root)).toContain(data.captureEvidence.directory);
  });

  it("writes only the three synthetic phase names with hashes of the encoded image bytes", async () => {
    // Mock NativeImage bytes exercise retention, not native PNG encoding.
    const toPNG = vi.fn(() => Buffer.from("abc"));
    const captures = ["blank", "strokeRegular", "strokeBold"].map((name) => ({
      image: { toPNG },
      phase: {
        name,
        hash: "a".repeat(64),
        pixelSize: { width: 900, height: 572 },
        bitmapBytes: 2059200,
      },
    }));
    const directory = path.join(root, "current-regular");
    await writeFontStyleCaptures(
      directory,
      { variant: "current-regular", provenance: {}, dpr: 1 },
      captures,
    );
    expect(await readdir(directory)).toEqual([
      "blank.png",
      "manifest.json",
      "strokeBold.png",
      "strokeRegular.png",
    ]);
    const manifest = JSON.parse(
      await readFile(path.join(directory, "manifest.json"), "utf8"),
    ) as {
      variant: string;
      complete: boolean;
      phases: { name: string; file: string; pngSha256: string; hash: string }[];
    };
    expect(manifest.variant).toBe("current-regular");
    expect(manifest.complete).toBe(true);
    expect(manifest.phases.map((phase) => phase.name)).toEqual([
      "blank",
      "strokeRegular",
      "strokeBold",
    ]);
    for (const phase of manifest.phases) {
      expect(await readFile(path.join(directory, phase.file), "utf8")).toBe(
        "abc",
      );
      expect(phase.pngSha256).toBe(
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      );
      expect(phase.hash).toBe("a".repeat(64));
    }
    expect(toPNG).toHaveBeenCalledTimes(3);
  });

  it("does not encode images or write captures without an opt-in destination", async () => {
    const toPNG = vi.fn(() => Buffer.from("abc"));
    await writeFontStyleCaptures(
      undefined,
      { variant: "current-regular", provenance: {} },
      [{ image: { toPNG }, phase: { name: "blank" } }],
    );
    expect(toPNG).not.toHaveBeenCalled();
    expect(await readdir(root)).toEqual([]);
  });

  it("rejects non-synthetic phase names before encoding or writing", async () => {
    const toPNG = vi.fn(() => Buffer.from("abc"));
    await expect(
      writeFontStyleCaptures(
        path.join(root, "current-regular"),
        { variant: "current-regular", provenance: {} },
        [{ image: { toPNG }, phase: { name: "../terminal-text" } }],
      ),
    ).rejects.toThrow("Invalid font capture phase");
    expect(toPNG).not.toHaveBeenCalled();
    expect(await readdir(root)).toEqual([]);
  });

  it("refuses an existing JSON path without replacing it or allocating a capture root", async () => {
    const destination = path.join(root, "existing.json");
    await writeFile(destination, "existing-candidate");
    await expect(createFontStyleEvidence(destination)).rejects.toMatchObject({
      code: "EEXIST",
    });
    expect(await readFile(destination, "utf8")).toBe("existing-candidate");
    expect(await readdir(root)).toEqual(["existing.json"]);
  });

  it("refuses a second observation write instead of appending another candidate", async () => {
    const destination = path.join(root, "observations.json");
    const evidence = await createFontStyleEvidence(destination);
    try {
      await evidence!.write({ regular: "first-candidate" });
      const original = await readFile(destination, "utf8");
      await expect(
        evidence!.write({ regular: "second-candidate" }),
      ).rejects.toThrow("already written");
      expect(await readFile(destination, "utf8")).toBe(original);
    } finally {
      await evidence!.close();
    }
  });

  it("allocates separate roots for parallel output destinations and keeps prior/current variants distinct", async () => {
    const [one, two] = await Promise.all([
      createFontStyleEvidence(path.join(root, "one.json")),
      createFontStyleEvidence(path.join(root, "two.json")),
    ]);
    try {
      expect(one!.directory).not.toBe(two!.directory);
      await Promise.all(
        ["current-regular", "prior-regular"].map(async (variant) => {
          await writeFontStyleCaptures(
            path.join(one!.directory, variant),
            {
              variant: variant as "current-regular" | "prior-regular",
              provenance: {},
            },
            [],
          );
        }),
      );
      expect(await readdir(one!.directory)).toEqual([
        "current-regular",
        "prior-regular",
      ]);
      const prior = JSON.parse(
        await readFile(
          path.join(one!.directory, "prior-regular/manifest.json"),
          "utf8",
        ),
      ) as { complete: boolean; variant: string };
      expect(prior.variant).toBe("prior-regular");
      expect(prior.complete).toBe(false);
    } finally {
      await Promise.all([one!.close(), two!.close()]);
    }
  });

  it("preserves an existing variant and its image without re-encoding it", async () => {
    const directory = path.join(root, "current-regular");
    const captures = [
      { image: { toPNG: () => Buffer.from("abc") }, phase: { name: "blank" } },
    ];
    await writeFontStyleCaptures(
      directory,
      { variant: "current-regular", provenance: {} },
      captures,
    );
    const toPNG = vi.fn(() => Buffer.from("replacement"));
    await expect(
      writeFontStyleCaptures(
        directory,
        { variant: "current-regular", provenance: {} },
        [{ image: { toPNG }, phase: { name: "blank" } }],
      ),
    ).rejects.toMatchObject({ code: "EEXIST" });
    expect(toPNG).not.toHaveBeenCalled();
    expect(await readFile(path.join(directory, "blank.png"), "utf8")).toBe(
      "abc",
    );
  });

  it("rejects private paths in provenance and excludes extra phase payloads from metadata", async () => {
    const directory = path.join(root, "current-regular");
    const captures = [
      {
        image: { toPNG: () => Buffer.from("abc") },
        phase: { name: "blank", terminalText: "private terminal payload" },
      },
    ];
    await expect(
      writeFontStyleCaptures(
        directory,
        {
          variant: "current-regular",
          provenance: { mainSourceSha256: "/private/source.ts" },
        },
        captures,
      ),
    ).rejects.toThrow("Invalid font capture provenance");
    expect(await readdir(root)).toEqual([]);
    await writeFontStyleCaptures(
      directory,
      {
        variant: "current-regular",
        provenance: { mainSourceSha256: "a".repeat(64) },
      },
      captures,
    );
    const manifest = await readFile(
      path.join(directory, "manifest.json"),
      "utf8",
    );
    expect(manifest).not.toContain("private terminal payload");
    expect(manifest).not.toContain("/private/");
    expect(manifest).toContain("mainSourceSha256");
  });
});
