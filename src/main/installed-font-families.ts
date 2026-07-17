import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface FontProfile {
  readonly SPFontsDataType?: readonly {
    readonly enabled?: string;
    readonly valid?: string;
    readonly typefaces?: readonly {
      readonly enabled?: string;
      readonly valid?: string;
      readonly family?: string;
    }[];
  }[];
}

export async function discoverInstalledFontFamilies(): Promise<Set<string>> {
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(
      "/usr/sbin/system_profiler",
      ["SPFontsDataType", "-json"],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
    ));
  } catch {
    throw new Error("Installed font families could not be discovered");
  }

  try {
    return parseInstalledFontFamilies(stdout);
  } catch {
    throw new Error("Installed font family discovery returned invalid data");
  }
}

export function parseInstalledFontFamilies(stdout: string): Set<string> {
  let profile: FontProfile;
  try {
    profile = JSON.parse(stdout) as FontProfile;
  } catch {
    throw new TypeError("Invalid font profile JSON");
  }

  const families = new Set<string>();
  for (const font of profile.SPFontsDataType ?? []) {
    if (font.enabled !== "yes" || font.valid !== "yes") continue;
    for (const face of font.typefaces ?? []) {
      if (
        face.enabled === "yes" &&
        face.valid === "yes" &&
        typeof face.family === "string" &&
        face.family.length > 0
      )
        families.add(face.family);
    }
  }
  return families;
}
