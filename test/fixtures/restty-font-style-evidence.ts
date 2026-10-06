import { mkdir, mkdtemp, open, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

export interface FontStyleEvidence {
  directory: string;
  write(observations: Record<string, unknown>): Promise<void>;
  close(): Promise<void>;
}

/** Reserve the opt-in JSON destination before launching native children. */
export async function createFontStyleEvidence(
  jsonPath: string | undefined,
): Promise<FontStyleEvidence | undefined> {
  if (!jsonPath) return undefined;
  const destination = path.resolve(jsonPath);
  const file = await open(destination, "wx", 0o600);
  try {
    const directory = await mkdtemp(
      path.join(path.dirname(destination), "font-style-captures-"),
    );
    let written = false;
    return {
      directory,
      write: async (observations) => {
        if (written) throw new Error("Font style observations already written");
        written = true;
        return file.writeFile(
          JSON.stringify(
            {
              ...observations,
              captureEvidence: {
                directory: path.basename(directory),
                variants: ["current-regular", "prior-regular"],
              },
            },
            null,
            2,
          ) + "\n",
        );
      },
      close: () => file.close(),
    };
  } catch (error) {
    await file.close();
    throw error;
  }
}

export const fontStyleCaptureNames = [
  "blank",
  "strokeRegular",
  "strokeBold",
] as const;
export type FontStyleVariant = "current-regular" | "prior-regular";
export interface FontStyleCapture {
  image: { toPNG(): Buffer };
  phase: {
    name: string;
    hash?: string;
    ink?:
      | {
          width: number;
          height: number;
          coverage: number;
          centerColumnInk: number;
        }
      | undefined;
    pixelSize?: { width: number; height: number } | undefined;
    bitmapBytes?: number;
  };
}
export interface FontStyleCaptureMetadata {
  variant: FontStyleVariant;
  provenance: Record<string, string>;
  dpr?: number | undefined;
}

/** Encode only retained original images, after the child's final phase report. */
export async function writeFontStyleCaptures(
  directory: string | undefined,
  metadata: FontStyleCaptureMetadata,
  captures: readonly FontStyleCapture[],
): Promise<void> {
  if (!directory) return;
  if (
    captures.some(
      ({ phase }) => !fontStyleCaptureNames.some((name) => name === phase.name),
    )
  )
    throw new Error("Invalid font capture phase");
  if (
    Object.entries(metadata.provenance).some(
      ([key, value]) =>
        !/^[a-zA-Z]+Sha256$/u.test(key) || !/^[a-f0-9]{64}$/u.test(value),
    )
  )
    throw new Error("Invalid font capture provenance");
  await mkdir(directory);
  const phases = [];
  for (const { image, phase } of captures) {
    const png = image.toPNG();
    const file = `${phase.name}.png`;
    await writeFile(path.join(directory, file), png, {
      flag: "wx",
      mode: 0o600,
    });
    phases.push({
      name: phase.name,
      file,
      pngSha256: createHash("sha256").update(png).digest("hex"),
      hash: phase.hash,
      ink: phase.ink,
      pixelSize: phase.pixelSize,
      bitmapBytes: phase.bitmapBytes,
    });
  }
  await writeFile(
    path.join(directory, "manifest.json"),
    JSON.stringify(
      {
        variant: metadata.variant,
        provenance: metadata.provenance,
        dpr: metadata.dpr,
        complete: captures.length === 3,
        phases,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx", mode: 0o600 },
  );
}
