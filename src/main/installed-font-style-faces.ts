import path from "node:path";
import type {
  FontMetricsCommand,
  InstalledFontFace,
} from "./installed-font-family";
import type { TerminalFontStyle } from "../shared/terminal-font-data";

const styles = ["bold", "italic", "boldItalic"] as const;

const macosScript = `
ObjC.import("AppKit");
ObjC.import("CoreText");
const family = ObjC.unwrap($.NSProcessInfo.processInfo.arguments.lastObject);
const manager = $.NSFontManager.sharedFontManager;
const results = [];
for (const [style, traits] of [["bold", 2], ["italic", 1], ["boldItalic", 3]]) {
  const font = manager.fontWithFamilyTraitsWeightSize(family, traits, (traits & 2) ? 9 : 5, 16);
  if (font.isNil() || ObjC.unwrap(font.familyName) !== family || (Number(manager.traitsOfFont(font)) & 3) !== traits) continue;
  const url = $.CTFontDescriptorCopyAttribute(font.fontDescriptor, $.kCTFontURLAttribute);
  if (!url || url.isNil()) continue;
  results.push({style, family, postScriptName: ObjC.unwrap(font.fontName), path: ObjC.unwrap(url.path)});
}
JSON.stringify(results);
`;

// GlyphTypeface refuses simulated faces and returns the file URI of the real
// installed face. No family text is interpolated into executable PowerShell.
const windowsScript = `
Add-Type -AssemblyName PresentationCore
$family = $env:OMXTERM_FONT_FAMILY
$result = @()
foreach ($entry in @(@{Style='bold'; Weight=700; Italic=$false}, @{Style='italic'; Weight=400; Italic=$true}, @{Style='boldItalic'; Weight=700; Italic=$true})) {
  $candidates = @([Windows.Media.Fonts]::SystemTypefaces | Where-Object {
    ($_.FontFamily.FamilyNames.Values -ccontains $family) -and
    ($_.Weight.ToOpenTypeWeight() -eq $entry.Weight) -and
    (($_.Style -ne [Windows.FontStyles]::Normal) -eq $entry.Italic)
  })
  foreach ($candidate in $candidates) {
    $glyph = $null
    if ($candidate.TryGetGlyphTypeface([ref]$glyph) -and $glyph.StyleSimulations -eq [Windows.Media.StyleSimulations]::None -and $glyph.FontUri.IsFile) {
      $result += @{ style=$entry.Style; family=$family; path=$glyph.FontUri.LocalPath }
      break
    }
  }
}
ConvertTo-Json -InputObject @($result) -Compress
`;

export async function installedFontStyleFaces(
  family: string,
  run: FontMetricsCommand,
  platform: string,
): Promise<readonly InstalledFontFace[]> {
  if (platform === "linux") {
    const faces: InstalledFontFace[] = [];
    for (const style of styles) {
      const bold = style !== "italic";
      const italic = style !== "bold";
      const { stdout } = await run("/usr/bin/fc-match", [
        "--format=%{family}\u001f%{weight}\u001f%{slant}\u001f%{file}\u001f%{postscriptname}\\n",
        "--",
        `${family}:weight=${bold ? 200 : 80}:slant=${italic ? 100 : 0}`,
      ]);
      const [families, weight, slant, file, postScriptName, extra] = stdout
        .replace(/\n$/u, "")
        .split("\u001f");
      if (
        extra !== undefined ||
        !families
          ?.split(",")
          .map((value) => value.trim())
          .includes(family) ||
        !file
      )
        continue;
      if (
        !(bold
          ? ["200", "205"].includes(weight ?? "")
          : ["75", "80"].includes(weight ?? "")) ||
        !(italic ? ["100", "110"].includes(slant ?? "") : slant === "0")
      )
        continue;
      faces.push({
        family,
        style,
        path: file,
        ...(postScriptName ? { postScriptName } : {}),
        cellWidth: 9.6,
        cellHeight: 19.2,
      });
    }
    return faces;
  }
  const { stdout } =
    platform === "win32"
      ? await run(
          path.join(
            process.env["SystemRoot"] ?? "C:\\Windows",
            "System32",
            "WindowsPowerShell",
            "v1.0",
            "powershell.exe",
          ),
          ["-NoProfile", "-NonInteractive", "-Command", windowsScript],
          { timeoutMs: 10_000, environment: { OMXTERM_FONT_FAMILY: family } },
        )
      : await run("/usr/bin/osascript", [
          "-l",
          "JavaScript",
          "-e",
          macosScript,
          family,
        ]);
  const result: unknown = JSON.parse(stdout);
  if (!Array.isArray(result) || result.length > 3)
    throw new Error("Installed font style lookup returned invalid data");
  const seen = new Set<string>();
  return result.map((entry: unknown) => {
    if (!isStyleFace(entry, family) || seen.has(entry.style))
      throw new Error("Installed font style lookup returned invalid data");
    seen.add(entry.style);
    return { ...entry, cellWidth: 9.6, cellHeight: 19.2 };
  });
}

function isStyleFace(
  value: unknown,
  family: string,
): value is {
  family: string;
  style: TerminalFontStyle;
  path: string;
  postScriptName?: string;
} {
  if (!value || typeof value !== "object") return false;
  const face = value as Record<string, unknown>;
  return (
    face.family === family &&
    typeof face.style === "string" &&
    styles.includes(face.style as TerminalFontStyle) &&
    typeof face.path === "string" &&
    face.path.length > 0 &&
    (face.postScriptName === undefined ||
      typeof face.postScriptName === "string") &&
    Object.keys(face).every((key) =>
      ["family", "style", "path", "postScriptName"].includes(key),
    )
  );
}
