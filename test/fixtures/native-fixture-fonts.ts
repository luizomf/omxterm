import { execFileSync } from "node:child_process";
import { beforeEach } from "vitest";

// macOS and Windows ship every family the native fixtures read. Linux depends
// on packages listed in docs/development.md#linux, so probe fontconfig
// directly (not through the product's discovery code under test) and skip
// with a reason instead of failing on an incomplete desktop. Each requirement
// is a fontconfig pattern, such as "DejaVu Sans Mono:style=Bold".
const installedPatterns = new Map<string, boolean>();

function installed(pattern: string): boolean {
  let found = installedPatterns.get(pattern);
  if (found === undefined) {
    try {
      found =
        execFileSync("fc-list", [pattern, "family"], {
          encoding: "utf8",
        }).trim() !== "";
    } catch {
      found = false; // Without fontconfig every fixture font counts as missing.
    }
    installedPatterns.set(pattern, found);
  }
  return found;
}

export function missingFixtureFontsReason(
  linuxPatternsRequired: readonly string[],
): string | undefined {
  if (process.platform !== "linux") return undefined;
  const missing = linuxPatternsRequired.filter(
    (pattern) => !installed(pattern),
  );
  if (missing.length === 0) return undefined;
  return `Fixture font not installed: ${missing.join(", ")} (see docs/development.md#linux)`;
}

/** DejaVu Sans Mono with the real faces that style tests compare. */
export const DEJAVU_SANS_MONO_STYLES = Object.freeze([
  "DejaVu Sans Mono",
  ...["Bold", "Oblique", "Bold Oblique"].map(
    (style) => `DejaVu Sans Mono:style=${style}`,
  ),
]);

/** Skip every test in the calling file when a Linux fixture font is absent. */
export function skipWithoutFixtureFonts(
  linuxPatternsRequired: readonly string[],
): void {
  const reason = missingFixtureFontsReason(linuxPatternsRequired);
  beforeEach((context) => {
    if (reason) context.skip(reason);
  });
}

/** Skip when nativeFixturePlatform's configured or reloaded font is absent. */
export function skipWithoutHostFixtureFonts(): void {
  skipWithoutFixtureFonts(["DejaVu Sans", "Liberation Mono"]);
}
