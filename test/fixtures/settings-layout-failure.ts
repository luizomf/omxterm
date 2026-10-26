import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { writeSync } from "node:fs";
import path from "node:path";
import type { SettingsLayoutObservation } from "./settings-layout-observation";

export interface SettingsLayoutContext {
  readonly phase: "matrix" | "breakpoint" | "minimum";
  readonly language?: string;
  readonly light?: boolean;
  readonly width?: number;
  readonly height?: number;
  readonly category?: string;
  readonly contentTarget?: number;
}

// One bounded synthetic failure frame/observation, before renderer restoration.
// Artifact errors never replace the original oracle failure. The runner chooses
// a persistent destination outside its disposable profile; each failure gets
// its own directory so a later invocation cannot overwrite earlier evidence.
export async function captureSettingsLayoutFailure(options: {
  readonly directory: string;
  readonly context: SettingsLayoutContext;
  readonly observation: SettingsLayoutObservation | null;
  readonly size: () => readonly [number, number];
  readonly capture: (rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => Promise<{ toPNG(): Buffer }>;
  readonly report?: (receipt: string) => void;
}) {
  let screenshot = false;
  let diagnostic = false;
  let directory: string | undefined;
  try {
    await mkdir(options.directory, { recursive: true });
    directory = await mkdtemp(path.join(options.directory, "failure-"));
    try {
      const [width, height] = options.size();
      const image = await options.capture({
        x: 0,
        y: 0,
        width: Math.min(1920, width),
        height: Math.min(1080, height),
      });
      const png = image.toPNG();
      if (png.byteLength > 0 && png.byteLength <= 32 * 1024 * 1024) {
        await writeFile(path.join(directory, "frame.png"), png, { flag: "wx" });
        screenshot = true;
      }
    } catch {
      /* Keep geometry and the original failure if capture is unavailable. */
    }
    const json = JSON.stringify({
      version: 1,
      context: options.context,
      observation: options.observation,
      screenshot,
    });
    const bounded =
      Buffer.byteLength(json) <= 32_768
        ? json
        : JSON.stringify({
            version: 1,
            context: options.context,
            observation: null,
            screenshot,
            truncated: true,
          });
    await writeFile(path.join(directory, "observation.json"), bounded + "\n", {
      flag: "wx",
    });
    diagnostic = true;
  } catch {
    /* Evidence failure cannot turn a failed oracle into success. */
  }
  const receipt = JSON.stringify({
    version: 1,
    context: options.context,
    directory: directory ? path.basename(directory) : null,
    screenshot,
    diagnostic,
  });
  try {
    (
      options.report ??
      ((value) => {
        writeSync(2, value);
      })
    )(`__OMXTERM_SETTINGS_LAYOUT_FAILURE__${receipt}\n`);
  } catch {
    /* Preserve the oracle failure if the diagnostic stream is closed. */
  }
  return { directory, screenshot, diagnostic };
}
