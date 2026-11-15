import { stat } from "node:fs/promises";
import {
  fallbackFontFamilies,
  installedFontFaceFromResult,
  resolveFallbackFontFaces,
  resolveInstalledFontFace,
  runFontMetricsCommand,
  windowsPowerShell,
  type FontMetricsCommand,
  type InstalledFontFace,
} from "./installed-font-family";
import {
  installedFontStyleFaces,
  installedFontStyleFacesFromResult,
} from "./installed-font-style-faces";

/** Where one Terminal Font load finds its installed files. No bytes. */
export interface TerminalFontFaces {
  /** The configured family's regular face; absent when none is configured or installed. */
  readonly regular?: InstalledFontFace;
  readonly styles: readonly InstalledFontFace[];
  /** Installed OS fallback faces, in precedence order. */
  readonly fallbacks: readonly InstalledFontFace[];
}

export type TerminalFontFaceLookup = (
  family: string | undefined,
) => Promise<TerminalFontFaces>;

// One process answers the configured family, its styles and every fallback, so
// PowerShell and PresentationCore load once. The per-family predicates are the
// single-family scripts' own. Families travel only as numbered environment
// variables; the fixed script never interpolates or parses family text.
const WINDOWS_FONT_FACES_SCRIPT = `
Add-Type -AssemblyName PresentationCore
$typefaces = @([Windows.Media.Fonts]::SystemTypefaces)
$regularCandidates = @($typefaces | Where-Object {
  $_.Style -eq [Windows.FontStyles]::Normal -and $_.Weight.ToOpenTypeWeight() -lt 650
} | Sort-Object @{ Expression = { [Math]::Abs($_.Weight.ToOpenTypeWeight() - 400) } })
$results = @()
for ($index = 0; $index -lt [int]$env:OMXTERM_FONT_FAMILY_COUNT; $index++) {
  $family = [Environment]::GetEnvironmentVariable("OMXTERM_FONT_FAMILY_$index")
  $regular = @{ status = 'missing-regular' }
  foreach ($candidate in $regularCandidates) {
    $glyph = $null
    if (-not $candidate.TryGetGlyphTypeface([ref]$glyph)) { continue }
    $names = @($glyph.FamilyNames.Values) + @($glyph.Win32FamilyNames.Values)
    if ($names -cnotcontains $family -or
        $glyph.StyleSimulations -ne [Windows.Media.StyleSimulations]::None -or
        -not $glyph.FontUri.IsFile) { continue }
    $regular = @{ status = 'available'; family = $family; path = $glyph.FontUri.LocalPath }
    break
  }
  $styles = @()
  if ("$index" -eq $env:OMXTERM_FONT_STYLED_INDEX -and $regular.status -eq 'available') {
    foreach ($entry in @(@{Style='bold'; Weight=700; Italic=$false}, @{Style='italic'; Weight=400; Italic=$true}, @{Style='boldItalic'; Weight=700; Italic=$true})) {
      $candidates = @($typefaces | Where-Object {
        ($_.FontFamily.FamilyNames.Values -ccontains $family) -and
        ($_.Weight.ToOpenTypeWeight() -eq $entry.Weight) -and
        (($_.Style -ne [Windows.FontStyles]::Normal) -eq $entry.Italic)
      })
      foreach ($candidate in $candidates) {
        $glyph = $null
        if ($candidate.TryGetGlyphTypeface([ref]$glyph) -and $glyph.StyleSimulations -eq [Windows.Media.StyleSimulations]::None -and $glyph.FontUri.IsFile) {
          $styles += @{ style=$entry.Style; family=$family; path=$glyph.FontUri.LocalPath }
          break
        }
      }
    }
  }
  $results += @{ regular = $regular; styles = @($styles) }
}
ConvertTo-Json -InputObject @($results) -Compress -Depth 4
`;

/** Finds the installed files for the configured family and the OS fallbacks. */
export async function installedTerminalFontFaces(
  family: string | undefined,
  run: FontMetricsCommand = runFontMetricsCommand,
  platform: string = process.platform,
): Promise<TerminalFontFaces> {
  if (platform === "win32") return windowsTerminalFontFaces(family, run);
  const regular =
    family === undefined
      ? undefined
      : await resolveInstalledFontFace(family, 16, run, platform);
  const styles = regular
    ? await installedFontStyleFaces(regular.family, run, platform)
    : [];
  return Object.freeze({
    ...(regular ? { regular } : {}),
    styles,
    fallbacks: await resolveFallbackFontFaces(run, platform),
  });
}

async function windowsTerminalFontFaces(
  family: string | undefined,
  run: FontMetricsCommand,
): Promise<TerminalFontFaces> {
  const families = [
    ...(family === undefined ? [] : [family]),
    ...fallbackFontFamilies("win32"),
  ];
  const { stdout } = await run(
    windowsPowerShell(),
    ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_FONT_FACES_SCRIPT],
    {
      timeoutMs: 20_000,
      environment: {
        OMXTERM_FONT_FAMILY_COUNT: String(families.length),
        OMXTERM_FONT_STYLED_INDEX: family === undefined ? "" : "0",
        ...Object.fromEntries(
          families.map((name, index) => [`OMXTERM_FONT_FAMILY_${index}`, name]),
        ),
      },
    },
  );
  let entries: unknown;
  try {
    entries = JSON.parse(stdout);
  } catch {
    throw invalidFontFaces();
  }
  if (!Array.isArray(entries) || entries.length !== families.length)
    throw invalidFontFaces();
  const answers = entries.map((entry, index) => {
    try {
      return windowsFamilyFaces(
        entry,
        families[index]!,
        family !== undefined && index === 0,
      );
    } catch (error) {
      if (family !== undefined && index === 0) throw error;
      return undefined;
    }
  });
  const configured = family === undefined ? undefined : answers.shift();
  return Object.freeze({
    ...(configured?.regular ? { regular: configured.regular } : {}),
    styles: configured?.styles ?? [],
    fallbacks: Object.freeze(
      answers.flatMap((answer) => (answer?.regular ? [answer.regular] : [])),
    ),
  });
}

function windowsFamilyFaces(
  entry: unknown,
  family: string,
  styled: boolean,
): { regular?: InstalledFontFace; styles: readonly InstalledFontFace[] } {
  if (
    typeof entry !== "object" ||
    entry === null ||
    Array.isArray(entry) ||
    Object.keys(entry).length !== 2 ||
    !("regular" in entry) ||
    !("styles" in entry)
  )
    throw invalidFontFaces();
  const regular = installedFontFaceFromResult(entry.regular, "win32", 16);
  if (regular && regular.family !== family) throw invalidFontFaces();
  const styles = installedFontStyleFacesFromResult(entry.styles, family);
  if (styles.length > 0 && !(styled && regular)) throw invalidFontFaces();
  return { ...(regular ? { regular } : {}), styles };
}

function invalidFontFaces(): Error {
  return new Error("Installed font family lookup returned invalid data");
}

/**
 * Remembers each family's lookup for the main-process session. Callers still
 * read and validate the bytes on every load. A lookup that fails, finds no
 * configured family, or names a file that no longer exists is not reused, and
 * `forget` drops everything, for example after a User Configuration Reload.
 */
export function createTerminalFontFaceCache(
  lookup: TerminalFontFaceLookup = installedTerminalFontFaces,
) {
  const entries = new Map<string | undefined, Promise<TerminalFontFaces>>();
  const drop = (
    family: string | undefined,
    entry: Promise<TerminalFontFaces>,
  ) => {
    if (entries.get(family) === entry) entries.delete(family);
  };
  const start = (family: string | undefined) => {
    const entry = lookup(family);
    entries.set(family, entry);
    entry.then(
      (faces) => {
        if (family !== undefined && !faces.regular) drop(family, entry);
      },
      () => drop(family, entry),
    );
    return entry;
  };
  return {
    async lookup(family: string | undefined): Promise<TerminalFontFaces> {
      const entry = entries.get(family);
      if (!entry) return start(family);
      const faces = await entry;
      if (await allFilesExist(faces)) return faces;
      drop(family, entry);
      return entries.get(family) ?? start(family);
    },
    forget() {
      entries.clear();
    },
  };
}

async function allFilesExist(faces: TerminalFontFaces): Promise<boolean> {
  const paths = new Set(
    [faces.regular, ...faces.styles, ...faces.fallbacks].flatMap((face) =>
      face ? [face.path] : [],
    ),
  );
  const found = await Promise.all(
    [...paths].map((file) =>
      stat(file).then(
        (info) => info.isFile(),
        () => false,
      ),
    ),
  );
  return found.every(Boolean);
}
